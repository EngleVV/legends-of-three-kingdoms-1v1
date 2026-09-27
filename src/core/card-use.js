// 出牌/用牌结算
import {
  cardLabel, isRed, canTarget, CARD_NAME,
  canUseInPlayPhase, canUseZhangbaSha, canRespondWith, shaLeftOf,
  canUseCardAs, canZhangbaPair,
} from '../data/cards.js';
import { hasSkill } from '../data/heroes.js';
import { applyDamage } from './damage.js';
import { resolveTrick } from './nullify-chain.js';
import { doJudge } from './judge.js';
import { handCardOf, realsOf } from './util.js';

// ---------- 虚拟牌（武圣转化 / 丈八蛇矛双牌） ----------
// 虚拟牌可由一张或多张实体牌组成，实体牌统一放在 reals 数组里（real 保留为首张，便于日志/兼容）。
// name 与原牌同名时视为「纯包装」，保留原牌的 type/subType（装备牌必须保留 subType 才能进对应栏位）；
// 名称不同才是真正的转化（如红色牌当【杀】），此时按基本牌处理。
export function makeVirtual(card, name) {
  const converted = name !== card.name;
  return {
    id: card.id, real: card, reals: [card], name, suit: card.suit, rank: card.rank, virtual: true,
    type: converted ? 'basic' : card.type,
    subType: converted ? null : card.subType,
  };
}

// 多张实体牌合成一张虚拟牌（丈八蛇矛：两张手牌当【杀】）。合成牌无花色/点数。
export function makeVirtualFrom(cards, name) {
  return {
    id: cards[0].id, real: cards[0], reals: [...cards], name,
    suit: null, rank: null, virtual: true, type: 'basic', subType: null, composite: true,
  };
}

// 取出虚拟牌对应的全部实体牌（实现见 core/util.js，此处转出以便调用方统一从本模块引入）
export { realsOf };

export function toVirtual(r, defaultName) {
  if (!r) return null;
  if (r.cards) return makeVirtualFrom(r.cards, r.as || defaultName);
  if (r.card) return makeVirtual(r.card, r.as || defaultName);
  if (r.virtual) return r;
  return makeVirtual(r, r.name);
}

// 校验响应并转为虚拟牌；无效引用或非法「牌名冒充」一律返回 null
// 支持 {cards:[a,b], as:'sha'}（丈八蛇矛）与 {card, as} / 裸牌两种形态
export function validResponse(player, r, defaultName) {
  if (!r) return null;
  const asName = r.as || defaultName;

  if (Array.isArray(r.cards)) {
    // 丈八蛇矛：只能合成【杀】，需恰好两张、均在手牌中且互不相同
    if (asName !== 'sha') return null;
    if (!canZhangbaPair(player)) return null;
    const ids = new Set(r.cards.map(c => c && c.id));
    if (r.cards.length !== 2 || ids.size !== 2) return null;
    if (!r.cards.every(c => player.hand.some(h => h.id === c.id))) return null;
    return makeVirtualFrom(r.cards, asName);
  }

  const card = handCardOf(player, r);
  if (!card) return null;
  // 关键闸门：牌名必须与所需牌名一致，或存在合法转化途径（武圣）
  if (!canUseCardAs(player, card, asName)) return null;
  return makeVirtual(card, asName);
}

export function discardUsed(game, vcard) {
  const reals = realsOf(vcard);
  if (reals.length) game.discardCards(reals, { pending: true });
}

// ---------- 杀次数 ----------
// 单一判据见 data/cards.js 的 shaLeftOf（同步，供引擎/UI/AI 共用）
export function shaLimitLeft(game, player) {
  return shaLeftOf(player);
}

// ---------- 统一的响应询问 ----------
// 手里根本打不出所需的牌时直接跳过询问，避免对玩家反复弹出无意义的选择框。
async function askResponse(game, player, req) {
  if (!canRespondWith(player, req.type)) return null;
  const r = await game.ask(player, 'askRespondCard', req);
  return validResponse(player, r, req.type);
}

// ---------- 求闪（含八卦阵） ----------
// reason 透传给 UI 以显示正确的原因（'sha' = 被杀指定，'wanjian' = 万箭齐发）
async function askForShan(game, player, reason = 'sha') {
  if (player.equip.armor?.name === 'bagua') {
    const invoke = await game.ask(player, 'askSkillInvoke', 'bagua', {});
    if (invoke) {
      const jc = await doJudge(game, player, '八卦阵');
      if (isRed(jc)) {
        game.log(`${player.name} 八卦阵判定生效，视为打出【闪】`);
        return { bagua: true };
      }
      game.log('八卦阵判定未生效');
    }
  }
  const v = await askResponse(game, player, { type: 'shan', reason });
  if (!v) return null;
  player.removeFromHand(realsOf(v));
  return { vcard: v };
}

