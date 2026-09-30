// 规则判据（唯一来源）：距离、攻击范围、目标合法性、次数上限、转化途径、出牌阶段可用性。
// 引擎结算入口、界面可选牌判断、AI 决策筛选都调用这里的同一组函数。
//
// 这里不出现任何具体武将/技能/卡牌的规则：卡牌的使用条件与目标条件写在卡牌定义里（packs/*/cards），
// 技能与装备的锁定效果通过注册表的修正点汇总（registry.modify），转化技通过 viewAs 汇总。
import '../packs/index.js';
import {
  getCard, CARD_NAME, EQUIP_RANGE, PACKS, modify, viewAsOf, multiViewAsOf, targetBlocker, judgeSpec,
} from '../core/registry.js';

export { CARD_NAME, EQUIP_RANGE };

// ---------- 牌堆 ----------
// 各扩展包提供 deck: [{ name, suit, rank }]，类型与装备栏位取自卡牌定义
let idSeq = 0;
export function buildStandardDeck(packIds = null) {
  return PACKS.filter(p => !packIds || packIds.includes(p.id)).flatMap(p => p.deck || []).map(t => {
    const def = getCard(t.name);
    if (!def) throw new Error(`牌堆中的 ${t.name} 没有卡牌定义`);
    return { id: ++idSeq, name: t.name, suit: t.suit, rank: t.rank, type: def.type, subType: def.subType || null };
  });
}

