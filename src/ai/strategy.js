// AI 启发式策略（纯函数，输入局面，输出决策）
// 友敌判断统一来自 perception.js（只使用合法可知的信息）；1v1 下对手恒为敌人。
import {
  canUseInPlayPhase, canUseZhangbaSha, canUseAsSha, canZhangbaPair, JUDGE_EFFECTIVE,
  legalTargets, zhangbaTargets, canJiedaoVictim, canUseJijiang, canTarget, canUseCardAs, isRed,
  shaLeftOf, inAttackRange,
} from '../data/cards.js';
import { hasSkill, isMale } from '../data/heroes.js';
import { canUseSkill, skillTargetCandidates } from '../data/active-skills.js';
import { relationOf, isEnemy, isFriend, friendsOf, byThreat } from './perception.js';

// 以 name 名义使用实体牌 c 的动作牌（引擎会重新规范化并校验转化来源）
const as = (c, name) => ({ ...c, virtual: true, real: c, reals: [c], name });
const vsha = c => as(c, 'sha');
// 自己的牌（手牌 + 装备区），用于可用装备作素材的转化技
const ownCards = p => [...p.hand, ...Object.values(p.equip).filter(Boolean)];

// 从合法目标中挑最该打的敌人
function bestEnemy(game, p, targets) {
  return targets.filter(t => isEnemy(game, p, t)).sort(byThreat(game, p))[0] || null;
}

// 群体伤害是否划算：波及的敌人多于友方（1v1 恒划算）
function aoeWorth(game, p) {
  const others = game.others(p);
  const foes = others.filter(o => isEnemy(game, p, o)).length;
  const pals = others.filter(o => isFriend(game, p, o)).length;
  return foes > 0 && foes > pals;
}

// 手牌价值（越低越先弃/先交出）
const value = c => ({ tao: 9, wuxie: 8, shan: 6, sha: 5 }[c.name] ?? (c.type === 'equip' ? 4 : 3));