// ---------- 杀 ----------
export async function resolveSlash(game, source, target, vcard, opts = {}) {
  const blockedRes = await game.emit('becomeTarget', { card: vcard, source, target });
  if (game.blocked(blockedRes)) {
    discardUsed(game, vcard);
    game.log(`${target.name} 无法被指定为目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用【杀】${vcard.composite ? '（丈八蛇矛）' : ''}`);

  // 雌雄双股剑：指定异性目标时触发
  if (source.equip.weapon?.name === 'cixiong' && !opts.isChase
    && source.hero.gender !== target.hero.gender) {
    await cixiongEffect(game, source, target);
  }

  const needShan = hasSkill(source, 'wushuang') ? 2 : 1;
  let shanPlayed = 0;
  for (let i = 0; i < needShan; i++) {
    const shan = await askForShan(game, target);
    if (!shan) break;
    if (shan.vcard) discardUsed(game, shan.vcard);
    shanPlayed++;
  }

  let hit = shanPlayed < needShan;
  if (!hit && source.equip.weapon?.name === 'guanshi') {
    // 贯石斧：弃 2 张牌强制命中
    const give = await game.ask(source, 'askChooseCards', {
      count: 2, from: 'self', reason: 'guanshi', optional: true, info: { target },
    });
    if (give && give.length === 2) {
      source.removeFromHand(give);
      game.discardCards(give);
      game.log(`${source.name} 发动【贯石斧】弃 2 张牌，强制命中`);
      hit = true;
    }
  }

  discardUsed(game, vcard);
  if (hit) {
    // 传入虚拟牌：合成牌（丈八蛇矛）时奸雄可获得其全部实体牌
    await applyDamage(game, source, target, 1, vcard);
    // 麒麟弓：命中后弃对方一匹马
    if (source.equip.weapon?.name === 'qilin' && !game.over) {
      if (target.equip['horse+'] || target.equip['horse-']) {
        const pick = await game.ask(source, 'askChooseCards', {
          count: 1, from: 'horse', reason: 'qilin', optional: true, info: { target },
        });
        if (pick && pick.length === 1) {
          const slot = pick[0];
          await game.loseEquip(target, slot);
        }
      }
    }
  } else {
    game.log(`${target.name} 闪避了【杀】`);
    // 青龙偃月刀：被闪后可追加杀
    if (source.equip.weapon?.name === 'qinglong' && !game.over && !opts.isChase) {
      const chase = await askResponse(game, source, { type: 'sha', reason: 'qinglong', info: { target } });
      if (chase) {
        source.removeFromHand(realsOf(chase));
        await resolveSlash(game, source, target, chase, { isChase: true });
      }
    }
  }
}

async function cixiongEffect(game, source, target) {
  const invoke = await game.ask(source, 'askSkillInvoke', 'cixiong', { target });
  if (!invoke) return;
  game.log(`${source.name} 发动【雌雄双股剑】`);
  if (target.hand.length > 0) {
    const give = await game.ask(target, 'askChooseCards', {
      count: 1, from: 'self', reason: 'cixiong-discard', optional: true,
    });
    if (give && give.length === 1) {
      target.removeFromHand(give);
      game.discardCards(give);
      game.log(`${target.name} 弃 1 张手牌`);
      return;
    }
  }
  game.drawCards(source, 1);
  game.log(`${target.name} 不弃牌，${source.name} 摸 1 张牌`);
}

// ---------- 决斗 ----------
export async function resolveJuedou(game, source, target, vcard) {
  const blockedRes = await game.emit('becomeTarget', { card: vcard, source, target });
  if (game.blocked(blockedRes)) {
    discardUsed(game, vcard);
    game.log(`${target.name} 无法被指定为目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用【决斗】`);
  discardUsed(game, vcard);
  await resolveTrick(game, {
    card: vcard.real, source, target, name: '决斗',
    apply: async () => {
      let current = target;
      let guard = 0;
      while (!game.over && guard++ < 30) {
        // 无双：与吕布决斗时，非吕布一方每次需打出两张杀
        const need = hasSkill(game.opponentOf(current), 'wushuang') ? 2 : 1;
        let played = 0;
        for (let i = 0; i < need; i++) {
          const v = await askResponse(game, current, { type: 'sha', reason: 'juedou', info: { vs: game.opponentOf(current) } });
          if (!v) break;
          current.removeFromHand(realsOf(v));
          game.discardCards(realsOf(v), { pending: true });
          played++;
        }
        if (played < need) {
          await applyDamage(game, game.opponentOf(current), current, 1, vcard);
          return;
        }
        current = game.opponentOf(current);
      }
    },
  });
}

// ---------- 锦囊 ----------
// 需要指定目标的牌：结算前必须校验目标合法性（距离/空城/重复乐等）
const NEED_TARGET = ['sha', 'juedou', 'le', 'shunshou', 'guohe', 'jiedao'];

export async function resolveCardUse(game, player, action) {
  const { card: raw, targets = [] } = action;
  // 统一为虚拟牌形态：cards 为多张时是丈八蛇矛的合成【杀】，单张则包装一层
  const composite = Array.isArray(action.cards) && action.cards.length > 1;
  const card = composite
    ? makeVirtualFrom(action.cards, 'sha')
    : (raw.virtual ? raw : makeVirtual(raw, raw.name));
  const reals = realsOf(card);

  const reject = why => {
    game.log(`${player.name} 的【${CARD_NAME[card.name] || card.name}】${why}，取消使用`);
  };

  // 1) 实体牌必须都在手牌中且互不相同
  const ids = new Set(reals.map(c => c.id));
  if (ids.size !== reals.length) return;
  if (!reals.every(c => player.hand.some(h => h.id === c.id))) return;

  // 2) 出牌阶段可用性（闪/无懈不可主动使用、杀的次数上限、各锦囊使用条件、转化途径）
  if (composite) {
    if (!canUseZhangbaSha(game, player)) { reject('无法以两张手牌当【杀】使用'); return; }
  } else if (!canUseInPlayPhase(game, player, reals[0], card.name)) {
    reject('当前不可使用');
    return;
  }

  // 3) 目标合法性（距离/空城/重复乐/对方有武器等）
  if (NEED_TARGET.includes(card.name)) {
    const target = targets[0];
    if (!target || !canTarget(game, player, target, card.name)) { reject('目标不合法'); return; }
  }

  player.removeFromHand(reals);
  // 记录最近一次出牌，供 UI 中央处理区展示
  game.lastAction = { player, card, targets: [...targets] };
  game.notify();

  switch (card.name) {
    case 'sha': {
      if (!targets.length) return;
      player.flags.shaUsed = (player.flags.shaUsed || 0) + 1;
      await resolveSlash(game, player, targets[0], card);
      break;
    }
    case 'tao': {
      if (player.hp < player.maxHp) game.heal(player, 1);
      else game.log(`${player.name} 体力已满，【桃】无效`);
      game.discardCards([card.real || card]);
      break;
    }
    case 'juedou': {
      await resolveJuedou(game, player, targets[0], card);
      break;
    }
    case 'wuzhong': {
      game.discardCards([card.real || card]);
      await resolveTrick(game, {
        card: card.real || card, source: player, target: player, name: '无中生有',
        apply: async () => game.drawCards(player, 2),
      });
      break;
    }
    case 'shunshou': {
      const target = targets[0];
      game.discardCards([card.real || card]);
      await resolveTrick(game, {
        card: card.real || card, source: player, target, name: '顺手牵羊',
        apply: async () => {
          const pick = await game.ask(player, 'askChooseCards', {
            count: 1, from: 'target-area', reason: 'shunshou', info: { target },
          });
          if (!pick || pick.length === 0) return;
          const c = game.takeCardFromArea(target, pick[0]);
          if (!c) return;
          player.hand.push(c);
          game.log(pick[0] === 'hand'
            ? `${player.name} 获得了 ${target.name} 的一张手牌`
            : `${player.name} 获得了 ${cardLabel(c)}`);
        },
      });
      break;
    }
    case 'guohe': {
      const target = targets[0];
      game.discardCards([card.real || card]);
      await resolveTrick(game, {
        card: card.real || card, source: player, target, name: '过河拆桥',
        apply: async () => {
          const pick = await game.ask(player, 'askChooseCards', {
            count: 1, from: 'target-area', reason: 'guohe', info: { target },
          });
          if (!pick || pick.length === 0) return;
          const c = game.takeCardFromArea(target, pick[0]);
          if (!c) return;
          game.discardCards([c]);
          game.log(pick[0] === 'hand'
            ? `${player.name} 弃置了 ${target.name} 的一张手牌`
            : `${player.name} 弃置了 ${cardLabel(c)}`);
        },
      });
      break;
    }
    case 'nanman': {
      game.discardCards([card.real || card]);
      for (const target of game.seatOrder(player).filter(p => p !== player)) {
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '南蛮入侵',
          apply: async () => {
            const v = await askResponse(game, target, { type: 'sha', reason: 'nanman' });
            if (v) {
                target.removeFromHand(realsOf(v));
                game.discardCards(realsOf(v));
                game.log(`${target.name} 打出【杀】响应`);
            } else {
              await applyDamage(game, player, target, 1, card.real || card);
            }
          },
        });
      }
      break;
    }
    case 'wanjian': {
      game.discardCards([card.real || card]);
      for (const target of game.seatOrder(player).filter(p => p !== player)) {
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '万箭齐发',
          apply: async () => {
            const shan = await askForShan(game, target, 'wanjian');
            if (shan) {
              if (shan.vcard) discardUsed(game, shan.vcard);
              game.log(`${target.name} 打出【闪】响应`);
            } else {
              await applyDamage(game, player, target, 1, card.real || card);
            }
          },
        });
      }
      break;
    }
    case 'taoyuan': {
      game.discardCards([card.real || card]);
      for (const target of game.seatOrder(player)) {
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '桃园结义',
          apply: async () => game.heal(target, 1),
        });
      }
      break;
    }
    case 'wugu': {
      const n = game.players.length;
      const revealed = [];
      for (let i = 0; i < n; i++) {
        const c = game.drawOne();
        if (c) revealed.push(c);
      }
      game.discardCards([card.real || card]);
      game.log(`【五谷丰登】亮出：${revealed.map(cardLabel).join('、')}`);
      for (const target of game.seatOrder(player)) {
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '五谷丰登',
          apply: async () => {
            if (revealed.length === 0) return;
            const pick = await game.ask(target, 'askChooseCards', {
              count: 1, from: 'wugu', reason: 'wugu', info: { candidates: revealed },
            });
            if (pick && pick.length === 1) {
              const c = pick[0];
              revealed.splice(revealed.findIndex(x => x.id === c.id), 1);
              target.hand.push(c);
              game.log(`${target.name} 获得 ${cardLabel(c)}`);
            }
          },
        });
      }
      if (revealed.length) game.discardCards(revealed);
      break;
    }
    case 'jiedao': {
      const target = targets[0]; // 持武器者
      const victim = action.victim || player; // 1v1 中即使用者自己
      game.discardCards([card.real || card]);
      await resolveTrick(game, {
        card: card.real || card, source: player, target, name: '借刀杀人',
        apply: async () => {
          const v = await askResponse(game, target, { type: 'sha', reason: 'jiedao', info: { victim } });
          if (v) {
            target.removeFromHand(realsOf(v));
            await resolveSlash(game, target, victim, v);
          } else {
            game.log(`${target.name} 不出【杀】，武器归 ${player.name}`);
            const w = target.equip.weapon;
            target.equip.weapon = null;
            player.hand.push(w);
          }
        },
      });
      break;
    }
    case 'le': {
      const target = targets[0];
      target.judgeZone.push(card);
      game.log(`${player.name} 对 ${target.name} 使用【乐不思蜀】`);
      break;
    }
    case 'shandian': {
      player.judgeZone.push(card);
      game.log(`${player.name} 使用【闪电】`);
      break;
    }
    case 'shan':
    case 'wuxie':
      // 不能主动使用
      game.discardCards([card.real || card]);
      break;
    default: {
      // 装备牌
      if (card.type === 'equip') {
        game.equipCard(player, card.real || card);
      } else {
        game.discardCards([card.real || card]);
      }
    }
  }
}