const SUIT_CN = { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方片' };
const RANK_CN = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export function cardLabel(card) {
  const cname = CARD_NAME[card.name] || card.name;
  // 合成牌（丈八蛇矛的双牌【杀】）/ 视为使用的牌无花色点数
  if (card.composite || card.suit == null) return `【${cname}】`;
  return `${SUIT_CN[card.suit] || card.suit}${RANK_CN[card.rank] ?? card.rank}【${cname}】`;
}

// 牌名对应的牌类（转化牌按转化后的牌名取类别：如国色的【乐不思蜀】为延时锦囊）
export function typeOfName(name) {
  return getCard(name)?.type || 'basic';
}

export function isRed(card) {
  return card.suit === '♥' || card.suit === '♦';
}

// 牌的颜色：'red' | 'black' | null（无色）。
// 合成牌：两张同色则为该色，否则无色——影响仁王盾等判定。
export function cardColor(card) {
  if (!card) return null;
  if (card.composite) {
    const cs = (card.reals || []).map(cardColor);
    return cs.length && cs.every(c => c === cs[0]) ? cs[0] : null;
  }
  if (card.suit == null) return null;
  return isRed(card) ? 'red' : 'black';
}

// 生效中的防具：source 为本次【杀】的使用者（青釭剑等「无视防具」由修正点 ignoreArmor 决定）。
// 非【杀】场景（万箭齐发等）传 null。
export function armorOf(target, source = null, game = null) {
  if (source && modify(source, 'ignoreArmor', false, { from: source, to: target }, game)) return null;
  return target.equip.armor || null;
}

// ---------- 判定 ----------
// 各判定「生效」的判据登记在发起判定的技能/卡牌定义里（judge 字段）
export const JUDGE_EFFECTIVE = new Proxy({}, { get: (_, name) => judgeSpec(name)?.effective });

export function judgeEffective(reason, card) {
  return !!judgeSpec(reason)?.effective(card);
}

// ---------- 距离与攻击范围 ----------
// 基础距离 = 两人之间存活座位的最短圈距（1v1 恒为 1）；再加上双方的距离修正（坐骑、马术等），最小为 1。
export function seatDistance(game, source, target) {
  if (!game) return 1;
  const alive = game.players.filter(p => p.alive || p.seat === source.seat || p.seat === target.seat);
  const i = alive.findIndex(p => p.seat === source.seat);
  const j = alive.findIndex(p => p.seat === target.seat);
  if (i < 0 || j < 0) return 1;
  const d = Math.abs(i - j);
  return Math.max(1, Math.min(d, alive.length - d));
}

export function distance(source, target, game = null) {
  const ctx = { from: source, to: target };
  const d = seatDistance(game, source, target)
    + modify(source, 'distanceFrom', 0, ctx, game)
    + modify(target, 'distanceTo', 0, ctx, game);
  return Math.max(1, d);
}

// 攻击范围：武器定义的 range（无武器为 1），再经修正
export function attackRange(p, game = null) {
  return modify(p, 'attackRange', getCard(p.equip.weapon?.name)?.range ?? 1, {}, game);
}

export function inAttackRange(source, target, game = null) {
  return distance(source, target, game) <= attackRange(source, game);
}

// 「区域里的牌」= 手牌 + 装备区 + 判定区（顺手牵羊/过河拆桥）
export function hasCardInArea(p) {
  return hasCard(p) || p.judgeZone.length > 0;
}

// 「角色的牌」= 手牌 + 装备区，不含判定区（反馈、寒冰剑）
export function hasCard(p) {
  return p.hand.length > 0 || Object.values(p.equip).some(Boolean);
}

// ---------- 目标合法性 ----------
// 卡牌定义 target = { distance: 'attack' | 数字 | 省略, ok(game, from, to) }
// 距离限制可被 noDistanceLimit 修正（奇才）解除；能否成为目标由目标的 targetable 修正决定（空城、谦逊）。
export function blockerOf(game, source, target, cardName) {
  return targetBlocker(target, { card: cardName, from: source, to: target }, game);
}

export function canTarget(game, source, target, cardName) {
  const def = getCard(cardName);
  const spec = def?.target;
  if (!spec) return false;
  if (target.seat === source.seat && !spec.self) return false;
  if (blockerOf(game, source, target, cardName)) return false;
  const lim = spec.distance;
  if (lim != null && !modify(source, 'noDistanceLimit', false, { card: def, from: source, to: target }, game)) {
    const ok = lim === 'attack' ? inAttackRange(source, target, game) : distance(source, target, game) <= lim;
    if (!ok) return false;
  }
  return spec.ok ? spec.ok(game, source, target) : true;
}

// 需要指定目标的牌
export const needsTarget = name => !!getCard(name)?.target;
// 需要第二个目标的牌（借刀杀人：持武器者 + 其【杀】的目标）
export const needsVictim = name => !!getCard(name)?.victim;

// 第二个目标是否合法（1v1 可以是使用者本人）
export function canSecondTarget(game, name, source, first, second) {
  const v = getCard(name)?.victim;
  return !!v && !!second && second.alive !== false && v.ok(game, source, first, second);
}

// 借刀杀人的第二个目标（保留名称，界面/AI 调用）
export const canJiedaoVictim = (game, source, holder, victim) => canSecondTarget(game, 'jiedao', source, holder, victim);

// 以 asName（默认本名）使用该牌时的全部合法目标（有第二目标的牌为第一个目标）。
// 装备区的牌（武圣）按失去该装备后的距离计算。
export function legalTargets(game, player, card, asName = null) {
  const name = asName || card.name;
  const self = card && equipCardOf(player, card) ? afterLosing(player, [card]) : player;
  const list = getCard(name)?.target?.self ? game.alivePlayers() : game.others(player);
  return list.filter(t => canTarget(game, self, t, name));
}

// ---------- 【杀】次数上限 ----------
export function shaLimitOf(player, game = null) {
  return modify(player, 'shaLimit', 1, {}, game);
}

export function shaLeftOf(player, game = null) {
  return Math.max(0, shaLimitOf(player, game) - (player.flags.shaUsed || 0));
}

// 手牌上限（默认等于体力值）
export function handLimitOf(player, game = null) {
  return modify(player, 'handLimit', Math.max(0, player.hp), {}, game);
}

// 失去某些牌之后的角色视图：以装备区的牌当其他牌使用时，官方按失去该装备后的
// 距离/攻击范围/次数上限判定（如把赤兔当【杀】则不再享受 -1 距离）。
export function afterLosing(player, cards) {
  const ids = new Set(cards.map(c => c.id));
  const lost = Object.keys(player.equip).filter(k => player.equip[k] && ids.has(player.equip[k].id));
  if (!lost.length) return player;
  const equip = { ...player.equip };
  for (const k of lost) equip[k] = null;
  return Object.assign(Object.create(Object.getPrototypeOf(player)), player, { equip });
}

export function equipCardOf(player, card) {
  return Object.values(player.equip).find(e => e && card && e.id === card.id) || null;
}

// ---------- 转化途径 ----------
// 该牌以 asName 使用/打出时所依据的转化（同名返回 null；无合法途径返回 undefined）。
// 转化来自技能或装备的 viewAs：{ as, ok(card), equip 可用装备区的牌, when(game, p) }
export function conversionOf(player, card, asName, game = null) {
  if (!card || !asName) return undefined;
  const inEquip = !!equipCardOf(player, card);
  if (card.name === asName && !inEquip) return null;
  return viewAsOf(player).find(cv => (cv.count || 1) === 1 && cv.as === asName && cv.ok(card)
    && (cv.equip || !inEquip) && (!cv.when || cv.when(game, player)));
}

// 能否把某张实体牌当作 asName 使用/打出——「牌名冒充」的唯一闸门
export function canUseCardAs(player, card, asName, game = null) {
  return conversionOf(player, card, asName, game) !== undefined;
}

// 可将该牌转化成的牌名列表（不含本名）
export function conversionNames(player, card, game = null) {
  const names = viewAsOf(player).filter(cv => (cv.count || 1) === 1 && cv.as !== card.name).map(cv => cv.as);
  return [...new Set(names)].filter(n => canUseCardAs(player, card, n, game));
}

export function canUseAsSha(player, card, game = null) {
  return card.name !== 'sha' && canUseCardAs(player, card, 'sha', game);
}

// 多张手牌当一张牌（丈八蛇矛）：返回可用的转化
export function pairViewAs(player, asName = 'sha') {
  return multiViewAsOf(player, asName).find(v => player.hand.length >= v.count) || null;
}

export function canZhangbaPair(player) {
  return !!pairViewAs(player, 'sha');
}

// 能否打出所需的响应牌（不含八卦阵、护驾等由效果提供的响应）
export function canRespondWith(player, type, game = null) {
  const own = [...player.hand, ...Object.values(player.equip).filter(Boolean)];
  if (own.some(c => canUseCardAs(player, c, type, game))) return true;
  return !!pairViewAs(player, type);
}

// 判定区里延时锦囊的「生效牌名」：国色的方块牌当【乐不思蜀】时实体牌名不是 le
export const judgeName = c => c.delayedAs || c.name;

// ---------- 出牌阶段可用性 ----------
// 该牌能否在出牌阶段以 asName（默认本名）使用。
// 卡牌定义：respondOnly 只能响应；usable(game, p) 使用条件；target 需要合法目标。
export function canUseInPlayPhase(game, player, card, asName = null) {
  const name = asName || card.name;
  if (!canUseCardAs(player, card, name, game)) return false;
  const def = getCard(name);
  if (!def || def.respondOnly) return false;
  const self = equipCardOf(player, card) ? afterLosing(player, [card]) : player;
  if (def.usable && !def.usable(game, self)) return false;
  if (def.target) return legalTargets(game, player, card, name).length > 0;
  return true;
}

// 多张牌当【杀】能否在出牌阶段使用
export function canUseZhangbaSha(game, player) {
  const def = getCard('sha');
  return canZhangbaPair(player) && (!def.usable || def.usable(game, player))
    && zhangbaTargets(game, player).length > 0;
}

export function zhangbaTargets(game, player) {
  return game.others(player).filter(t => canTarget(game, player, t, 'sha'));
}
