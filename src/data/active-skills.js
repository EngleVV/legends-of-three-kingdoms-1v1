// 出牌阶段主动技能表（唯一来源）：引擎校验、界面选牌/选目标、AI 决策都读这张表。
//   cards:   { min, max, zone: 'hand' | 'any'（手牌与装备区） }
//   targets: { min, max, ok(game, p, t, picked) }（picked 为已选目标，按选择顺序）
//   usable(game, p)：本阶段当前能否发动（含「出牌阶段限一次」）
//   lord：主公技（需身份为主公）
import { hasSkill, hasLordSkill, isMale } from './heroes.js';
import { canTarget, canUseJijiang } from './cards.js';

const once = id => p => !p.flags.used?.[id];
const wounded = t => t.hp < t.maxHp;
const ownCount = p => p.hand.length + Object.values(p.equip).filter(Boolean).length;

export const ACTIVE_SKILLS = {
  rende: {
    cards: { min: 1, max: Infinity, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat },
    usable: (g, p) => p.hand.length > 0,
  },
  zhiheng: {
    cards: { min: 1, max: Infinity, zone: 'any' },
    targets: { min: 0, max: 0 },
    usable: (g, p) => !p.flags.zhihengUsed && ownCount(p) > 0,
  },
  jijiang: {
    lord: true,
    cards: { min: 0, max: 0 },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat && canTarget(g, p, t, 'sha') },
    usable: (g, p) => canUseJijiang(g, p),
  },
  // 苦肉：失去 1 点体力，摸两张牌（不限次数）
  kurou: {
    cards: { min: 0, max: 0 },
    targets: { min: 0, max: 0 },
    usable: (g, p) => p.hp > 0,
  },
  // 反间：令一名其他角色选择花色，其获得你一张手牌，花色不同则受到 1 点伤害
  fanjian: {
    cards: { min: 0, max: 0 },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat },
    usable: (g, p) => once('fanjian')(p) && p.hand.length > 0,
  },
  // 结姻：弃两张手牌，你与一名已受伤的男性角色各回复 1 点体力
  jieyin: {
    cards: { min: 2, max: 2, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat && isMale(t) && wounded(t) },
    usable: (g, p) => once('jieyin')(p) && p.hand.length >= 2,
  },
  // 青囊：弃一张手牌，令一名已受伤的角色（可以是自己）回复 1 点体力
  qingnang: {
    cards: { min: 1, max: 1, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => wounded(t) },
    usable: (g, p) => once('qingnang')(p) && p.hand.length > 0,
  },
  // 离间：弃一张牌，选择两名男性角色，视为后选择的角色对先选择的角色使用【决斗】（不能被无懈）
  lijian: {
    cards: { min: 1, max: 1, zone: 'any' },
    targets: {
      min: 2, max: 2,
      ok: (g, p, t, picked) => {
        if (t.seat === p.seat || !isMale(t) || picked.some(x => x.seat === t.seat)) return false;
        // 第二个目标是【决斗】的使用者：先选的角色须能成为其【决斗】的目标（空城）
        if (picked.length === 1) return canTarget(g, t, picked[0], 'juedou');
        // 第一个目标须存在可对其使用【决斗】的另一名男性角色
        return g.others(p).some(u => u.seat !== t.seat && isMale(u) && canTarget(g, u, t, 'juedou'));
      },
    },
    usable: (g, p) => once('lijian')(p) && ownCount(p) > 0
      && g.others(p).filter(isMale).length >= 2,
  },
};

// 角色拥有的主动技能 id（主公技仅主公）
export function activeSkillsOf(p) {
  const ids = [...p.hero.skills, ...(p.role === 'lord' ? p.hero.lordSkills || [] : [])];
  return ids.filter(id => ACTIVE_SKILLS[id]);
}

export function canUseSkill(game, p, id) {
  const spec = ACTIVE_SKILLS[id];
  if (!spec) return false;
  const has = spec.lord ? hasLordSkill(p, id) : hasSkill(p, id);
  return has && spec.usable(game, p);
}

// 当前还能选的目标（按已选目标递进计算）
export function skillTargetCandidates(game, p, id, picked = []) {
  const spec = ACTIVE_SKILLS[id];
  if (!spec || !spec.targets.max || picked.length >= spec.targets.max) return [];
  return game.alivePlayers().filter(t => spec.targets.ok(game, p, t, picked));
}

// 可作为技能素材的牌是否属于自己（hand：仅手牌；any：手牌或装备区）
function ownsFor(p, c, zone) {
  if (!c) return false;
  if (p.hand.some(h => h.id === c.id)) return true;
  return zone === 'any' && Object.values(p.equip).some(e => e && e.id === c.id);
}

// 引擎入口的完整校验：牌的数量/区域、目标的数量/顺序合法性
export function validateSkill(game, p, action) {
  const spec = ACTIVE_SKILLS[action.skillId];
  if (!spec || !canUseSkill(game, p, action.skillId)) return false;
  const cards = action.cards || [];
  const targets = action.targets || [];
  if (cards.length < spec.cards.min || cards.length > spec.cards.max) return false;
  if (new Set(cards.map(c => c?.id)).size !== cards.length) return false;
  if (!cards.every(c => ownsFor(p, c, spec.cards.zone))) return false;
  if (targets.length < spec.targets.min || targets.length > spec.targets.max) return false;
  const picked = [];
  for (const t of targets) {
    if (!t?.alive || !spec.targets.ok(game, p, t, picked)) return false;
    picked.push(t);
  }
  return true;
}