// ---------- 主动技能（仁德/制衡） ----------
export async function useSkill(game, player, action) {
  if (action.skillId === 'rende') {
    const cards = action.cards.filter(c => player.hand.some(h => h.id === c.id));
    if (!cards.length) return;
    player.removeFromHand(cards);
    const opp = game.opponentOf(player);
    opp.hand.push(...cards);
    player.flags.rendeGiven += cards.length;
    game.log(`${player.name} 发动【仁德】，将 ${cards.map(cardLabel).join('、')} 交给 ${opp.name}`);
    if (player.flags.rendeGiven >= 2 && !player.flags.rendeHealed) {
      player.flags.rendeHealed = true;
      game.heal(player, 1);
    }
  } else if (action.skillId === 'zhiheng') {
    if (player.flags.zhihengUsed) return;
    // 官方「弃置任意张牌」不限手牌，装备区的牌同样可以弃置
    const cards = (action.cards || []).filter(c =>
      player.hand.some(h => h.id === c.id)
      || Object.values(player.equip).some(e => e && e.id === c.id));
    if (!cards.length) return;
    player.flags.zhihengUsed = true;
    const handCards = cards.filter(c => player.hand.some(h => h.id === c.id));
    player.removeFromHand(handCards);
    for (const c of cards) {
      if (handCards.some(h => h.id === c.id)) continue;
      const slot = Object.keys(player.equip).find(k => player.equip[k]?.id === c.id);
      if (slot) player.equip[slot] = null;
    }
    game.discardCards(cards);
    game.log(`${player.name} 发动【制衡】，弃置 ${cards.map(cardLabel).join('、')}`);
    game.drawCards(player, cards.length);
  }
}
