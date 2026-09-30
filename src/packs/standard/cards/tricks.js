// 非延时锦囊
import { defineCard, modify, skillName, cardByCN as cardDefByCN } from '../../../core/registry.js';
import { respond, playedLog, discardUsed } from '../../../core/card-use.js';
import { resolveTrick } from '../../../core/nullify-chain.js';
import { applyDamage } from '../../../core/damage.js';
import { useLabel } from '../../../core/util.js';
import { cardLabel, hasCardInArea, canTarget, blockerOf, canSecondTarget, legalTargets, ineffectiveBy } from '../../../data/cards.js';
import { resolveSlash } from './basic.js';
import {
  enemyFor, bestEnemy, aoeWorth, isShaCard, isEnemy, isFriend, relationOf, byThreat, pickArea, pickResponse,
} from '../../../ai/util.js';

// 该牌对目标无效（藤甲：南蛮入侵、万箭齐发）时写战报并返回 true：不询问无懈，直接跳过
export function immune(game, player, target, card) {
  const by = ineffectiveBy(game, player, target, card);
  if (by) game.log(`${target.name} 的【${skillName(by)}】生效，${useLabel(card)} 对其无效`);
  return !!by;
}

// 单目标锦囊：先置入处理区/弃牌堆，再询问无懈，未被抵消则执行效果
export const single = (name, apply) => async (game, { player, card, reals, targets }) => {
  const target = targets[0];
  game.discardCards(reals);
  if (immune(game, player, target, card)) return;
  await resolveTrick(game, { card: reals[0] || card, source: player, target, name, apply: () => apply(game, player, target, card) });
};

// 群体锦囊：依次对每名目标结算（结算途中阵亡的角色跳过）
const each = (name, list, apply, { pending = false, skip = () => false } = {}) => async (game, { player, card, reals }) => {
  game.discardCards(reals, { pending });
  for (const target of list(game, player)) {
    if (game.over) break;
    if (!target.alive || skip(target) || immune(game, player, target, card)) continue;
    await resolveTrick(game, { card: reals[0] || card, source: player, target, name, apply: () => apply(game, player, target, card) });
  }
};

// 从目标区域取一张牌（顺手牵羊获得 / 过河拆桥弃置）
async function takeFrom(game, player, target, card, reason, gain) {
  const pick = await game.ask(player, 'askChooseCards', {
    count: 1, from: 'target-area', reason, info: { target, card: card.real || card },
  });
  if (!pick?.length) return;
  const c = game.takeCardFromArea(target, pick[0]);
  if (!c) return;
  // 拿走友方判定区的乐/闪电是帮忙
  if (['le', 'shandian'].includes(pick[0])) game.recordRelation(player, target, 'help', 2);
  // 处理区同时展示被拿走/拆掉的牌（官方语义）
  if (game.lastAction) game.lastAction.spent = [c];
  const where = pick[0] === 'hand' ? '手牌' : '';
  if (gain) {
    player.hand.push(c);
    game.log(`${player.name} 获得了 ${target.name} 的${where} ${cardLabel(c)}`);
  } else {
    game.discardCards([c]);
    game.log(`${player.name} 弃置了 ${target.name} 的${where} ${cardLabel(c)}`);
  }
}

