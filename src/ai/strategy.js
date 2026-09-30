// AI 启发式策略（纯函数，输入局面，输出决策）
import {
  canTarget, canUseInPlayPhase, canUseZhangbaSha, canUseAsSha, canZhangbaPair, JUDGE_EFFECTIVE,
} from '../data/cards.js';
import { hasSkill } from '../data/heroes.js';

// 出牌阶段决策：返回 {card, targets} | {cards, card, targets} | {skillId, cards} | null
export function choosePlay(game, p) {
  const opp = game.opponentOf(p);
  const hand = p.hand;
  const find = (pred) => hand.find(pred);
  // 使用条件与目标合法性统一走引擎判据，避免提交非法出牌造成空转
  const usable = c => canUseInPlayPhase(game, p, c);
  const ok = name => canTarget(game, p, opp, name);

  // 1. 回血
  const tao = find(c => c.name === 'tao' && usable(c));
  if (tao) return { card: tao, targets: [] };

  // 2. 乐不思蜀
  const le = find(c => c.name === 'le' && usable(c));
  if (le) return { card: le, targets: [opp] };

  // 3. 上装备（武器 > 防具 > 马）
  for (const c of hand) {
    if (c.type === 'equip' && !p.equip[c.subType]) return { card: c, targets: [] };
  }

  // 4. 无中生有
  const wz = find(c => c.name === 'wuzhong' && usable(c));
  if (wz) return { card: wz, targets: [] };

  // 5. 顺手牵羊 / 过河拆桥（对方有牌就有收益）
  const ss = find(c => c.name === 'shunshou' && usable(c));
  if (ss) return { card: ss, targets: [opp] };
  const gh = find(c => c.name === 'guohe' && usable(c));
  if (gh) return { card: gh, targets: [opp] };

  // 6. 杀（次数上限/攻击范围由 canUseInPlayPhase 判定）
  const shaCard = find(c => c.name === 'sha' && usable(c));
  if (shaCard) return { card: shaCard, targets: [opp] };
  // 武圣：红色手牌当杀（保留桃）
  const redAsSha = find(c => c.name !== 'tao' && canUseAsSha(p, c) && canUseInPlayPhase(game, p, c, 'sha'));
  if (redAsSha) {
    return { card: { ...redAsSha, virtual: true, real: redAsSha, reals: [redAsSha], name: 'sha', type: 'basic' }, targets: [opp] };
  }
  // 丈八蛇矛：两张手牌当杀
  if (canUseZhangbaSha(game, p)) {
    const pair = zhangbaPair(p);
    if (pair) return { cards: pair, card: pair[0], targets: [opp] };
  }

  // 7. 决斗（手牌杀多或对方残血）
  const jd = find(c => c.name === 'juedou' && usable(c));
  const shaCount = hand.filter(c => c.name === 'sha').length;
  if (jd && (shaCount >= 2 || opp.hp <= 1)) return { card: jd, targets: [opp] };

  // 7.5 借刀杀人（缴对方武器）
  const jdao = find(c => c.name === 'jiedao' && usable(c));
  if (jdao) return { card: jdao, targets: [opp] };

  // 8. 南蛮/万箭（对方没杀/没闪时更优，简化：总是放）
  const nm = find(c => c.name === 'nanman' && usable(c));
  if (nm) return { card: nm, targets: [] };
  const wj = find(c => c.name === 'wanjian' && usable(c));
  if (wj) return { card: wj, targets: [] };

  // 9. 五谷/桃园
  const wy = find(c => c.name === 'taoyuan' && usable(c));
  if (wy && (p.hp < p.maxHp || opp.hp >= opp.maxHp)) return { card: wy, targets: [] };
  const wg = find(c => c.name === 'wugu' && usable(c));
  if (wg) return { card: wg, targets: [] };

  // 10. 闪电（血量健康时赌一把）
  const sd = find(c => c.name === 'shandian' && usable(c));
  if (sd && p.hp >= 3) return { card: sd, targets: [] };

  // 11. 闪电在对方判定区时，用无懈解救自己没意义，跳过

  // 12. 制衡：手牌多且攻击牌少时换牌
  const zhihengCards = pickZhiheng(game, p);
  if (hasSkill(p, 'zhiheng') && !p.flags.zhihengUsed && zhihengCards.length >= 2) {
    return { skillId: 'zhiheng', cards: zhihengCards };
  }

  // 13. 仁德：残血时凑 2 张换回血（1v1 下略亏，仅残血时用）
  if (hasSkill(p, 'rende') && p.hp <= 1 && hand.length >= 2) {
    const gives = hand.filter(c => c.name === 'shan').slice(0, 2);
    if (gives.length === 2) return { skillId: 'rende', cards: gives };
  }

  return null;
}

