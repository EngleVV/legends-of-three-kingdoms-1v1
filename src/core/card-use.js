// 出牌/用牌结算
import {
  cardLabel, canTarget,
  canUseInPlayPhase, canUseZhangbaSha, canRespondWith, shaLeftOf,
  canUseCardAs, canZhangbaPair, judgeEffective, armorOf, renwangBlocks, hasCard,
  canUseAsSha, equipCardOf, afterLosing, canJiedaoVictim, NEED_TARGET, lordHelpers, canUseJijiang,
  conversionOf, typeOfName, isRed, inAttackRange, cardColor,
} from '../data/cards.js';
import { validateSkill } from '../data/active-skills.js';
import { hasSkill, isMale } from '../data/heroes.js';
import { applyDamage } from './damage.js';
import { resolveTrick } from './nullify-chain.js';
import { doJudge } from './judge.js';
import { handCardOf, realsOf, useLabel } from './util.js';

// ---------- 虚拟牌（武圣转化 / 丈八蛇矛双牌） ----------
// 虚拟牌可由一张或多张实体牌组成，实体牌统一放在 reals 数组里（real 保留为首张，便于日志/兼容）。
// name 与原牌同名时视为「纯包装」，保留原牌的 type/subType（装备牌必须保留 subType 才能进对应栏位）；
// 名称不同才是真正的转化（如红色牌当【杀】），此时按基本牌处理。
// via：转化所依据的技能 id（武圣/龙胆/倾国/奇袭/国色/急救），用于战报「当【X】（技能）」
export function makeVirtual(card, name, via = null) {
  const converted = name !== card.name;
  return {
    id: card.id, real: card, reals: [card], name, suit: card.suit, rank: card.rank, virtual: true,
    type: converted ? typeOfName(name) : card.type,
    subType: converted ? null : card.subType,
    ...(via ? { via } : {}),
  };
}