// 出牌阶段决策：返回 {card, targets[, victim]} | {cards, card, targets} | {skillId, cards, targets} | null
export function choosePlay(game, p) {
  const hand = p.hand;
  const find = pred => hand.find(pred);
  // 使用条件与目标合法性统一走引擎判据，避免提交非法出牌造成空转
  const usable = c => canUseInPlayPhase(game, p, c);
  const enemyFor = (c, as) => bestEnemy(game, p, legalTargets(game, p, c, as));

  // 1. 回血
  const tao = find(c => c.name === 'tao' && usable(c));
  if (tao) return { card: tao, targets: [] };

  // 2. 乐不思蜀（含国色：方块牌当【乐不思蜀】，不用【桃】）
  for (const le of hand.filter(c => c.name === 'le' && usable(c))) {
    const t = enemyFor(le);
    if (t) return { card: le, targets: [t] };
  }
  for (const c of ownCards(p).filter(x => x.name !== 'le' && x.name !== 'tao'
    && canUseInPlayPhase(game, p, x, 'le'))) {
    const t = enemyFor(c, 'le');
    if (t) return { card: as(c, 'le'), targets: [t] };
  }

  // 3. 上装备（武器 > 防具 > 马）
  for (const c of hand) {
    if (c.type === 'equip' && !p.equip[c.subType]) return { card: c, targets: [] };
  }

  // 4. 无中生有
  const wz = find(c => c.name === 'wuzhong' && usable(c));
  if (wz) return { card: wz, targets: [] };

  // 5. 顺手牵羊 / 过河拆桥：友方判定区有乐时帮其拆掉，否则针对敌人
  //    奇袭：黑色牌当【过河拆桥】（不拆掉自己的防御牌与仍用得上的【杀】）
  const spareBlack = x => x.name !== 'guohe' && !['wuxie', 'shan', 'tao'].includes(x.name)
    && !(x.name === 'sha' && shaLeftOf(p) > 0) && canUseInPlayPhase(game, p, x, 'guohe');
  const trickUses = [
    ...['shunshou', 'guohe'].flatMap(name => hand.filter(x => x.name === name && usable(x)).map(c => [c, name])),
    ...ownCards(p).filter(spareBlack).map(c => [c, 'guohe']),
  ];
  for (const [c, name] of trickUses) {
    const ts = legalTargets(game, p, c, name);
    const rescue = game.mode === 'identity'
      && ts.find(t => isFriend(game, p, t) && t.judgeZone.some(j => (j.delayedAs || j.name) === 'le'));
    const t = rescue || bestEnemy(game, p, ts);
    if (t) return { card: c.name === name ? c : as(c, name), targets: [t] };
  }

  // 6. 杀（次数上限/攻击范围由判据决定）
  for (const c of hand.filter(x => x.name === 'sha' && usable(x))) {
    const t = enemyFor(c);
    if (t) return { card: c, targets: [t] };
  }
  // 武圣/龙胆：转化为【杀】（保留桃）
  for (const c of hand.filter(x => x.name !== 'tao' && canUseAsSha(p, x) && canUseInPlayPhase(game, p, x, 'sha'))) {
    const t = enemyFor(c, 'sha');
    if (t) return { card: vsha(c), targets: [t] };
  }
  // 丈八蛇矛：两张手牌当杀
  if (canUseZhangbaSha(game, p)) {
    const pair = zhangbaPair(p);
    const t = pair && bestEnemy(game, p, zhangbaTargets(game, p));
    if (t) return { cards: pair, card: pair[0], targets: [t] };
  }
  // 激将（主公刘备）：令蜀势力角色代出【杀】
  if (canUseJijiang(game, p)) {
    const t = bestEnemy(game, p, game.others(p).filter(o => canTarget(game, p, o, 'sha')));
    if (t) return { skillId: 'jijiang', targets: [t] };
  }

  // 7. 决斗（手牌杀多或对方残血）
  const shaCount = hand.filter(c => c.name === 'sha').length;
  for (const c of hand.filter(x => x.name === 'juedou' && usable(x))) {
    const t = enemyFor(c);
    if (t && (shaCount >= 2 || t.hp <= 1)) return { card: c, targets: [t] };
  }

  // 7.5 借刀杀人：借敌人的刀杀敌人（缴械也有收益）
  for (const c of hand.filter(x => x.name === 'jiedao' && usable(x))) {
    const holders = legalTargets(game, p, c).filter(t => isEnemy(game, p, t)).sort(byThreat(game, p));
    for (const h of holders) {
      const victims = game.alivePlayers().filter(v => canJiedaoVictim(game, p, h, v));
      const v = victims.filter(x => x !== p && isEnemy(game, p, x)).sort(byThreat(game, p))[0]
        || (game.mode === '1v1' ? victims[0] : null);
      if (v) return { card: c, targets: [h], victim: v };
    }
  }

  // 8. 南蛮/万箭：波及敌人多于友方时使用
  if (aoeWorth(game, p)) {
    const nm = find(c => c.name === 'nanman' && usable(c));
    if (nm) return { card: nm, targets: [] };
    const wj = find(c => c.name === 'wanjian' && usable(c));
    if (wj) return { card: wj, targets: [] };
  }

  // 9. 五谷/桃园：桃园只在己方受伤不少于敌方时使用
  const ty = find(c => c.name === 'taoyuan' && usable(c));
  if (ty) {
    const wounded = pred => game.alivePlayers().filter(x => x.hp < x.maxHp && pred(x)).length;
    const mine = wounded(x => isFriend(game, p, x));
    const theirs = wounded(x => !isFriend(game, p, x));
    if (mine > 0 && mine >= theirs) return { card: ty, targets: [] };
  }
  const wg = find(c => c.name === 'wugu' && usable(c));
  if (wg) return { card: wg, targets: [] };

  // 10. 闪电（血量健康时赌一把）
  const sd = find(c => c.name === 'shandian' && usable(c));
  if (sd && p.hp >= 3) return { card: sd, targets: [] };

  // 11. 主动技能：青囊/结姻（回血）、反间/离间（伤敌）、苦肉（换牌）
  const skillAct = chooseActiveSkill(game, p);
  if (skillAct) return skillAct;

  // 12. 制衡：手牌多且攻击牌少时换牌
  const zhihengCards = pickZhiheng(game, p);
  if (hasSkill(p, 'zhiheng') && !p.flags.zhihengUsed && zhihengCards.length >= 2) {
    return { skillId: 'zhiheng', cards: zhihengCards };
  }

  // 13. 仁德：身份局把多余手牌交给友方；1v1 残血时凑 2 张回血
  if (hasSkill(p, 'rende') && hand.length > 0) {
    if (game.mode === 'identity') {
      const pals = friendsOf(game, p).filter(o => o !== p && relationOf(game, p, o) >= 1)
        .sort((a, b) => a.hand.length - b.hand.length);
      const extra = hand.length - p.hp;
      const needHeal = p.hp < p.maxHp && !p.flags.rendeHealed;
      if (pals[0] && (extra > 0 || needHeal)) {
        const n = Math.min(hand.length, Math.max(1, extra, needHeal ? 2 - (p.flags.rendeGiven || 0) : 0));
        return { skillId: 'rende', cards: [...hand].sort((a, b) => value(a) - value(b)).slice(0, n), targets: [pals[0]] };
      }
    } else if (p.hp <= 1 && hand.length >= 2) {
      const gives = hand.filter(c => c.name === 'shan').slice(0, 2);
      if (gives.length === 2) return { skillId: 'rende', cards: gives, targets: [game.opponentOf(p)] };
    }
  }

  return null;
}

