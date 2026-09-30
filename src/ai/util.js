// AI 共用工具：牌的价值、选敌人、选牌区的牌等。
// 技能/卡牌定义里的 ai 字段调用这些函数做决策，友敌判断统一来自 perception.js。
import {
  legalTargets, canUseCardAs, shaLeftOf, inAttackRange, canUseAsSha, canUseInPlayPhase, pairViewAs,
} from '../data/cards.js';
import { getCard, kindOf } from '../core/registry.js';
import { ineffectiveBy } from '../data/cards.js';
import { relationOf, isEnemy, isFriend, friendsOf, enemiesOf, byThreat } from './perception.js';

export { relationOf, isEnemy, isFriend, friendsOf, enemiesOf, byThreat };

// 手牌价值（越低越先弃/先交出）：卡牌定义可用 ai.value 覆盖
const BASE_VALUE = { basic: 5, trick: 3, delayed: 3, equip: 4 };
export function value(c) {
  const def = getCard(c.name);
  return def?.ai?.value ?? BASE_VALUE[def?.type || c.type] ?? 3;
}

export const byValue = (a, b) => value(a) - value(b);
export const lowest = (cards, n = 1) => [...cards].sort(byValue).slice(0, n);

// 自己的牌（手牌 + 装备区）
export const ownCards = p => [...p.hand, ...Object.values(p.equip).filter(Boolean)];

// 以 name 名义使用实体牌 c 的动作牌（引擎会重新规范化并校验转化来源）
export const asCard = (c, name) => (c.name === name ? c : { ...c, virtual: true, real: c, reals: [c], name });

// 从合法目标中挑最该打的敌人
export function bestEnemy(game, p, targets) {
  return targets.filter(t => isEnemy(game, p, t)).sort(byThreat(game, p))[0] || null;
}

// 牌类为【杀】的牌（含火【杀】、雷【杀】）
export const isShaCard = c => !!c && kindOf(c.name) === 'sha';

// 合法且该牌对其有效（避开藤甲挡普通【杀】等）的目标中，最该打的敌人
export function enemyFor(game, p, use) {
  const card = { ...(use.real || use.card), name: use.name };
  return bestEnemy(game, p, legalTargets(game, p, use.real, use.name).filter(t => !ineffectiveBy(game, p, t, card)));
}

// 群体伤害是否划算：波及的敌人多于友方（1v1 恒划算）
export function aoeWorth(game, p) {
  const others = game.others(p);
  const foes = others.filter(o => isEnemy(game, p, o)).length;
  const pals = others.filter(o => isFriend(game, p, o)).length;
  return foes > 0 && foes > pals;
}

// 转化使用时是否舍得这张牌：不拆掉【桃】/防御牌/仍用得上的【杀】；装备区只拿坐骑
export function spareFor(game, p, c, as) {
  if (c.name === as || c.name === 'tao') return false;
  if (Object.values(p.equip).some(e => e && e.id === c.id) && !['horse+', 'horse-'].includes(c.subType)) return false;
  if (kindOf(as) === 'sha') return true;
  if (['wuxie', 'shan'].includes(c.name)) return false;
  return !(isShaCard(c) && shaLeftOf(p, game) > 0);
}

// 选择目标区域的一张牌（顺手/过河/反馈/寒冰剑）：返回区域描述 [zone]
//   友方：只拿走其判定区的乐/闪电（帮忙）；敌方：武器 > 防具 > （1v1 时判定区的乐）> 手牌 > 坐骑
export function pickArea(game, p, opts) {
  const t = opts.info?.target;
  if (!t) return null;
  const jn = c => c.delayedAs || c.name;
  if (game.mode === 'identity' && !opts.noJudge && isFriend(game, p, t)) {
    const bad = t.judgeZone.find(c => getCard(jn(c))?.harmful);
    if (bad) return [jn(bad)];
  }
  if (t.equip.weapon) return ['weapon'];
  if (t.equip.armor) return ['armor'];
  const le = !opts.noJudge && game.mode === '1v1' && t.judgeZone.find(c => jn(c) === 'le');
  if (le) return ['le'];
  if (t.hand.length > 0) return ['hand'];
  if (t.equip['horse+']) return ['horse+'];
  if (t.equip['horse-']) return ['horse-'];
  if (!opts.noJudge && t.judgeZone[0]) return [jn(t.judgeZone[0])];
  return null;
}

// 挑选响应牌：真牌优先，其次转化（不用【桃】/【无懈】），最后多张当一张
export function pickResponse(game, p, type, { allowPair = true, realOnly = false } = {}) {
  const real = p.hand.find(c => kindOf(c.name) === type);
  if (real) return real;
  if (realOnly) return null;
  const conv = [...p.hand].sort(byValue)
    .find(c => !['tao', 'wuxie'].includes(c.name) && canUseCardAs(p, c, type, game));
  if (conv) return { card: conv, as: type };
  if (allowPair && pairViewAs(p, type)) {
    const pair = pairFor(p);
    if (pair) return { cards: pair, as: 'sha' };
  }
  return null;
}

// 多张当【杀】：挑两张可以舍弃的手牌（保留桃/闪/无懈）
export function pairFor(p) {
  const spare = p.hand.filter(c => !['tao', 'wuxie', 'shan', 'jiu'].includes(c.name));
  return spare.length >= 2 ? spare.slice(0, 2) : null;
}

export { inAttackRange, canUseAsSha, canUseInPlayPhase, legalTargets };
