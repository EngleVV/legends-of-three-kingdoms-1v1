// 官方标准版牌堆 104 张 + EX 4 张（寒冰剑、仁王盾、红桃Q【闪电】、方片Q【无懈可击】）= 108 张
// type: basic | trick | delayed | equip
// subType（装备）: weapon | armor | horse+ | horse-
import { hasSkill, hasLordSkill, LORD_SKILL_KINGDOM } from './heroes.js';

export const CARD_NAME = {
  sha: '杀', shan: '闪', tao: '桃',
  juedou: '决斗', wuzhong: '无中生有', shunshou: '顺手牵羊', guohe: '过河拆桥',
  nanman: '南蛮入侵', wanjian: '万箭齐发', taoyuan: '桃园结义', jiedao: '借刀杀人',
  wugu: '五谷丰登', wuxie: '无懈可击', le: '乐不思蜀', shandian: '闪电',
  zhugenu: '诸葛连弩', qinglong: '青龙偃月刀', cixiong: '雌雄双股剑',
  guanshi: '贯石斧', zhangba: '丈八蛇矛', fangtian: '方天画戟', qilin: '麒麟弓',
  qinggang: '青釭剑', hanbing: '寒冰剑',
  bagua: '八卦阵', renwang: '仁王盾', 'ma+1': '+1马', 'ma-1': '-1马',
};

export const EQUIP_RANGE = {
  zhugenu: 1, qinggang: 2, cixiong: 2, hanbing: 2, qinglong: 3, guanshi: 3, zhangba: 3, fangtian: 4, qilin: 5,
};

export const HORSE_NAME = {
  // +1 马
  jueshang: ['jueshang', '绝影', '♠', 5, 'ma+1'],
  zhaohuang: ['zhaohuang', '爪黄飞电', '♥', 13, 'ma+1'],
  dilu: ['dilu', '的卢', '♣', 5, 'ma+1'],
  // -1 马
  chitu: ['chitu', '赤兔', '♥', 5, 'ma-1'],
  dawan: ['dawan', '大宛', '♠', 13, 'ma-1'],
  ziheng: ['ziheng', '紫骍', '♦', 13, 'ma-1'],
};

function mk(name, suit, rank, type, subType = null) {
  return { name, suit, rank, type, subType };
}

// 马的牌名（'ma+1'/'ma-1'，用于 CARD_NAME 显示）与装备栏位 key（'horse+'/'horse-'）不同名，
// 必须显式映射，否则装备时会写进错误的栏位。
const HORSE_SLOT = { 'ma+1': 'horse+', 'ma-1': 'horse-' };