// 丈八蛇矛：挑两张可以当【杀】用的手牌（保留桃/闪/无懈，避免自断防御）
function zhangbaPair(p) {
  if (!canZhangbaPair(p)) return null;
  const spare = p.hand.filter(c => !['tao', 'wuxie', 'shan'].includes(c.name));
  return spare.length >= 2 ? spare.slice(0, 2) : null;
}

function pickZhiheng(game, p) {
  // 弃多余的闪/杀（保留1闪1杀），保留桃和无懈
  const keep = { shan: 1, sha: 1 };
  const counts = { shan: 0, sha: 0 };
  const out = [];
  for (const c of p.hand) {
    if (c.name === 'tao' || c.name === 'wuxie') continue;
    if (c.name === 'shan' || c.name === 'sha') {
      if (counts[c.name] < keep[c.name]) { counts[c.name]++; continue; }
    }
    out.push(c);
  }
  return out;
}

// 响应牌
export function chooseRespond(game, p, req) {
  const hand = p.hand;
  const { type, reason } = req;
  if (type === 'shan') {
    const shan = hand.find(c => c.name === 'shan');
    return shan || null;
  }
  if (type === 'sha') {
    const shas = hand.filter(c => c.name === 'sha');
    // 武圣：红色牌当杀（保留桃）
    const virtualSha = hand.find(c => c.name !== 'tao' && canUseAsSha(p, c));
    const use = (c) => (c.name === 'sha' ? c : { card: c, as: 'sha' });
    // 丈八蛇矛：无实体杀时可用两张手牌顶上
    const pair = zhangbaPair(p);
    const fallback = () => (virtualSha ? use(virtualSha) : (pair ? { cards: pair, as: 'sha' } : null));

    if (reason === 'juedou') {
      // 有余量就出（至少留 1 张杀防身）
      if (shas.length >= 2 || (shas.length === 1 && p.hp > 2)) return use(shas[0]);
      return p.hp <= 1 ? fallback() : null; // 濒临死亡时不惜代价
    }
    if (reason === 'nanman') return shas[0] ? use(shas[0]) : fallback();
    if (reason === 'qinglong') return shas[0] ? use(shas[0]) : null;
    if (reason === 'jiedao') {
      // 被迫杀对方：有杀就出（否则送武器）
      if (shas[0]) return use(shas[0]);
      return fallback();
    }
    return shas[0] ? use(shas[0]) : fallback();
  }
  return null;
}

// 濒死求桃
export function choosePeach(game, p, info) {
  if (info.dying === p) {
    const tao = p.hand.find(c => c.name === 'tao');
    if (tao) return tao;
  }
  return null; // AI 不救对方
}

// 无懈可击
export function chooseNullify(game, p, effect) {
  const wx = p.hand.find(c => c.name === 'wuxie');
  if (!wx) return null;
  // 抵消对自己的乐/闪电判定
  if (!effect.isNullify && (effect.name === '乐不思蜀' || effect.name === '闪电') && effect.target === p) return wx;
  // 抵消对方对自己关键锦囊（决斗/AOE）
  if (!effect.isNullify && ['决斗', '南蛮入侵', '万箭齐发'].includes(effect.name) && effect.target === p && p.hp <= 2) return wx;
  // 抵消对方的无懈（保住自己的乐）
  if (effect.isNullify && effect.source === game.opponentOf(p)) return wx;
  return null;
}