// ---------- 决斗（也供离间复用） ----------
// opts.noNullify：离间的【决斗】不能被【无懈可击】响应
export async function resolveJuedou(game, source, target, vcard, opts = {}) {
  const blocker = blockerOf(game, source, target, 'juedou');
  if (blocker) {
    discardUsed(game, vcard);
    game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}，【${skillName(blocker)}】生效，${target.name} 不能成为【决斗】的目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}`);
  game.pointAt(source, [target]);
  game.recordRelation(source, target, 'harm');
  discardUsed(game, vcard);
  await resolveTrick(game, {
    card: vcard.real || vcard, source, target, name: '决斗', noNullify: !!opts.noNullify,
    apply: async () => {
      // 决斗双方为使用者与目标，由目标先打出【杀】
      const other = p => (p === target ? source : target);
      let current = target;
      let guard = 0;
      while (!game.over && source.alive && target.alive && guard++ < 30) {
        // 需打出的【杀】数：1 + 对方的 extraResponses 修正（无双）
        const need = 1 + modify(other(current), 'extraResponses', 0, { kind: 'sha', from: other(current), to: current }, game);
        let played = 0;
        for (let i = 0; i < need; i++) {
          const v = await respond(game, current, {
            type: 'sha', reason: 'juedou', info: { vs: other(current), source, card: vcard, nth: i + 1, need },
          });
          if (!v) break;
          played++;
          playedLog(game, current, v, need > 1 ? `（第 ${played}/${need} 张）` : '');
        }
        if (played < need) {
          await applyDamage(game, other(current), current, 1, vcard);
          return;
        }
        current = other(current);
      }
    },
  });
}

export const juedou = defineCard({
  id: 'juedou', name: '决斗', type: 'trick', harmful: true, selfLog: true,
  target: {},
  use: (game, { player, card, targets }) => resolveJuedou(game, player, targets[0], card),
  ai: {
    order: 70, nullify: 'lowHp',
    play: (game, p, use) => {
      const t = enemyFor(game, p, use);
      const shaCount = p.hand.filter(isShaCard).length;
      return t && (shaCount >= 2 || t.hp <= 1) ? { card: use.card, targets: [t] } : null;
    },
    // 有余量就出（至少留 1 张杀防身）；濒临死亡时不惜代价
    respond: (game, p, req) => {
      const shas = p.hand.filter(isShaCard);
      if (shas.length >= 2 || (shas.length === 1 && p.hp > 2)) return shas[0];
      return p.hp <= 1 ? pickResponse(game, p, 'sha') : null;
    },
  },
  prompt: {
    respond: (req, h) => `你与 ${h.who(req.info?.vs)} 决斗中，请打出一张${h.cn(req.type)}，否则受到 1 点伤害${h.nth(req.info)}`,
  },
});

export const wuzhong = defineCard({
  id: 'wuzhong', name: '无中生有', type: 'trick',
  async use(game, { player, card, reals }) {
    game.discardCards(reals);
    await resolveTrick(game, {
      card: reals[0] || card, source: player, target: player, name: '无中生有',
      apply: async () => game.drawCards(player, 2),
    });
  },
  ai: { order: 40, play: (game, p, use) => ({ card: use.card, targets: [] }) },
  prompt: { use: () => '是否使用【无中生有】摸两张牌？' },
});

// 顺手牵羊/过河拆桥的 AI：友方判定区有乐时帮其拆掉，否则针对敌人
const areaPlay = (game, p, use) => {
  const ts = legalTargets(game, p, use.real, use.name);
  const rescue = game.mode === 'identity'
    && ts.find(t => isFriend(game, p, t) && t.judgeZone.some(j => (j.delayedAs || j.name) === 'le'));
  const t = rescue || bestEnemy(game, p, ts);
  return t ? { card: use.card, targets: [t] } : null;
};

export const shunshou = defineCard({
  id: 'shunshou', name: '顺手牵羊', type: 'trick', harmful: true, harm: 1,
  target: { distance: 1, ok: (game, from, to) => hasCardInArea(to) },
  use: single('顺手牵羊', (game, player, target, card) => takeFrom(game, player, target, card, 'shunshou', true)),
  ai: { order: 50, play: areaPlay, chooseCards: (game, p, opts) => pickArea(game, p, opts) },
  prompt: { zone: '获得' },
});

export const guohe = defineCard({
  id: 'guohe', name: '过河拆桥', type: 'trick', harmful: true, harm: 1,
  target: { ok: (game, from, to) => hasCardInArea(to) },
  use: single('过河拆桥', (game, player, target, card) => takeFrom(game, player, target, card, 'guohe', false)),
  ai: { order: 50, play: areaPlay, chooseCards: (game, p, opts) => pickArea(game, p, opts) },
  prompt: { zone: '弃置' },
});

export const nanman = defineCard({
  id: 'nanman', name: '南蛮入侵', type: 'trick', harmful: true, aoe: true,
  // 置入处理区（挂起）而非直接进弃牌堆：造成伤害后奸雄可获得此牌
  use: each('南蛮入侵', (game, p) => game.others(p), async (game, player, target, card) => {
    const v = await respond(game, target, { type: 'sha', reason: 'nanman', info: { source: player, card } });
    if (v) playedLog(game, target, v);
    else await applyDamage(game, player, target, 1, card.real || card);
  }, { pending: true }),
  ai: {
    order: 80, nullify: 'lowHp',
    play: (game, p, use) => (aoeWorth(game, p) ? { card: use.card, targets: [] } : null),
  },
  prompt: {
    use: (game) => `是否使用【南蛮入侵】？${game.players.length > 2 ? '其他角色依次' : '对方'}须打出一张【杀】，否则受到 1 点伤害`,
    respond: (req, h) => `${h.who(req.info?.source)} 使用了【南蛮入侵】，请打出一张${h.cn(req.type)}，否则受到 1 点伤害`,
  },
});

export const wanjian = defineCard({
  id: 'wanjian', name: '万箭齐发', type: 'trick', harmful: true, aoe: true,
  use: each('万箭齐发', (game, p) => game.others(p), async (game, player, target, card) => {
    const v = await respond(game, target, { type: 'shan', reason: 'wanjian', info: { source: player, card } });
    if (v) playedLog(game, target, v);
    else await applyDamage(game, player, target, 1, card.real || card);
  }, { pending: true }),
  ai: {
    order: 81, nullify: 'lowHp',
    play: (game, p, use) => (aoeWorth(game, p) ? { card: use.card, targets: [] } : null),
  },
  prompt: {
    use: (game) => `是否使用【万箭齐发】？${game.players.length > 2 ? '其他角色依次' : '对方'}须打出一张【闪】，否则受到 1 点伤害`,
    respond: (req, h) => `${h.who(req.info?.source)} 使用了【万箭齐发】，请打出一张${h.cn(req.type)}，否则受到 1 点伤害`,
  },
});

export const taoyuan = defineCard({
  id: 'taoyuan', name: '桃园结义', type: 'trick', aoe: true,
  // 未受伤的角色不会回复体力，官方跳过其结算（也不询问【无懈可击】）
  use: each('桃园结义', (game, p) => game.seatOrder(p), async (game, player, target) => game.heal(target, 1),
    { skip: t => t.hp >= t.maxHp }),
  ai: {
    order: 90,
    play: (game, p, use) => {
      const wounded = pred => game.alivePlayers().filter(x => x.hp < x.maxHp && pred(x)).length;
      const mine = wounded(x => isFriend(game, p, x));
      const theirs = wounded(x => !isFriend(game, p, x));
      return mine > 0 && mine >= theirs ? { card: use.card, targets: [] } : null;
    },
  },
  prompt: { use: () => '是否使用【桃园结义】？所有角色各回复 1 点体力' },
});

// 五谷丰登：选牌价值
const wuguValue = c => ({ tao: 9, wuzhong: 8 }[c.name] ?? (c.type === 'equip' ? 6 : 4));

export const wugu = defineCard({
  id: 'wugu', name: '五谷丰登', type: 'trick', aoe: true,
  async use(game, { player, card, reals }) {
    // 亮出张数 = 存活角色数
    const revealed = [];
    for (let i = 0; i < game.alivePlayers().length; i++) {
      const c = game.drawOne();
      if (c) revealed.push(c);
    }
    game.discardCards(reals);
    game.log(`【五谷丰登】亮出：${revealed.map(cardLabel).join('、')}`);
    // 供 UI 展示公共选牌面板：全部亮出的牌 + 已被谁选走
    game.wugu = { cards: [...revealed], taken: {} };
    game.notify();
    for (const target of game.seatOrder(player)) {
      if (game.over) break;
      if (!target.alive) continue;
      await resolveTrick(game, {
        card: reals[0] || card, source: player, target, name: '五谷丰登',
        apply: async () => {
          if (!revealed.length) return;
          const pick = await game.ask(target, 'askChooseCards', {
            count: 1, from: 'wugu', reason: 'wugu', info: { candidates: revealed },
          });
          const c = revealed.find(x => x.id === pick?.[0]?.id);
          if (!c) return;
          revealed.splice(revealed.indexOf(c), 1);
          target.hand.push(c);
          if (game.wugu) game.wugu.taken[c.id] = target.name;
          game.log(`${target.name} 获得 ${cardLabel(c)}`);
        },
      });
    }
    game.wugu = null;
    if (revealed.length) game.discardCards(revealed);
  },
  ai: {
    order: 91,
    play: (game, p, use) => ({ card: use.card, targets: [] }),
    chooseCards: (game, p, opts) => {
      const cands = opts.info?.candidates || [];
      return cands.length ? [[...cands].sort((a, b) => wuguValue(b) - wuguValue(a))[0]] : null;
    },
  },
  prompt: { use: () => '是否使用【五谷丰登】？亮出牌堆顶的牌，各角色依次选择一张' },
});

export const jiedao = defineCard({
  id: 'jiedao', name: '借刀杀人', type: 'trick', harmful: true, harm: 0.5,
  // 第一个目标：装备武器、且其攻击范围内存在可被【杀】的另一名角色（可以是使用者本人）
  target: {
    ok: (game, from, to) => !!to.equip.weapon
      && (game ? game.alivePlayers() : [from]).some(v => canSecondTarget(game, 'jiedao', from, to, v)),
  },
  // 第二个目标：持武器者需对其使用【杀】，故须是持武器者之外、其可以【杀】的角色
  victim: {
    ok: (game, from, holder, v) => v.seat !== holder.seat && canTarget(game, holder, v, 'sha'),
    log: v => `，令其对 ${v.name} 使用【杀】`,
  },
  async use(game, { player, card, reals, targets, victim }) {
    const holder = targets[0];
    game.discardCards(reals);
    await resolveTrick(game, {
      card: reals[0] || card, source: player, target: holder, name: '借刀杀人',
      apply: async () => {
        // 无懈链期间受害者可能已阵亡或不再合法：视为无法出【杀】
        const v = canSecondTarget(game, 'jiedao', player, holder, victim)
          ? await respond(game, holder, { type: 'sha', reason: 'jiedao', info: { victim, source: player, weapon: holder.equip.weapon } })
          : null;
        if (v) await resolveSlash(game, holder, victim, v);
        else if (holder.equip.weapon && player.alive) {
          const w = holder.equip.weapon;
          game.log(`${holder.name} 不出【杀】，${player.name} 获得其武器 ${cardLabel(w)}`);
          holder.clearEquip('weapon');
          player.hand.push(w);
        }
      },
    });
  },
  ai: {
    order: 75,
    // 借敌人的刀杀敌人（缴械也有收益）
    play: (game, p, use) => {
      const holders = legalTargets(game, p, use.real, use.name).filter(t => isEnemy(game, p, t)).sort(byThreat(game, p));
      for (const h of holders) {
        const victims = game.alivePlayers().filter(v => canSecondTarget(game, 'jiedao', p, h, v));
        const v = victims.filter(x => x !== p && isEnemy(game, p, x)).sort(byThreat(game, p))[0]
          || (game.mode === '1v1' ? victims[0] : null);
        if (v) return { card: use.card, targets: [h], victim: v };
      }
      return null;
    },
    // 被迫杀的若是友方，宁可交出武器
    respond: (game, p, req) => {
      const v = req.info?.victim;
      if (v && v !== p && game.mode === 'identity' && isFriend(game, p, v)) return null;
      return pickResponse(game, p, 'sha');
    },
  },
  prompt: {
    respond: (req, h) => `${h.who(req.info?.source)} 对你使用了【借刀杀人】，请对 ${h.who(req.info?.victim)} 使用一张${h.cn(req.type)}，否则将 ${req.info?.weapon ? h.label(req.info.weapon) : '武器'} 交给 ${h.who(req.info?.source)}`,
    firstTarget: '【借刀杀人】请选择一名装备有武器的角色',
    secondTarget: (holder, h) => `【借刀杀人】请选择 ${h.who(holder)} 使用【杀】的目标`,
    secondReady: (holder, v, h) => `【借刀杀人】令 ${h.who(holder)} 对 ${h.who(v)} 使用【杀】，点击「确定」`,
    secondHint: '须在其攻击范围内，可以是你自己',
  },
});

export const wuxie = defineCard({
  id: 'wuxie', name: '无懈可击', type: 'trick', respondOnly: true,
  ai: {
    value: 8,
    // 无懈可击的决策：保护自己与确定的友方免受有害锦囊，反制敌人的无懈
    nullify: (game, p, effect, wx) => {
      const { target, source } = effect;
      if (effect.isNullify) return source && source !== p && isEnemy(game, p, source) ? wx : null;
      const def = cardDefByCN(effect.name);
      if (!def?.harmful || !target) return null;
      if (target !== p && relationOf(game, p, target) < 1) return null;
      if (source && source !== p && isFriend(game, p, source) && relationOf(game, p, source) >= 1) return null;
      if (def.ai?.nullify === 'always') return wx;
      if (def.ai?.nullify === 'lowHp') return target.hp <= 2 ? wx : null;
      return null;
    },
  },
});

export default [juedou, wuzhong, shunshou, guohe, nanman, wanjian, taoyuan, wugu, jiedao, wuxie];
