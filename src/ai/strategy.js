// AI 决策调度（纯函数，输入局面，输出决策）。
// 这里不写任何具体技能/卡牌的判断：每种牌与技能的决策写在其定义的 ai 字段里，
// 本模块只负责枚举合法选项（全部走 data/cards.js 与注册表的规则判据）并按优先级调用。
import {
  canUseInPlayPhase, canUseZhangbaSha, canUseCardAs, conversionNames,
} from '../data/cards.js';
import {
  getCard, defOf, aiOf, activeSkillsOf, canUseSkill, getSkill,
} from '../core/registry.js';
import {
  relationOf, asCard, ownCards, spareFor, byValue, lowest, pickArea, pickResponse, pairFor,
} from './util.js';

const DEFAULT_ORDER = 50;

// 出牌阶段可用的全部选项：实体牌、转化牌、多张当一张、主动技能
function playOptions(game, p) {
  const opts = [];
  // 实体牌以本名使用
  for (const c of p.hand) {
    if (canUseInPlayPhase(game, p, c)) opts.push({ kind: 'card', name: c.name, use: { card: c, real: c, name: c.name } });
  }
  // 转化：舍得的牌才转（不拆桃、防御牌、仍用得上的【杀】）
  for (const c of ownCards(p)) {
    for (const name of conversionNames(p, c, game)) {
      if (spareFor(game, p, c, name) && canUseInPlayPhase(game, p, c, name)) {
        opts.push({ kind: 'card', name, use: { card: asCard(c, name), real: c, name } });
      }
    }
  }
  // 多张手牌当【杀】（丈八蛇矛）
  if (canUseZhangbaSha(game, p)) {
    const pair = pairFor(p);
    if (pair) opts.push({ kind: 'pair', name: 'sha', pair, use: { card: pair[0], real: pair[0], name: 'sha', cards: pair } });
  }
  for (const id of activeSkillsOf(p)) {
    if (canUseSkill(game, p, id)) opts.push({ kind: 'skill', id });
  }
  const orderOf = o => (o.kind === 'skill' ? getSkill(o.id).ai?.order : getCard(o.name)?.ai?.order + (o.kind === 'pair' ? 1 : 0))
    ?? DEFAULT_ORDER;
  // 稳定排序：同优先级时实体牌先于转化牌
  return opts.map((o, i) => ({ o, i, k: orderOf(o) })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.o);
}

// 出牌阶段决策：返回 {card, targets[, victim]} | {cards, card, targets} | {skillId, cards, targets} | null
export function choosePlay(game, p) {
  for (const o of playOptions(game, p)) {
    if (o.kind === 'skill') {
      const play = aiOf(o.id, 'play');
      const r = play && play(game, p);
      if (r) return r;
      continue;
    }
    const play = aiOf(o.name, 'play');
    const r = play && play(game, p, o.use);
    if (r) return o.kind === 'pair' ? { ...r, cards: o.pair, card: o.pair[0] } : r;
  }
  return null;
}

// 响应牌：请求来源（卡牌/技能）的 ai.respond 优先，否则打出最合适的一张
export function chooseRespond(game, p, req) {
  const fn = defOf(req.reason)?.ai?.respond;
  return fn ? fn(game, p, req) : pickResponse(game, p, req.type);
}

// 濒死求桃：救自己；身份局救友方
export function choosePeach(game, p, info) {
  const tao = p.hand.find(c => c.name === 'tao')
    || [...ownCards(p)].sort(byValue).find(c => canUseCardAs(p, c, 'tao', game));
  if (!tao) return null;
  const d = info.dying;
  if (d === p) return tao;
  if (game.mode !== 'identity') return null; // 1v1 不救对手
  return relationOf(game, p, d) >= 1 ? tao : null;
}

// 无懈可击：由【无懈可击】定义的 ai.nullify 决定
export function chooseNullify(game, p, effect) {
  const wx = p.hand.find(c => canUseCardAs(p, c, 'wuxie', game));
  if (!wx) return null;
  const fn = aiOf('wuxie', 'nullify');
  return fn ? fn(game, p, effect, wx) : null;
}

// 通用选牌：reason 对应的定义给出决策；弃牌阶段等无定义的询问按牌价值选择
export function chooseCards(game, p, opts) {
  if (defOf(opts.reason)) {
    const fn = aiOf(opts.reason, 'chooseCards');
    if (fn) return fn(game, p, opts);
  }
  if (opts.from === 'target-area') return pickArea(game, p, opts);
  if (opts.from === 'self' || opts.from === 'discard-phase') {
    const pool = opts.includeEquip ? ownCards(p) : p.hand;
    return pool.length >= opts.count ? lowest(pool, opts.count) : null;
  }
  return null;
}

// 是否发动技能/装备效果
export function chooseInvoke(game, p, skillId, info = {}) {
  const fn = aiOf(skillId, 'invoke');
  return fn ? !!fn(game, p, info) : false;
}

// 选择角色
export function choosePlayers(game, p, opts) {
  const fn = aiOf(opts.reason, 'choosePlayers');
  if (fn) return fn(game, p, opts);
  return opts.optional ? null : (opts.candidates || []).slice(0, Math.max(1, opts.min || 1));
}

// 选择一项
export function chooseOption(game, p, opts) {
  const fn = aiOf(opts.reason, 'chooseOption');
  return fn ? fn(game, p, opts) : opts.options[0]?.id;
}

// 排列牌（观星）
export function chooseArrange(game, p, opts) {
  const fn = aiOf(opts.reason, 'arrange');
  return fn ? fn(game, p, opts) : { top: opts.cards, bottom: [] };
}