// 实体牌以 name 使用/打出时的规范化虚拟牌（自动补上转化技来源）
export function virtualAs(player, card, name, game = null) {
  const cv = conversionOf(player, card, name, game);
  return makeVirtual(card, name, cv?.skill || null);
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
export function validResponse(player, r, defaultName, game = null) {
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

  // 手牌，或（经允许装备素材的转化技）装备区的牌
  const card = handCardOf(player, r) || equipCardOf(player, r.card || r);
  if (!card) return null;
  // 关键闸门：牌名必须与所需牌名一致，或存在合法转化途径（见 CONVERSIONS）
  if (!canUseCardAs(player, card, asName, game)) return null;
  return virtualAs(player, card, asName, game);
}

export function discardUsed(game, vcard) {
  const reals = realsOf(vcard);
  if (reals.length) game.discardCards(reals, { pending: true });
}

// 集智：使用一张非延时锦囊牌时可以摸一张牌
export async function jizhi(game, player) {
  if (!hasSkill(player, 'jizhi') || !player.alive || game.over) return;
  if (!await game.ask(player, 'askSkillInvoke', 'jizhi', {})) return;
  game.log(`${player.name} 发动【集智】`);
  game.drawCards(player, 1);
}

// ---------- 杀次数 ----------
// 单一判据见 data/cards.js 的 shaLeftOf（同步，供引擎/UI/AI 共用）
export function shaLimitLeft(game, player) {
  return shaLeftOf(player);
}

// ---------- 统一的响应询问 ----------
// 手里根本打不出所需的牌时直接跳过询问，避免对玩家反复弹出无意义的选择框。
async function askResponse(game, player, req) {
  const v = await askResponseRaw(game, player, req);
  // 克己：记录自己出牌阶段内打出过【杀】
  if (v && req.type === 'sha' && game.currentTurnSeat === player.seat && game.currentPhase === 'play') {
    player.flags.shaPlayed = true;
  }
  return v;
}

async function askResponseRaw(game, player, req) {
  const own = canRespondWith(player, req.type, game);
  // 主公技 激将/护驾：可先令同势力角色代为打出（视为由主公使用或打出）
  const helpers = lordHelpers(game, player, req.type);
  if (helpers.length) {
    const skill = req.type === 'sha' ? 'jijiang' : 'hujia';
    const invoke = await game.ask(player, 'askSkillInvoke', skill, { req, hasOwn: own });
    if (invoke) {
      const v = await askHelpers(game, player, skill, req.type, helpers, req);
      if (v) return v;
    }
  }
  if (!own) return null;
  const r = await game.ask(player, 'askRespondCard', req);
  return validResponse(player, r, req.type, game);
}

// 依次询问同势力角色是否代主公打出所需的牌；返回代出的虚拟牌（已从代出者处移除）
async function askHelpers(game, lord, skill, type, helpers, req = {}) {
  const sname = skill === 'jijiang' ? '激将' : '护驾';
  game.log(`${lord.name} 发动【${sname}】`);
  for (const h of helpers) {
    if (game.over || !h.alive) continue;
    if (!canRespondWith(h, type, game)) continue;
    const r = await game.ask(h, 'askRespondCard', { type, reason: skill, info: { lord, orig: req.reason, ...(req.info || {}) } });
    const v = validResponse(h, r, type, game);
    if (v) {
      h.removeCards(realsOf(v));
      game.log(`${h.name} 响应【${sname}】，代 ${lord.name} 打出 ${useLabel(v)}`);
      v.by = h;
      return v;
    }
  }
  game.log(`无人响应【${sname}】`);
  return null;
}

// ---------- 求闪（含八卦阵） ----------
// reason 透传给 UI 以显示正确的原因（'sha' = 被杀指定，'wanjian' = 万箭齐发）
// source：【杀】的使用者（青釭剑无视防具）；万箭齐发等非【杀】场景为 null
// info：提示用上下文 { source 使用者, card 所响应的牌, nth/need 无双需第几张 }
async function askForShan(game, player, reason = 'sha', source = null, info = {}) {
  if (armorOf(player, reason === 'sha' ? source : null)?.name === 'bagua') {
    const invoke = await game.ask(player, 'askSkillInvoke', 'bagua', { reason, ...info, source });
    if (invoke) {
      game.log(`${player.name} 发动【八卦阵】`);
      const jc = await doJudge(game, player, '八卦阵');
      if (judgeEffective('八卦阵', jc)) {
        game.log(`${player.name} 八卦阵判定生效（${cardLabel(jc)} 为红色），视为打出【闪】`);
        return { bagua: true };
      }
      game.log(`${player.name} 的【八卦阵】判定未生效（${cardLabel(jc)} 为黑色）`);
    }
  }
  const v = await askResponse(game, player, { type: 'shan', reason, info: { ...info, source } });
  if (!v) return null;
  player.removeCards(realsOf(v));
  return { vcard: v };
}

// ---------- 杀 ----------
export async function resolveSlash(game, source, target, vcard, opts = {}) {
  const blockedRes = await game.emit('becomeTarget', { card: vcard, source, target });
  if (game.blocked(blockedRes)) {
    discardUsed(game, vcard);
    game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}，${target.name} 无法被指定为目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}`);
  game.pointAt(source, [target]);
  game.recordRelation(source, target, 'harm');
  const weapon = () => source.equip.weapon?.name;

  // 流离（成为【杀】的目标时）：弃一张牌，将此【杀】转移给攻击范围内的另一名角色（不能是使用者）
  target = await liuli(game, source, target, vcard);

  // 铁骑（指定目标后）：判定为红色，目标不能使用【闪】响应此【杀】
  let noShan = false;
  if (hasSkill(source, 'tieji') && !game.over
    && await game.ask(source, 'askSkillInvoke', 'tieji', { target })) {
    game.log(`${source.name} 发动【铁骑】`);
    const jc = await doJudge(game, source, '铁骑');
    noShan = judgeEffective('铁骑', jc);
    game.log(noShan ? `【铁骑】判定为红色，${target.name} 不能使用【闪】` : '【铁骑】判定为黑色，无效果');
  }

  // 雌雄双股剑：指定异性目标后触发
  if (weapon() === 'cixiong' && source.hero.gender !== target.hero.gender) {
    await cixiongEffect(game, source, target);
  }

  // 仁王盾（锁定技）：黑色【杀】无效。青釭剑无视防具。
  if (renwangBlocks(source, target, vcard)) {
    discardUsed(game, vcard);
    game.log(`${target.name} 的【仁王盾】生效，黑色【杀】对其无效`);
    return;
  }
  if (target.equip.armor && !armorOf(target, source)) {
    game.log(`${source.name} 的【青釭剑】无视 ${target.name} 的防具`);
  }

  const needShan = hasSkill(source, 'wushuang') ? 2 : 1;
  let shanPlayed = 0;
  for (let i = 0; i < needShan && !noShan; i++) {
    const shan = await askForShan(game, target, 'sha', source, { card: vcard, nth: i + 1, need: needShan });
    if (!shan) break;
    if (shan.vcard) {
      discardUsed(game, shan.vcard);
      const nth = needShan > 1 ? `（第 ${i + 1}/${needShan} 张）` : '';
      game.log(`${target.name} 打出 ${useLabel(shan.vcard)}${nth}`);
    }
    shanPlayed++;
  }

  let hit = shanPlayed < needShan;
  if (!hit && weapon() === 'guanshi') {
    // 贯石斧：弃置两张牌（手牌或装备区，不含贯石斧本身）令此【杀】依然造成伤害
    const axe = source.equip.weapon;
    const pool = [...source.hand, ...Object.values(source.equip).filter(e => e && e.id !== axe.id)];
    if (pool.length >= 2) {
      const give = await game.ask(source, 'askChooseCards', {
        count: 2, from: 'self', reason: 'guanshi', optional: true, includeEquip: true, info: { target },
      });
      const ok = give && give.length === 2 && new Set(give.map(c => c?.id)).size === 2
        && give.every(c => pool.some(x => x.id === c.id));
      if (ok) {
        source.removeCards(give);
        game.discardCards(give);
        game.log(`${source.name} 发动【贯石斧】，弃置 ${give.map(cardLabel).join('、')}，强制命中`);
        hit = true;
      }
    }
  }

  discardUsed(game, vcard);
  if (hit) {
    // 「使用【杀】对目标造成伤害时」的武器效果（寒冰剑/麒麟弓），在伤害结算前触发
    const prevented = await beforeSlashDamage(game, source, target);
    if (prevented || game.over) return;
    // 传入虚拟牌：合成牌（丈八蛇矛）时奸雄可获得其全部实体牌；裸衣令伤害 +1
    await applyDamage(game, source, target, luoyiDamage(source, 1), vcard);
  } else {
    game.log(`${target.name} 闪避了【杀】`);
    // 青龙偃月刀：【杀】被【闪】抵消后可对同一目标再使用一张【杀】（可连续发动；不计入次数）
    if (weapon() === 'qinglong' && !game.over) {
      const chase = await askResponse(game, source, { type: 'sha', reason: 'qinglong', info: { target, source } });
      if (chase) {
        source.removeCards(realsOf(chase));
        game.log(`${source.name} 发动【青龙偃月刀】`);
        await resolveSlash(game, source, target, chase, { isChase: true });
      }
    }
  }
}

// 裸衣：本回合使用【杀】/【决斗】对目标造成的伤害 +1（标记在裸衣者自己的回合内有效）
function luoyiDamage(source, base) {
  return source?.flags?.luoyi ? base + 1 : base;
}

// 流离：返回此【杀】的最终目标
async function liuli(game, source, target, vcard) {
  if (!hasSkill(target, 'liuli') || game.over) return target;
  const hasOne = target.hand.length + Object.values(target.equip).filter(Boolean).length > 0;
  const candidates = game.others(target).filter(p => p.seat !== source.seat
    && inAttackRange(target, p, game) && canTarget(game, source, p, 'sha'));
  if (!hasOne || !candidates.length) return target;
  const pick = await game.ask(target, 'askChoosePlayers', {
    reason: 'liuli', candidates, min: 1, max: 1, optional: true, info: { source, card: vcard },
  });
  const to = pick?.[0];
  if (!to || !candidates.includes(to)) return target;
  const give = await game.ask(target, 'askChooseCards', {
    count: 1, from: 'self', reason: 'liuli', optional: false, includeEquip: true, info: { to },
  });
  const own = [...target.hand, ...Object.values(target.equip).filter(Boolean)];
  const c = own.find(x => x.id === give?.[0]?.id) || target.hand[0] || own[0];
  target.removeCards([c]);
  game.discardCards([c]);
  game.log(`${target.name} 发动【流离】，弃置 ${cardLabel(c)}，将【杀】转移给 ${to.name}`);
  game.pointAt(source, [to]);
  game.recordRelation(target, to, 'harm');
  return to;
}

// 返回 true 表示伤害被防止（寒冰剑）
async function beforeSlashDamage(game, source, target) {
  const w = source.equip.weapon?.name;
  if (w === 'hanbing' && hasCard(target)) {
    const invoke = await game.ask(source, 'askSkillInvoke', 'hanbing', { target });
    if (invoke) {
      game.log(`${source.name} 发动【寒冰剑】，防止此伤害`);
      // 依次弃置其两张牌（手牌或装备区）
      for (let i = 0; i < 2 && hasCard(target); i++) {
        const pick = await game.ask(source, 'askChooseCards', {
          count: 1, from: 'target-area', reason: 'hanbing', noJudge: true, info: { target },
        });
        const zone = pick?.[0] || 'hand';
        const c = game.takeCardFromArea(target, zone === 'hand' || target.equip[zone] ? zone : 'hand');
        if (!c) break;
        game.discardCards([c]);
        game.log(`${source.name} 弃置了 ${target.name} 的${zone === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
      }
      return true;
    }
  }
  if (w === 'qilin' && (target.equip['horse+'] || target.equip['horse-'])) {
    // 麒麟弓：造成伤害时，可弃置其装备区里的一张坐骑牌
    const pick = await game.ask(source, 'askChooseCards', {
      count: 1, from: 'horse', reason: 'qilin', optional: true, info: { target },
    });
    const slot = pick?.[0];
    if ((slot === 'horse+' || slot === 'horse-') && target.equip[slot]) {
      game.log(`${source.name} 发动【麒麟弓】`);
      await game.loseEquip(target, slot);
    }
  }
  return false;
}