// 主动技能决策（规则判据来自 active-skills.js，AI 只决定是否划算与选谁）
function chooseActiveSkill(game, p) {
  const low = [...p.hand].sort((a, b) => value(a) - value(b));
  const hurt = t => t.hp < t.maxHp;
  // 青囊：回复自己或友方
  if (canUseSkill(game, p, 'qingnang') && low.length) {
    const cands = skillTargetCandidates(game, p, 'qingnang');
    const t = cands.find(x => x === p && hurt(x)) || cands.filter(x => isFriend(game, p, x) && relationOf(game, p, x) >= 1)
      .sort((a, b) => a.hp - b.hp)[0];
    if (t && value(low[0]) < 9) return { skillId: 'qingnang', cards: [low[0]], targets: [t] };
  }
  // 结姻：自己受伤、或友方男性受伤
  if (canUseSkill(game, p, 'jieyin') && low.length >= 2) {
    const t = skillTargetCandidates(game, p, 'jieyin')
      .filter(x => isFriend(game, p, x) && relationOf(game, p, x) >= 1).sort((a, b) => a.hp - b.hp)[0];
    if (t && (hurt(p) || t.hp <= 2) && value(low[1]) < 8) return { skillId: 'jieyin', cards: low.slice(0, 2), targets: [t] };
  }
  // 反间：对敌人使用（1/4 概率猜中花色，期望收益为正）
  if (canUseSkill(game, p, 'fanjian')) {
    const t = bestEnemy(game, p, skillTargetCandidates(game, p, 'fanjian'));
    if (t) return { skillId: 'fanjian', targets: [t] };
  }
  // 离间：让两名敌人（或敌人与未知者）决斗，先选的是受害者
  if (canUseSkill(game, p, 'lijian')) {
    const pool = [...p.hand, ...Object.values(p.equip).filter(Boolean)].sort((a, b) => value(a) - value(b));
    const v = skillTargetCandidates(game, p, 'lijian').filter(x => isEnemy(game, p, x)).sort(byThreat(game, p))[0];
    const u = v && skillTargetCandidates(game, p, 'lijian', [v]).filter(x => !isFriend(game, p, x) || relationOf(game, p, x) < 1)
      .sort((a, b) => b.hand.length - a.hand.length)[0];
    if (v && u && pool[0] && value(pool[0]) < 8) return { skillId: 'lijian', cards: [pool[0]], targets: [v, u] };
  }
  // 苦肉：体力充裕时换牌（有【桃】时可多用一次）
  if (canUseSkill(game, p, 'kurou')) {
    const hasTao = p.hand.some(c => c.name === 'tao');
    if (p.hp > 2 || (p.hp === 2 && hasTao)) return { skillId: 'kurou' };
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
  const { type, reason, info = {} } = req;
  // 激将/护驾：只替友方主公代出
  if ((reason === 'jijiang' || reason === 'hujia') && !isFriend(game, p, info.lord)) return null;
  if (type === 'shan') {
    // 真【闪】优先，其次转化（龙胆的【杀】、倾国的黑色牌，不用【桃】/【无懈】）
    const real = hand.find(c => c.name === 'shan');
    if (real) return real;
    const conv = [...hand].sort((a, b) => value(a) - value(b))
      .find(c => !['tao', 'wuxie'].includes(c.name) && canUseCardAs(p, c, 'shan', game));
    return conv ? { card: conv, as: 'shan' } : null;
  }
  if (type === 'sha') {
    const shas = hand.filter(c => c.name === 'sha');
    // 武圣/龙胆：转化为【杀】（保留桃）
    const virtualSha = hand.find(c => c.name !== 'tao' && canUseAsSha(p, c));
    const use = c => (c.name === 'sha' ? c : { card: c, as: 'sha' });
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
      // 被迫杀的若是友方，宁可交出武器
      if (info.victim && info.victim !== p && game.mode === 'identity' && isFriend(game, p, info.victim)) return null;
      return shas[0] ? use(shas[0]) : fallback();
    }
    return shas[0] ? use(shas[0]) : fallback();
  }
  return null;
}