// 通用选牌
export function chooseCards(game, p, opts) {
  const { count, from, reason, optional, info } = opts;
  if (from === 'self' || from === 'discard-phase') {
    const hand = [...p.hand];
    if (hand.length < count) return null;
    // 弃牌价值排序：桃 > 无懈 > 闪 > 杀 > 其他（要弃的挑价值最低的）
    const value = c => ({ tao: 9, wuxie: 8, shan: 6, sha: 5 }[c.name] ?? (c.type === 'equip' ? 4 : 3));
    if (reason === 'guanshi') {
      if (!optional) return null;
      // 强制命中收益：对方残血时值得
      const target = info?.target;
      if (!target || target.hp > 2 || p.hand.length < 3) return null;
      const sorted = hand.sort((a, b) => value(a) - value(b));
      return sorted.slice(0, 2);
    }
    const sorted = hand.sort((a, b) => value(a) - value(b));
    return sorted.slice(0, count);
  }
  if (from === 'target-area') {
    const t = info?.target;
    if (!t) return null;
    // 拆/顺优先级：武器 > 防具 > 判定区乐 > 手牌 > 马（反馈/寒冰剑不可选判定区）
    if (t.equip.weapon) return ['weapon'];
    if (t.equip.armor) return ['armor'];
    const le = !opts.noJudge && t.judgeZone.find(c => c.name === 'le');
    if (le) return ['le'];
    if (t.hand.length > 0) return ['hand'];
    if (t.equip['horse+']) return ['horse+'];
    if (t.equip['horse-']) return ['horse-'];
    return null;
  }
  if (from === 'horse') {
    const t = info?.target;
    if (t?.equip['horse+']) return ['horse+'];
    if (t?.equip['horse-']) return ['horse-'];
    return null;
  }
  if (from === 'wugu') {
    const cands = info?.candidates || [];
    if (!cands.length) return null;
    // 优先桃 > 无中生有 > 装备 > 其他
    const value = c => ({ tao: 9, wuzhong: 8 }[c.name] ?? (c.type === 'equip' ? 6 : 4));
    const best = [...cands].sort((a, b) => value(b) - value(a))[0];
    return [best];
  }
  return null;
}

// 鬼才改判：返回用于替换的手牌或 null
// 鬼才可改任意角色的判定，因此需区分"判定者是自己"还是"对方"：
// 自己的判定求有利结果，对方的判定求不利结果。
export function chooseJudgeReplace(game, p, info) {
  const { judgeCard, reason, player: judger } = info;
  // 各判定的"生效"判据，统一取自 data/cards.js
  const hit = JUDGE_EFFECTIVE[reason];
  if (!hit) return null;
  // 八卦阵命中对判定者有利，闪电/乐命中对判定者不利
  const goodForJudger = reason === '八卦阵' ? hit : (c => !hit(c));
  const mine = !judger || judger === p;
  const want = mine ? goodForJudger : (c => !goodForJudger(c));
  if (want(judgeCard)) return null; // 当前结果已合意，不必消耗手牌

  // 保守：除闪电（3 点伤害，值得押注）外，留一张手牌
  const spare = reason === '闪电' ? 1 : 2;
  if (p.hand.length < spare) return null;
  return p.hand.find(c => want(c) && c.name !== 'tao' && c.name !== 'wuxie') || null;
}

// 观星：好牌留在牌堆顶（自己下一步就摸），废牌沉底
export function chooseGuanxing(game, p, cards) {
  const value = c => ({
    tao: 9, wuzhong: 8, sha: 7, shan: 6,
  }[c.name] ?? (c.type === 'equip' ? 6 : 5));
  const sorted = [...cards].sort((a, b) => value(b) - value(a));
  // 摸牌阶段摸 2 张：留最多 2 张好牌在顶，其余（价值 <= 5 的废牌）沉底
  const top = sorted.filter((c, i) => i < 2 && value(c) > 5);
  const bottom = sorted.filter(c => !top.some(x => x.id === c.id));
  return { top, bottom };
}

// 是否发动可选技能/装备效果
export function chooseInvoke(game, p, skillId, info = {}) {
  if (skillId === 'hanbing') {
    // 寒冰剑：防止伤害改为弃两张牌。对方有奸雄/反馈（受伤有收益）或体力充裕且牌多时发动
    const t = info.target;
    if (!t) return false;
    const n = t.hand.length + Object.values(t.equip).filter(Boolean).length;
    if (n < 2) return false;
    if (hasSkill(t, 'jianxiong') || hasSkill(t, 'fankui')) return t.hp > 1;
    return t.hp >= 3 && n >= 3;
  }
  // 奸雄/反馈：收益为正必发；八卦阵：必判；雌雄：必发
  return ['jianxiong', 'fankui', 'bagua', 'cixiong'].includes(skillId);
}
