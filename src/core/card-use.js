// 通用用牌流程：使用牌（出牌阶段）、打出/使用响应牌、发动主动技能。
// 每种牌的具体效果写在卡牌定义的 use() 里（packs/*/cards），技能效果写在技能定义里；
// 这里只负责校验、移牌、记录、广播时机，不出现任何具体牌名/技能名的规则。
import {
  cardLabel, canTarget, canUseInPlayPhase, canUseZhangbaSha, canRespondWith, shaLeftOf,
  canUseCardAs, equipCardOf, afterLosing, canSecondTarget, conversionOf, typeOfName, pairViewAs,
} from '../data/cards.js';
import { getCard, validateSkill, markSkillUsed, skillTargetCandidates, getSkill, kindOf } from './registry.js';
import { handCardOf, realsOf, useLabel } from './util.js';

// ---------- 虚拟牌 ----------
// 虚拟牌可由一张或多张实体牌组成，实体牌统一放在 reals 数组里（real 保留为首张，便于日志/兼容）。
// name 与原牌同名时视为「纯包装」，保留原牌的 type/subType（装备牌必须保留 subType 才能进对应栏位）；
// 名称不同才是真正的转化（如红色牌当【杀】），此时按转化后的牌名取类别。
// via：转化所依据的技能/装备 id，用于战报「当【X】（技能）」
export function makeVirtual(card, name, via = null) {
  const converted = name !== card.name;
  return {
    id: card.id, real: card, reals: [card], name, suit: card.suit, rank: card.rank, virtual: true,
    type: converted ? typeOfName(name) : card.type,
    subType: converted ? null : card.subType,
    ...(via ? { via } : {}),
  };
}

// 实体牌以 name 使用/打出时的规范化虚拟牌（由引擎判定转化来源）
// 牌类相同的本牌（火【杀】当【杀】打出）保留原牌名，以免丢失属性
export function virtualAs(player, card, name, game = null) {
  const cv = conversionOf(player, card, name, game);
  const keep = !cv && card.name !== name && kindOf(card.name) === name;
  return makeVirtual(card, keep ? card.name : name, cv?.skill || null);
}

// 多张实体牌合成一张虚拟牌（丈八蛇矛：两张手牌当【杀】）。合成牌无花色/点数。
export function makeVirtualFrom(cards, name, via = null) {
  return {
    id: cards[0].id, real: cards[0], reals: [...cards], name,
    suit: null, rank: null, virtual: true, type: typeOfName(name), subType: null, composite: true,
    ...(via ? { via } : {}),
  };
}

// 视为使用的牌（没有实体牌，如离间的【决斗】）
export function makeViewAs(name, via = null) {
  return { id: -1, name, reals: [], suit: null, rank: null, virtual: true, type: typeOfName(name), ...(via ? { via } : {}) };
}

export { realsOf };

// 校验响应并转为虚拟牌；无效引用或非法「牌名冒充」一律返回 null
// 支持 {cards:[a,b], as}（多张当一张）与 {card, as} / 裸牌两种形态
export function validResponse(player, r, defaultName, game = null) {
  if (!r) return null;
  const asName = r.as || defaultName;

  if (Array.isArray(r.cards)) {
    const pv = pairViewAs(player, asName);
    if (!pv) return null;
    const ids = new Set(r.cards.map(c => c && c.id));
    if (r.cards.length !== pv.count || ids.size !== pv.count) return null;
    if (!r.cards.every(c => player.hand.some(h => h.id === c.id))) return null;
    return makeVirtualFrom(r.cards, asName, pv.skill);
  }

  // 手牌，或（经允许装备素材的转化）装备区的牌
  const card = handCardOf(player, r) || equipCardOf(player, r.card || r);
  if (!card) return null;
  if (!canUseCardAs(player, card, asName, game)) return null;
  return virtualAs(player, card, asName, game);
}

// 结算中的牌先挂起（奸雄可获取），下一次结算前落入弃牌堆
export function discardUsed(game, vcard) {
  const reals = realsOf(vcard);
  if (reals.length) game.discardCards(reals, { pending: true });
}

export function shaLimitLeft(game, player) {
  return shaLeftOf(player, game);
}

// ---------- 响应：使用或打出所需的牌 ----------
// req = { type: 'shan' | 'sha' | ..., reason: 请求来源的牌/技能 id, info }
// 返回虚拟牌（其实体牌已从持有者处移除），或 null。
// 由效果提供的响应（八卦阵的判定、护驾/激将的代出）通过 needResponse 时机提供，
// 效果视为打出的牌 effectOnly = true（没有实体牌，不写「打出」战报）。
export async function respond(game, player, req) {
  const own = canRespondWith(player, req.type, game);
  const ctx = await game.trigger('needResponse', { player, req, own, result: null });
  let v = ctx.result;
  if (!v) {
    if (!own) return null;
    const r = await game.ask(player, 'askRespondCard', req);
    v = validResponse(player, r, req.type, game);
    if (!v) return null;
    player.removeCards(realsOf(v));
  }
  // 引擎统计：自己出牌阶段内打出过【杀】（克己等技能读取）
  if (req.type === 'sha' && game.currentTurnSeat === player.seat && game.currentPhase === 'play') {
    player.flags.shaPlayed = true;
  }
  await game.trigger('cardResponded', { player, card: v, req });
  return v;
}

// 兼容名：部分技能/卡牌沿用 askResponse
export const askResponse = respond;