// 濒死求桃：救自己；身份局救友方（主公濒死时忠臣/反贼未清的内奸必救）
export function choosePeach(game, p, info) {
  // 真【桃】优先，其次急救（回合外红色牌当【桃】）
  const tao = p.hand.find(c => c.name === 'tao')
    || [...ownCards(p)].sort((a, b) => value(a) - value(b)).find(c => canUseCardAs(p, c, 'tao', game));
  if (!tao) return null;
  const d = info.dying;
  if (d === p) return tao;
  if (game.mode !== 'identity') return null; // 1v1 不救对手
  return relationOf(game, p, d) >= 1 ? tao : null;
}

// 无懈可击
const HARMFUL = ['决斗', '南蛮入侵', '万箭齐发', '过河拆桥', '顺手牵羊', '乐不思蜀', '闪电', '借刀杀人'];
export function chooseNullify(game, p, effect) {
  const wx = p.hand.find(c => c.name === 'wuxie');
  if (!wx) return null;
  const { target, source } = effect;
  if (effect.isNullify) {
    // 敌人打出无懈多半是在破坏对我方有利的结算：反制
    return source && source !== p && isEnemy(game, p, source) ? wx : null;
  }
  if (!HARMFUL.includes(effect.name) || !target) return null;
  const mine = target === p;
  if (!mine && relationOf(game, p, target) < 1) return null;
  if (source && source !== p && isFriend(game, p, source) && relationOf(game, p, source) >= 1) return null;
  if (effect.name === '乐不思蜀' || effect.name === '闪电') return wx;
  if (['决斗', '南蛮入侵', '万箭齐发'].includes(effect.name)) return target.hp <= 2 ? wx : null;
  return null;
}

// 通用选牌
export function chooseCards(game, p, opts) {
  const { count, from, reason, optional, info } = opts;
  if (from === 'self' || from === 'discard-phase') {
    const hand = [...p.hand];
    if (hand.length < count) return null;
    if (reason === 'ganglie') {
      // 刚烈：残血或手牌多时弃两张，否则选择受到伤害
      if (!(p.hp <= 1 || p.hand.length >= 4)) return null;
      return hand.sort((a, b) => value(a) - value(b)).slice(0, 2);
    }
    if (reason === 'liuli') {
      const pool = [...hand, ...(opts.includeEquip ? Object.values(p.equip).filter(Boolean) : [])];
      return [pool.sort((a, b) => value(a) - value(b))[0]].filter(Boolean);
    }
    if (reason === 'guanshi') {
      if (!optional) return null;
      // 强制命中收益：对方残血时值得
      const target = info?.target;
      if (!target || target.hp > 2 || p.hand.length < 3) return null;
      return hand.sort((a, b) => value(a) - value(b)).slice(0, 2);
    }
    return hand.sort((a, b) => value(a) - value(b)).slice(0, count);
  }
  if (from === 'target-area') {
    const t = info?.target;
    if (!t) return null;
    // 身份局友方：只拿走其判定区的乐/闪电（帮忙）
    if (game.mode === 'identity' && !opts.noJudge && isFriend(game, p, t)) {
      const bad = t.judgeZone.find(c => c.name === 'le' || c.name === 'shandian');
      if (bad) return [bad.name];
    }
    // 拆/顺优先级：武器 > 防具 > 判定区乐 > 手牌 > 马（反馈/寒冰剑不可选判定区）
    if (t.equip.weapon) return ['weapon'];
    if (t.equip.armor) return ['armor'];
    const le = !opts.noJudge && game.mode === '1v1' && t.judgeZone.find(c => c.name === 'le');
    if (le) return ['le'];
    if (t.hand.length > 0) return ['hand'];
    if (t.equip['horse+']) return ['horse+'];
    if (t.equip['horse-']) return ['horse-'];
    if (!opts.noJudge && t.judgeZone[0]) return [t.judgeZone[0].name];
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
    const v = c => ({ tao: 9, wuzhong: 8 }[c.name] ?? (c.type === 'equip' ? 6 : 4));
    return [[...cands].sort((a, b) => v(b) - v(a))[0]];
  }
  return null;
}