// 每种牌的花色/点数表（按官方标准版 + EX 还原，每种花色各 27 张）
const TABLE = [
  // ---- 基本牌 ----
  ...['7', '8', '8', '9', '9', '10', '10'].map(r => mk('sha', '♠', +r, 'basic')),
  ...['10', '10', '11'].map(r => mk('sha', '♥', +r, 'basic')),
  ...['2', '3', '4', '5', '6', '7', '8', '8', '9', '9', '10', '10', '11', '11'].map(r => mk('sha', '♣', +r, 'basic')),
  ...['6', '7', '8', '9', '10', '13'].map(r => mk('sha', '♦', +r, 'basic')),
  ...['2', '2', '13'].map(r => mk('shan', '♥', +r, 'basic')),
  ...['2', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '11'].map(r => mk('shan', '♦', +r, 'basic')),
  ...['3', '4', '6', '7', '8', '9', '12'].map(r => mk('tao', '♥', +r, 'basic')),
  mk('tao', '♦', 12, 'basic'),
  // ---- 锦囊 ----
  mk('juedou', '♠', 1, 'trick'), mk('juedou', '♣', 1, 'trick'), mk('juedou', '♦', 1, 'trick'),
  ...['7', '8', '9', '11'].map(r => mk('wuzhong', '♥', +r, 'trick')),
  ...[['♠', 3], ['♠', 4], ['♠', 11], ['♦', 3], ['♦', 4]].map(([s, r]) => mk('shunshou', s, r, 'trick')),
  ...[['♠', 3], ['♠', 4], ['♠', 12], ['♣', 3], ['♣', 4], ['♥', 12]].map(([s, r]) => mk('guohe', s, r, 'trick')),
  ...[['♠', 7], ['♠', 13], ['♣', 7]].map(([s, r]) => mk('nanman', s, r, 'trick')),
  mk('wanjian', '♥', 1, 'trick'),
  mk('taoyuan', '♥', 1, 'trick'),
  ...[['♣', 12], ['♣', 13]].map(([s, r]) => mk('jiedao', s, r, 'trick')),
  ...[['♥', 3], ['♥', 4]].map(([s, r]) => mk('wugu', s, r, 'trick')),
  ...[['♠', 11], ['♣', 12], ['♣', 13], ['♦', 12]].map(([s, r]) => mk('wuxie', s, r, 'trick')),
  ...[['♠', 6], ['♣', 6], ['♥', 6]].map(([s, r]) => mk('le', s, r, 'delayed')),
  ...[['♠', 1], ['♥', 12]].map(([s, r]) => mk('shandian', s, r, 'delayed')),
  // ---- 装备 ----
  mk('zhugenu', '♣', 1, 'equip', 'weapon'),
  mk('zhugenu', '♦', 1, 'equip', 'weapon'),
  mk('qinggang', '♠', 6, 'equip', 'weapon'),
  mk('hanbing', '♠', 2, 'equip', 'weapon'),
  mk('qinglong', '♠', 5, 'equip', 'weapon'),
  mk('cixiong', '♠', 2, 'equip', 'weapon'),
  mk('guanshi', '♦', 5, 'equip', 'weapon'),
  mk('zhangba', '♠', 12, 'equip', 'weapon'),
  mk('fangtian', '♦', 12, 'equip', 'weapon'),
  mk('qilin', '♥', 5, 'equip', 'weapon'),
  ...[['♠', 2], ['♣', 2]].map(([s, r]) => mk('bagua', s, r, 'equip', 'armor')),
  mk('renwang', '♣', 2, 'equip', 'armor'),
  ...Object.values(HORSE_NAME).map(([, , suit, rank, sub]) => mk(sub, suit, rank, 'equip', HORSE_SLOT[sub])),
];

let idSeq = 0;
export function buildStandardDeck() {
  return TABLE.map(t => ({ id: ++idSeq, ...t }));
}

export function cardLabel(card) {
  const cname = CARD_NAME[card.name] || card.name;
  // 合成牌（丈八蛇矛的双牌【杀】）无花色/点数
  if (card.composite || card.suit == null) return `【${cname}】`;
  const suitSym = { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方片' }[card.suit] || card.suit;
  const rankStr = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] ?? card.rank;
  return `${suitSym}${rankStr}【${cname}】`;
}

export function isRed(card) {
  return card.suit === '♥' || card.suit === '♦';
}

// 牌的颜色：'red' | 'black' | null（无色）。
// 合成牌（丈八蛇矛的两张手牌当【杀】）：两张同色则为该色，否则无色——影响仁王盾等判定。
export function cardColor(card) {
  if (!card) return null;
  if (card.composite) {
    const cs = (card.reals || []).map(cardColor);
    return cs.length && cs.every(c => c === cs[0]) ? cs[0] : null;
  }
  if (card.suit == null) return null;
  return isRed(card) ? 'red' : 'black';
}

// 生效中的防具：青釭剑（锁定技）令持有者使用的【杀】无视目标防具。
// source 为本次【杀】的使用者；非【杀】场景（万箭齐发等）传 null。
export function armorOf(target, source = null) {
  if (source && source.equip.weapon?.name === 'qinggang') return null;
  return target.equip.armor || null;
}

// 仁王盾（锁定技）：黑色【杀】对装备者无效
export function renwangBlocks(source, target, vcard) {
  return armorOf(target, source)?.name === 'renwang' && cardColor(vcard) === 'black';
}

// ---------- 判定 ----------
// 各判定「生效」的判据（唯一来源：引擎结算、AI 改判、UI 处理区显示结果都用它）
//   乐不思蜀：非红桃 → 判定者跳过出牌阶段
//   闪电：黑桃 2~9 → 判定者受 3 点雷电伤害
//   八卦阵：红色 → 视为打出【闪】
export const JUDGE_EFFECTIVE = {
  '乐不思蜀': c => c.suit !== '♥',
  '闪电': c => c.suit === '♠' && c.rank >= 2 && c.rank <= 9,
  '八卦阵': c => isRed(c),
};

export function judgeEffective(reason, card) {
  return !!JUDGE_EFFECTIVE[reason]?.(card);
}