// 打出响应牌后的通用处理：置入处理区并写战报
export function playedLog(game, player, v, suffix = '') {
  discardUsed(game, v);
  if (!v.effectOnly) game.log(`${player.name} 打出 ${useLabel(v)}${suffix}`);
}

// ---------- 重铸：将牌置入弃牌堆并摸一张牌（不是使用，不触发集智等） ----------
export function recastCard(game, player, card) {
  const real = card && player.hand.find(h => h.id === (card.real || card).id);
  if (!real || !getCard(real.name)?.recast) return false;
  player.removeFromHand([real]);
  game.discardCards([real]);
  game.lastAction = { player, card: real, targets: [] };
  game.log(`${player.name} 重铸 ${cardLabel(real)}`);
  game.drawCards(player, 1);
  return true;
}

// ---------- 出牌阶段使用一张牌 ----------
// action = { card, targets, victim } | { cards: [...], as, targets }（多张当一张）| { card, recast: true }
export async function resolveCardUse(game, player, action) {
  if (action.recast) { recastCard(game, player, action.card); return; }
  const { card: raw, targets = [] } = action;
  // 统一为虚拟牌：单张按「实体牌 + 使用名」重新规范化，由引擎判定转化来源（不信任调用方传入的 type/via）
  const composite = Array.isArray(action.cards) && action.cards.length > 1;
  let card;
  if (composite) {
    const as = action.as || 'sha';
    const pv = pairViewAs(player, as);
    if (!pv || action.cards.length !== pv.count) return;
    card = makeVirtualFrom(action.cards, as, pv.skill);
  } else {
    const real = raw.virtual ? (raw.real || raw.reals?.[0] || raw) : raw;
    card = virtualAs(player, real, raw.name, game);
  }
  const reals = realsOf(card);
  const def = getCard(card.name);

  const reject = why => {
    game.log(`${player.name} 使用 ${useLabel(card)} 失败（${why}），取消使用`);
  };

  // 1) 实体牌必须互不相同，且都在手牌中；例外是允许装备素材的转化（武圣/奇袭/国色）使用装备区的牌
  const ids = new Set(reals.map(c => c.id));
  if (!def || ids.size !== reals.length) return;
  const equipOk = c => !composite && !!equipCardOf(player, c) && !!conversionOf(player, c, card.name, game)?.equip;
  if (!reals.every(c => player.hand.some(h => h.id === c.id) || equipOk(c))) return;

  // 2) 出牌阶段可用性（卡牌定义的使用条件、次数上限、转化途径）
  if (composite) {
    if (!canUseZhangbaSha(game, player)) { reject('无法以多张手牌当此牌使用'); return; }
  } else if (!canUseInPlayPhase(game, player, reals[0], card.name)) {
    reject('当前不可使用');
    return;
  }

  // 3) 目标合法性（以装备区的牌转化时按失去该装备后的距离判定；多目标的牌逐个校验）
  if (def.target) {
    const min = def.target.min ?? 1;
    const max = def.target.max ?? 1;
    const self = afterLosing(player, reals);
    const distinct = new Set(targets.map(t => t?.seat)).size === targets.length;
    if (targets.length < min || targets.length > max || !distinct
      || !targets.every(t => t && t.alive && canTarget(game, self, t, card.name))) {
      reject('目标不合法');
      return;
    }
  }
  let victim = null;
  if (def.victim) {
    victim = action.victim || (game.mode === '1v1' ? player : null);
    if (!canSecondTarget(game, card.name, player, targets[0], victim)) { reject('第二个目标不合法'); return; }
  }

  player.removeCards(reals);
  game.lastGive = null; // 新的出牌开始，清除上一次的交付提示
  game.lastAction = { player, card, targets: [...targets] };
  // 战报与指示线：selfLog 的牌（杀/决斗）在各自结算中记录，装备记「装备了」
  if (!def.selfLog && def.type !== 'equip') {
    const to = targets.length ? `对 ${targets.map(t => t.name).join('、')} ` : '';
    const extra = def.victim && victim && game.mode !== '1v1' ? def.victim.log(victim) : '';
    game.log(`${player.name} ${to}使用 ${useLabel(card)}${extra}`);
    game.pointAt(player, def.aoe ? game.others(player) : targets);
    if (def.harm) for (const t of targets) game.recordRelation(player, t, 'harm', def.harm);
  }
  game.notify();
  await game.trigger('cardUsed', { player, card, targets });
  if (game.over) return;
  await def.use(game, { player, card, reals, targets, victim });
}

// ---------- 主动技能（规则见技能定义的 active） ----------
export async function useSkill(game, player, action) {
  const id = action.skillId;
  const active = getSkill(id)?.active;
  if (!active) return;
  // 单目标技能在只有一个合法目标时可省略目标（1v1 的仁德）
  if (!action.targets?.length && active.targets?.min === 1) {
    const cands = skillTargetCandidates(game, player, id);
    if (cands.length === 1) action = { ...action, targets: cands };
  }
  // 引擎兜底：牌数/区域/目标全部按技能定义校验，非法调用不消耗次数
  if (!validateSkill(game, player, action)) return;
  markSkillUsed(player, id);
  await active.run(game, player, { cards: action.cards || [], targets: action.targets || [] });
}

// 主动技能弃置素材牌的通用处理
export function discardFor(game, player, cards) {
  player.removeCards(cards);
  game.discardCards(cards);
  return cards.map(cardLabel).join('、');
}