async function cixiongEffect(game, source, target) {
  const invoke = await game.ask(source, 'askSkillInvoke', 'cixiong', { target });
  if (!invoke) return;
  game.log(`${source.name} 发动【雌雄双股剑】`);
  if (target.hand.length > 0) {
    const give = await game.ask(target, 'askChooseCards', {
      count: 1, from: 'self', reason: 'cixiong-discard', optional: true, info: { source },
    });
    if (give && give.length === 1 && target.hand.some(h => h.id === give[0]?.id)) {
      target.removeFromHand(give);
      game.discardCards(give);
      game.log(`${target.name} 弃置 ${cardLabel(give[0])}`);
      return;
    }
  }
  game.log(`${target.name} 不弃牌`);
  game.drawCards(source, 1);
}

// ---------- 决斗 ----------
// opts.noNullify：离间的【决斗】不能被【无懈可击】响应
export async function resolveJuedou(game, source, target, vcard, opts = {}) {
  const blockedRes = await game.emit('becomeTarget', { card: vcard, source, target });
  if (game.blocked(blockedRes)) {
    discardUsed(game, vcard);
    game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}，${target.name} 无法被指定为目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}`);
  game.pointAt(source, [target]);
  game.recordRelation(source, target, 'harm');
  discardUsed(game, vcard);
  await resolveTrick(game, {
    card: vcard.real, source, target, name: '决斗', noNullify: !!opts.noNullify,
    apply: async () => {
      // 决斗双方为使用者与目标，由目标先打出【杀】
      const other = p => (p === target ? source : target);
      let current = target;
      let guard = 0;
      while (!game.over && source.alive && target.alive && guard++ < 30) {
        // 无双：与吕布决斗时，非吕布一方每次需打出两张杀
        const need = hasSkill(other(current), 'wushuang') ? 2 : 1;
        let played = 0;
        for (let i = 0; i < need; i++) {
          const v = await askResponse(game, current, {
            type: 'sha', reason: 'juedou',
            info: { vs: other(current), source, card: vcard, nth: i + 1, need },
          });
          if (!v) break;
          current.removeCards(realsOf(v));
          game.discardCards(realsOf(v), { pending: true });
          played++;
          game.log(`${current.name} 打出 ${useLabel(v)}${need > 1 ? `（第 ${played}/${need} 张）` : ''}`);
        }
        if (played < need) {
          await applyDamage(game, other(current), current, luoyiDamage(other(current), 1), vcard);
          return;
        }
        current = other(current);
      }
    },
  });
}

// ---------- 锦囊 ----------
// 需要指定目标的牌（NEED_TARGET，见 data/cards.js）：结算前必须校验目标合法性（距离/空城/重复乐等）

export async function resolveCardUse(game, player, action) {
  const { card: raw, targets = [] } = action;
  // 统一为虚拟牌形态：cards 为多张时是丈八蛇矛的合成【杀】；单张按「实体牌 + 使用名」重新规范化，
  // 由引擎自己判定转化来源（不信任调用方传入的 type/via）
  const composite = Array.isArray(action.cards) && action.cards.length > 1;
  const real = raw.virtual ? (raw.real || raw.reals?.[0] || raw) : raw;
  const card = composite
    ? makeVirtualFrom(action.cards, 'sha')
    : virtualAs(player, real, raw.name, game);
  const reals = realsOf(card);

  const reject = why => {
    game.log(`${player.name} 使用 ${useLabel(card)} 失败（${why}），取消使用`);
  };

  // 1) 实体牌必须互不相同，且都在手牌中；例外是允许装备素材的转化技（武圣/奇袭/国色）使用装备区的牌
  const ids = new Set(reals.map(c => c.id));
  if (ids.size !== reals.length) return;
  const equipOk = c => !composite && !!equipCardOf(player, c) && !!conversionOf(player, c, card.name, game)?.equip;
  if (!reals.every(c => player.hand.some(h => h.id === c.id) || equipOk(c))) return;

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
    // 以装备区的牌当【杀】时按失去该装备后的距离/攻击范围判定
    if (!target || !target.alive || !canTarget(game, afterLosing(player, reals), target, card.name)) { reject('目标不合法'); return; }
  }
  // 借刀杀人的第二个目标：持武器者攻击范围内的另一名角色（1v1 默认为使用者本人）
  let victim = null;
  if (card.name === 'jiedao') {
    victim = action.victim || (game.mode === '1v1' ? player : null);
    if (!canJiedaoVictim(game, player, targets[0], victim)) { reject('【杀】的目标不合法'); return; }
  }

  player.removeCards(reals);
  game.lastGive = null; // 新的出牌开始，清除上一次的交付提示
  // 记录最近一次出牌，供 UI 中央处理区展示
  game.lastAction = { player, card, targets: [...targets] };
  // 战报：谁、对谁、使用了哪张牌（杀/决斗在各自结算中记录，装备记「装备了」）
  if (!['sha', 'juedou'].includes(card.name) && card.type !== 'equip') {
    const to = targets.length ? `对 ${targets.map(t => t.name).join('、')} ` : '';
    const extra = victim && game.mode !== '1v1' ? `，令其对 ${victim.name} 使用【杀】` : '';
    game.log(`${player.name} ${to}使用 ${useLabel(card)}${extra}`);
    // 指示线：指定目标的锦囊指向目标；群体锦囊（南蛮/万箭/桃园/五谷）指向其余角色
    const aoe = ['nanman', 'wanjian', 'taoyuan', 'wugu'].includes(card.name);
    game.pointAt(player, aoe ? game.others(player) : targets);
    // 公开行为：顺/拆/乐/借刀对目标有害（拆顺判定区的牌时再改记为有益）
    if (['shunshou', 'guohe', 'le', 'jiedao'].includes(card.name)) {
      for (const t of targets) game.recordRelation(player, t, 'harm', card.name === 'jiedao' ? 0.5 : 1);
    }
  }
  game.notify();
  // 集智：使用非延时锦囊（含决斗、奇袭当的过河拆桥）时可以摸一张牌
  if (card.type === 'trick') await jizhi(game, player);

  switch (card.name) {
    case 'sha': {
      if (!targets.length) return;
      player.flags.shaUsed = (player.flags.shaUsed || 0) + 1;
      await resolveSlash(game, player, targets[0], card);
      break;
    }
    case 'tao': {
      if (player.hp < player.maxHp) game.heal(player, 1);
      else game.log(`${player.name} 体力已满，${cardLabel(card.real || card)} 无效`);
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
            count: 1, from: 'target-area', reason: 'shunshou', info: { target, card: card.real || card },
          });
          if (!pick || pick.length === 0) return;
          const c = game.takeCardFromArea(target, pick[0]);
          if (!c) return;
          if (['le', 'shandian'].includes(pick[0])) game.recordRelation(player, target, 'help', 2);
          // 处理区同时展示被拿走的牌（官方语义），再进入手牌
          if (game.lastAction) game.lastAction.spent = [c];
          player.hand.push(c);
          // 1v1 中获得方或失去方必为玩家本人，这张牌玩家本就可知，故写明
          game.log(`${player.name} 获得了 ${target.name} 的${pick[0] === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
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
            count: 1, from: 'target-area', reason: 'guohe', info: { target, card: card.real || card },
          });
          if (!pick || pick.length === 0) return;
          const c = game.takeCardFromArea(target, pick[0]);
          if (!c) return;
          if (['le', 'shandian'].includes(pick[0])) game.recordRelation(player, target, 'help', 2);
          // 先让处理区展示被拆掉的牌，再置入弃牌堆（discardCards 内部会 notify）
          if (game.lastAction) game.lastAction.spent = [c];
          game.discardCards([c]);
          game.log(`${player.name} 弃置了 ${target.name} 的${pick[0] === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
        },
      });
      break;
    }
    case 'nanman': {
      // 置入处理区（挂起）而非直接进弃牌堆：造成伤害后奸雄可获得此牌
      game.discardCards([card.real || card], { pending: true });
      for (const target of game.others(player)) {
        // 结算途中阵亡的角色跳过
        if (game.over) break;
        if (!target.alive) continue;
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '南蛮入侵',
          apply: async () => {
            const v = await askResponse(game, target, { type: 'sha', reason: 'nanman', info: { source: player, card } });
            if (v) {
                target.removeCards(realsOf(v));
                game.discardCards(realsOf(v), { pending: true });
                game.log(`${target.name} 打出 ${useLabel(v)}`);
            } else {
              await applyDamage(game, player, target, 1, card.real || card);
            }
          },
        });
      }
      break;
    }
    case 'wanjian': {
      game.discardCards([card.real || card], { pending: true });
      for (const target of game.others(player)) {
        if (game.over) break;
        if (!target.alive) continue;
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '万箭齐发',
          apply: async () => {
            const shan = await askForShan(game, target, 'wanjian', player, { card });
            if (shan) {
              if (shan.vcard) {
                discardUsed(game, shan.vcard);
                game.log(`${target.name} 打出 ${useLabel(shan.vcard)}`);
              }
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
        // 未受伤的角色不会回复体力，官方跳过其结算（也不询问【无懈可击】）
        if (game.over) break;
        if (!target.alive || target.hp >= target.maxHp) continue;
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '桃园结义',
          apply: async () => game.heal(target, 1),
        });
      }
      break;
    }
    case 'wugu': {
      // 亮出张数 = 存活角色数
      const n = game.alivePlayers().length;
      const revealed = [];
      for (let i = 0; i < n; i++) {
        const c = game.drawOne();
        if (c) revealed.push(c);
      }
      game.discardCards([card.real || card]);
      game.log(`【五谷丰登】亮出：${revealed.map(cardLabel).join('、')}`);
      // 供 UI 展示公共选牌面板：全部亮出的牌 + 已被谁选走
      game.wugu = { cards: [...revealed], taken: {} };
      game.notify();
      for (const target of game.seatOrder(player)) {
        if (game.over) break;
        if (!target.alive) continue;
        await resolveTrick(game, {
          card: card.real || card, source: player, target, name: '五谷丰登',
          apply: async () => {
            if (revealed.length === 0) return;
            const pick = await game.ask(target, 'askChooseCards', {
              count: 1, from: 'wugu', reason: 'wugu', info: { candidates: revealed },
            });
            if (pick && pick.length === 1) {
              const c = revealed.find(x => x.id === pick[0]?.id);
              if (!c) return;
              revealed.splice(revealed.indexOf(c), 1);
              target.hand.push(c);
              if (game.wugu) game.wugu.taken[c.id] = target.name;
              game.log(`${target.name} 获得 ${cardLabel(c)}`);
            }
          },
        });
      }
      game.wugu = null;
      if (revealed.length) game.discardCards(revealed);
      break;
    }
    case 'jiedao': {
      const target = targets[0]; // 持武器者
      game.discardCards([card.real || card]);
      await resolveTrick(game, {
        card: card.real || card, source: player, target, name: '借刀杀人',
        apply: async () => {
          // 无懈链期间受害者可能已阵亡或不再合法：视为无法出【杀】
          const v = canJiedaoVictim(game, player, target, victim) ? await askResponse(game, target, {
            type: 'sha', reason: 'jiedao', info: { victim, source: player, weapon: target.equip.weapon },
          }) : null;
          if (v) {
            target.removeCards(realsOf(v));
            await resolveSlash(game, target, victim, v);
          } else if (target.equip.weapon && player.alive) {
            const w = target.equip.weapon;
            game.log(`${target.name} 不出【杀】，${player.name} 获得其武器 ${cardLabel(w)}`);
            target.clearEquip('weapon');
            player.hand.push(w);
          }
        },
      });
      break;
    }
    case 'le': {
      // 判定区放实体牌；转化而来（国色）时标记其生效牌名
      const target = targets[0];
      if (reals[0].name !== 'le') reals[0].delayedAs = 'le';
      target.judgeZone.push(reals[0]);
      break;
    }
    case 'shandian': {
      player.judgeZone.push(reals[0]);
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

// ---------- 主动技能（规则见 data/active-skills.js） ----------
const SUIT_CN = { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方片' };

export async function useSkill(game, player, action) {
  const id = action.skillId;
  // 1v1 的仁德可省略目标（唯一的对手）
  if (id === 'rende' && !action.targets?.length && game.mode === '1v1') {
    action = { ...action, targets: [game.opponentOf(player)] };
  }
  // 引擎兜底：牌数/区域/目标全部按技能表校验，非法调用不消耗次数
  if (!validateSkill(game, player, action)) return;
  const cards = action.cards || [];
  const targets = action.targets || [];
  const discard = () => {
    player.removeCards(cards);
    game.discardCards(cards);
  };
  const markUsed = () => { player.flags.used = { ...(player.flags.used || {}), [id]: true }; };

  switch (id) {
    case 'rende': {
      const opp = targets[0];
      player.removeFromHand(cards);
      opp.hand.push(...cards);
      player.flags.rendeGiven = (player.flags.rendeGiven || 0) + cards.length;
      game.pointAt(player, [opp]);
      game.recordRelation(player, opp, 'help');
      // 动画提示：这批牌是「交给」对方，UI 幽灵飞向对方而非弃牌堆
      game.lastGive = { ids: cards.map(c => c.id), to: opp.seat };
      game.log(`${player.name} 发动【仁德】，将 ${cards.map(cardLabel).join('、')} 交给 ${opp.name}`);
      if (player.flags.rendeGiven >= 2 && !player.flags.rendeHealed) {
        player.flags.rendeHealed = true;
        game.heal(player, 1);
      }
      break;
    }
    case 'jijiang': {
      // 出牌阶段发动激将：令蜀势力角色代出一张【杀】，视为由主公对目标使用（计入次数）
      const target = targets[0];
      const v = await askHelpers(game, player, 'jijiang', 'sha', lordHelpers(game, player, 'sha'));
      if (!v) { player.flags.jijiangFailed = true; return; }
      game.lastAction = { player, card: v, targets: [target] };
      player.flags.shaUsed = (player.flags.shaUsed || 0) + 1;
      await resolveSlash(game, player, target, v);
      break;
    }
    case 'zhiheng': {
      // 官方「弃置任意张牌」不限手牌，装备区的牌同样可以弃置
      player.flags.zhihengUsed = true;
      discard();
      game.log(`${player.name} 发动【制衡】，弃置 ${cards.map(cardLabel).join('、')}`);
      game.drawCards(player, cards.length);
      break;
    }
    case 'kurou': {
      game.log(`${player.name} 发动【苦肉】`);
      await game.loseHp(player, 1);
      if (player.alive && !game.over) game.drawCards(player, 2);
      break;
    }
    case 'fanjian': {
      markUsed();
      const t = targets[0];
      game.log(`${player.name} 对 ${t.name} 发动【反间】`);
      game.pointAt(player, [t]);
      game.recordRelation(player, t, 'harm');
      const suit = await game.ask(t, 'askChooseSuit', { source: player });
      const chosen = SUIT_CN[suit] ? suit : '♠';
      game.log(`${t.name} 选择了 ${SUIT_CN[chosen]}`);
      const c = game.takeCardFromArea(player, 'hand');
      if (!c) break;
      t.hand.push(c);
      game.lastGive = { ids: [c.id], to: t.seat };
      game.lastAction = { player, card: c, targets: [t] };
      game.log(`${t.name} 获得并展示了 ${cardLabel(c)}`);
      if (c.suit !== chosen) {
        game.log('花色不同，【反间】生效');
        await applyDamage(game, player, t, 1, null);
      } else {
        game.log('花色相同，【反间】无效');
      }
      break;
    }
    case 'jieyin': {
      markUsed();
      const t = targets[0];
      discard();
      game.log(`${player.name} 发动【结姻】，弃置 ${cards.map(cardLabel).join('、')}，与 ${t.name} 各回复 1 点体力`);
      game.pointAt(player, [t]);
      game.recordRelation(player, t, 'help', 2);
      game.heal(player, 1);
      game.heal(t, 1);
      break;
    }
    case 'qingnang': {
      markUsed();
      const t = targets[0];
      discard();
      game.log(`${player.name} 发动【青囊】，弃置 ${cardLabel(cards[0])}，令 ${t === player ? '自己' : t.name} 回复 1 点体力`);
      if (t !== player) { game.pointAt(player, [t]); game.recordRelation(player, t, 'help', 2); }
      game.heal(t, 1);
      break;
    }
    case 'lijian': {
      markUsed();
      const [victim, user] = targets;
      discard();
      game.log(`${player.name} 发动【离间】，弃置 ${cardLabel(cards[0])}，视为 ${user.name} 对 ${victim.name} 使用【决斗】`);
      game.pointAt(player, [victim, user]);
      game.recordRelation(player, victim, 'harm');
      game.recordRelation(player, user, 'harm', 0.5);
      // 视为使用的【决斗】没有实体牌
      const vduel = { id: -1, name: 'juedou', reals: [], suit: null, rank: null, virtual: true, type: 'trick', via: 'lijian' };
      await resolveJuedou(game, user, victim, vduel, { noNullify: true });
      break;
    }
  }
}