// 鬼才改判：返回用于替换的手牌或 null
// 判定者是自己或友方时求有利结果，是敌人时求不利结果，未知则不插手。
export function chooseJudgeReplace(game, p, info) {
  const { judgeCard, reason, player: judger } = info;
  const hit = JUDGE_EFFECTIVE[reason];
  if (!hit) return null;
  // 八卦阵命中对判定者有利，闪电/乐命中对判定者不利
  const goodForJudger = reason === '八卦阵' ? hit : (c => !hit(c));
  const mine = !judger || judger === p || isFriend(game, p, judger);
  if (!mine && !isEnemy(game, p, judger)) return null;
  const want = mine ? goodForJudger : (c => !goodForJudger(c));
  if (want(judgeCard)) return null; // 当前结果已合意，不必消耗手牌

  // 保守：除闪电（3 点伤害，值得押注）外，留一张手牌
  const spare = reason === '闪电' ? 1 : 2;
  if (p.hand.length < spare) return null;
  return p.hand.find(c => want(c) && c.name !== 'tao' && c.name !== 'wuxie') || null;
}

// 观星：好牌留在牌堆顶（自己下一步就摸），废牌沉底
export function chooseGuanxing(game, p, cards) {
  const v = c => ({ tao: 9, wuzhong: 8, sha: 7, shan: 6 }[c.name] ?? (c.type === 'equip' ? 6 : 5));
  const sorted = [...cards].sort((a, b) => v(b) - v(a));
  // 摸牌阶段摸 2 张：留最多 2 张好牌在顶，其余（价值 <= 5 的废牌）沉底
  const top = sorted.filter((c, i) => i < 2 && v(c) > 5);
  const bottom = sorted.filter(c => !top.some(x => x.id === c.id));
  return { top, bottom };
}

// 是否发动可选技能/装备效果
export function chooseInvoke(game, p, skillId, info = {}) {
  switch (skillId) {
    case 'hanbing': {
      // 寒冰剑：防止伤害改为弃两张牌。对方有奸雄/反馈（受伤有收益）或体力充裕且牌多时发动
      const t = info.target;
      if (!t) return false;
      const n = t.hand.length + Object.values(t.equip).filter(Boolean).length;
      if (n < 2) return false;
      if (hasSkill(t, 'jianxiong') || hasSkill(t, 'fankui')) return t.hp > 1;
      return t.hp >= 3 && n >= 3;
    }
    // 反馈：不拿友方的牌
    case 'fankui': return game.mode !== 'identity' || !isFriend(game, p, info.source);
    // 雌雄双股剑：只对非友方
    case 'cixiong': return game.mode !== 'identity' || !isFriend(game, p, info.target);
    // 激将/护驾：自己没有可出的牌时才求援
    case 'jijiang':
    case 'hujia': return !info.hasOwn;
    // 刚烈：不对友方发动
    case 'ganglie': return game.mode !== 'identity' || !isFriend(game, p, info.source);
    // 铁骑：不对友方发动
    case 'tieji': return game.mode !== 'identity' || !isFriend(game, p, info.target);
    // 裸衣：手里有【杀】或【决斗】且有敌人可打时发动
    case 'luoyi': {
      const hasAtk = p.hand.some(c => c.name === 'sha' || c.name === 'juedou' || canUseAsSha(p, c));
      return hasAtk && game.others(p).some(o => isEnemy(game, p, o) && inAttackRange(p, o, game));
    }
    case 'yingzi': case 'luoshen': case 'tiandu': case 'jizhi': case 'keji':
    case 'lianying': case 'xiaoji': case 'biyue': case 'yiji':
      return true;
    default:
      // 奸雄：收益为正必发；八卦阵：必判
      return ['jianxiong', 'bagua'].includes(skillId);
  }
}

// 选择角色：突袭（至多两名敌人的手牌）、遗计（分给自己或友方）、流离（转给敌人）
export function choosePlayers(game, p, opts) {
  const { reason, candidates = [], max = 1 } = opts;
  if (reason === 'tuxi') {
    const foes = candidates.filter(t => isEnemy(game, p, t)).sort((a, b) => b.hand.length - a.hand.length);
    // 两名敌人才划算（否则不如正常摸两张）
    return foes.length >= 2 ? foes.slice(0, max) : null;
  }
  if (reason === 'yiji') {
    const pal = candidates.filter(t => t !== p && isFriend(game, p, t) && relationOf(game, p, t) >= 1)
      .sort((a, b) => a.hand.length - b.hand.length)[0];
    // 自己手牌多于友方两张以上时分给友方，否则留给自己
    return [pal && p.hand.length >= pal.hand.length + 2 ? pal : p];
  }
  if (reason === 'liuli') {
    const t = bestEnemy(game, p, candidates);
    return t ? [t] : null;
  }
  return candidates.slice(0, Math.max(1, opts.min || 1));
}

// 反间：随机选择一种花色
export function chooseSuit() {
  return ['♠', '♥', '♣', '♦'][Math.floor(Math.random() * 4)];
}