// ---------- 距离与目标合法性 ----------
// 基础距离 = 两人之间存活座位的最短圈距（1v1 恒为 1）；
// 目标的 +1 马（防御马）令距离 +1，自己的 -1 马（进攻马）令距离 -1，最小为 1。
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
  const d = seatDistance(game, source, target)
    + (target.equip['horse+'] ? 1 : 0) - (source.equip['horse-'] ? 1 : 0);
  return Math.max(1, d);
}

// 攻击范围：由武器决定，无武器为 1
export function attackRange(p) {
  return EQUIP_RANGE[p.equip.weapon?.name] ?? 1;
}

export function inAttackRange(source, target, game = null) {
  return distance(source, target, game) <= attackRange(source);
}

// 「区域里的牌」= 手牌 + 装备区 + 判定区（顺手牵羊/过河拆桥）
export function hasCardInArea(p) {
  return hasCard(p) || p.judgeZone.length > 0;
}

// 「角色的牌」= 手牌 + 装备区，不含判定区（反馈、寒冰剑）
export function hasCard(p) {
  return p.hand.length > 0 || Object.values(p.equip).some(Boolean);
}

export function canTarget(game, source, target, cardName) {
  if (target.seat === source.seat) return ['shandian'].includes(cardName);
  switch (cardName) {
    case 'sha':
      // 空城：不能成为杀/决斗目标
      if (hasSkill(target, 'kongcheng') && target.hand.length === 0) return false;
      // 【杀】受攻击范围限制
      return inAttackRange(source, target, game);
    case 'juedou':
      // 决斗无距离限制
      if (hasSkill(target, 'kongcheng') && target.hand.length === 0) return false;
      return true;
    case 'shunshou':
      // 顺手牵羊需距离 1
      return hasCardInArea(target) && distance(source, target, game) <= 1;
    case 'guohe':
      return hasCardInArea(target);
    case 'le':
      return !target.judgeZone.some(c => c.name === 'le');
    case 'jiedao':
      // 借刀杀人：目标需有武器，且其攻击范围内存在另一名可被【杀】的角色（可以是使用者本人）
      return !!target.equip.weapon
        && (game ? game.players.filter(p => p.alive) : [source]).some(v => canJiedaoVictim(game, source, target, v));
    default:
      return false;
  }
}

// 借刀杀人的第二个目标：持武器者需对其使用【杀】，故须是持武器者之外、其可以【杀】的角色
export function canJiedaoVictim(game, source, holder, victim) {
  return !!victim && victim.seat !== holder.seat && victim.alive !== false && canTarget(game, holder, victim, 'sha');
}

// 需要指定目标的牌（出牌阶段）
export const NEED_TARGET = ['sha', 'juedou', 'le', 'shunshou', 'guohe', 'jiedao'];

// 以 asName（默认本名）使用该牌时的全部合法目标（借刀杀人为第一个目标：持武器者）。
// 装备区的牌（武圣）按失去该装备后的距离计算。引擎/UI/AI 共用。
export function legalTargets(game, player, card, asName = null) {
  const name = asName || card.name;
  const self = card && equipCardOf(player, card) ? afterLosing(player, [card]) : player;
  return game.others(player).filter(t => canTarget(game, self, t, name));
}

// 丈八蛇矛合成【杀】的合法目标
export function zhangbaTargets(game, player) {
  return game.others(player).filter(t => canTarget(game, player, t, 'sha'));
}

// ---------- 【杀】次数上限 ----------
// 诸葛连弩（装备）与咆哮（锁定技）令【杀】无次数限制。
// 该判据被引擎、UI、AI 共用，必须保持同步的唯一实现。
export function shaLimitOf(player) {
  if (player.equip.weapon?.name === 'zhugenu') return Infinity;
  if (hasSkill(player, 'paoxiao')) return Infinity;
  return 1;
}

export function shaLeftOf(player) {
  return Math.max(0, shaLimitOf(player) - (player.flags.shaUsed || 0));
}

// 失去某些牌之后的角色视图：以装备区的牌当【杀】（武圣）时，官方按失去该装备后的
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
// 武圣：关羽可将任意红色牌（手牌或装备区的牌）当【杀】使用或打出
export function canUseAsSha(player, card) {
  return hasSkill(player, 'wusheng') && isRed(card);
}

// 丈八蛇矛：可将任意两张手牌当【杀】使用或打出
export function canZhangbaPair(player) {
  return player.equip.weapon?.name === 'zhangba' && player.hand.length >= 2;
}

// 能否把某张实体牌当作 asName 使用/打出。
// 这是「牌名冒充」的唯一闸门：除既有转化技外，牌名必须与所需牌名一致。
// 标准版这 8 名武将中，只有武圣（红牌→杀）与丈八蛇矛（双牌→杀）两种转化途径，
// 【闪】【桃】【无懈可击】没有任何转化来源。
export function canUseCardAs(player, card, asName) {
  if (!card || !asName) return false;
  if (card.name === asName) return true;
  if (asName === 'sha') return canUseAsSha(player, card);
  return false;
}

// 能否打出所需的响应牌（不含八卦阵，八卦阵在求闪流程中单独询问）
export function canRespondWith(player, type) {
  if (type === 'shan') return player.hand.some(c => c.name === 'shan');
  if (type === 'sha') {
    return player.hand.some(c => canUseCardAs(player, c, 'sha'))
      || Object.values(player.equip).some(e => e && canUseAsSha(player, e))
      || canZhangbaPair(player);
  }
  return false;
}

// ---------- 主公技：激将 / 护驾 ----------
// 需要 type（'sha'|'shan'）时可代为打出的其他同势力角色（按座位顺序）
export function lordHelpers(game, player, type) {
  const skill = type === 'sha' ? 'jijiang' : type === 'shan' ? 'hujia' : null;
  if (!skill || !game || !hasLordSkill(player, skill)) return [];
  return game.others(player).filter(p => p.hero.kingdom === LORD_SKILL_KINGDOM[skill]);
}

// 出牌阶段发动激将（令蜀势力角色代出【杀】）：需仍可出【杀】、有合法目标、本阶段未因无人响应而失败
export function canUseJijiang(game, player) {
  return lordHelpers(game, player, 'sha').length > 0
    && shaLeftOf(player) > 0 && !player.flags.jijiangFailed
    && game.others(player).some(t => canTarget(game, player, t, 'sha'));
}

// ---------- 出牌阶段可用性 ----------
// 该牌能否在出牌阶段以 asName（默认本名）使用。
// 这是引擎/UI/AI 共用的唯一判据：引擎据此拒绝非法出牌，UI 据此决定哪张牌可点，AI 据此筛选决策。
export function canUseInPlayPhase(game, player, card, asName = null) {
  const name = asName || card.name;
  const anyTarget = n => legalTargets(game, player, card, n).length > 0;

  // 装备区的牌只能经武圣当【杀】使用，且按失去该装备后的状态判定
  if (equipCardOf(player, card)) {
    if (!(name === 'sha' && canUseAsSha(player, card))) return false;
    player = afterLosing(player, [card]);
  }

  // 以非本名使用时，必须存在合法转化途径（目前只有武圣的红牌当杀）
  if (name !== card.name && !(name === 'sha' && canUseAsSha(player, card))) return false;

  switch (name) {
    // 【闪】【无懈可击】只能用于响应，不可主动使用
    case 'shan':
    case 'wuxie':
      return false;
    // 【杀】：受每回合次数限制与攻击范围限制
    case 'sha':
      return shaLeftOf(player) > 0 && anyTarget('sha');
    // 【桃】：出牌阶段只能对自己使用，且体力值未满
    case 'tao':
      return player.hp < player.maxHp;
    // 【闪电】：置入自己判定区，已有【闪电】时不可再置
    case 'shandian':
      return !player.judgeZone.some(c => c.name === 'shandian');
    // 需指定目标的牌：交由 canTarget 判定（含距离、空城、重复乐、对方有武器等）
    case 'le':
    case 'juedou':
    case 'shunshou':
    case 'guohe':
    case 'jiedao':
      return anyTarget(name);
    // 无使用条件的锦囊
    case 'wuzhong':
    case 'nanman':
    case 'wanjian':
    case 'taoyuan':
    case 'wugu':
      return true;
    default:
      // 装备牌无使用条件；未知牌名一律拒绝
      return card.type === 'equip';
  }
}

// 丈八蛇矛的合成【杀】能否在出牌阶段使用
export function canUseZhangbaSha(game, player) {
  return canZhangbaPair(player)
    && shaLeftOf(player) > 0
    && zhangbaTargets(game, player).length > 0;
}
