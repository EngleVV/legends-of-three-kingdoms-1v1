// 注册中心：技能、卡牌、判定、武将、扩展包的唯一登记处。
//
// 引擎、界面、AI 都通过这里按 id 查定义，自身不写任何具体武将/卡牌的规则。
// 本模块不依赖任何其他模块（避免循环依赖）；各扩展包在 packs/index.js 中调用 registerPack 登记。
//
// ---------- 技能定义（defineSkill） ----------
// {
//   id, name, desc,
//   lord: true,                 主公技（仅身份为主公时拥有）
//   locked: true,               锁定技（界面标注；其触发效果不询问是否发动）
//   triggers: {                 触发技：挂在引擎时机上（见 EVENTS）
//     [event]: { can(ctx, owner, game), run(ctx, owner, game),
//                optional: false 不由引擎询问「是否发动」（技能在 run 内自行询问/选择）,
//                locked: true    强制发动，不询问,
//                info(ctx, owner, game) 询问「是否发动」时传给玩家/AI 的上下文（默认 ctx） },
//   },
//   modifiers: { [key]: fn },   锁定技的数值/规则修正（见 MODIFIERS）
//   viewAs: [{ as, ok(card), equip, when(game, p) }],  转化技：将牌当 as 使用或打出
//   active: { cards: {min,max,zone}, targets: {min,max,ok}, usable, limit: {phase: 1}, run },  主动技
//   judge: { name, effective(card), good },            该技能发起的判定（good：生效对判定者有利）
//   ai: { invoke, play, order, respond, chooseCards, choosePlayers, chooseOption, arrange },
//   prompt: { invoke, respond, chooseCards, choosePlayers, chooseOption, active, target },
// }
//
// 卡牌定义与技能共用 triggers/modifiers/viewAs/ai/prompt 字段：装备牌在装备区时，其效果与技能一样参与结算。
// 卡牌另有：kind 牌类（火杀 → sha）、nature 属性、rescue 濒死可用（'any' 桃 | 'self' 酒）、
//   target.max 多目标、recast 可重铸、onLose(game, player, card) 离开装备区时（白银狮子）。

// 引擎提供的全部时机（技能只能挂在这些时机上，完整性测试会校验）
export const EVENTS = {
  phaseStart: '进入阶段 {player, phase}',
  beforePhase: '阶段开始前，可跳过 {player, phase, skip}',
  drawPhase: '摸牌阶段摸牌前 {player, count, done}',
  beforeJudge: '判定牌生效前，可改判 {player, reason, card, replacedBy}',
  afterJudge: '判定牌生效后 {player, reason, card, effective}',
  needResponse: '需要使用/打出牌时，可由技能或装备提供 {player, req, own, result}',
  cardUsed: '使用牌时 {player, card, targets}',
  cardResponded: '打出牌后 {player, card, req}',
  becomingTarget: '成为【杀】的目标时，可转移 {card, source, target}',
  targetConfirmed: '【杀】指定目标后 {card, source, target, noShan, nullified}',
  slashDodged: '【杀】被【闪】抵消时，可令其依然命中 {card, source, target, hit}',
  slashMissed: '【杀】最终被抵消后 {card, source, target}',
  beforeDamage: '造成伤害时（来源方：酒、裸衣、古锭刀、寒冰剑），可改变伤害值或防止 {source, target, amount, card, nature, prevented}',
  receiveDamage: '受到伤害时（目标方：藤甲、白银狮子），可改变伤害值 {source, target, amount, card, nature, prevented}',
  damaged: '受到伤害后 {source, target, amount, card, nature}',
  peachUsed: '濒死时对其使用【桃】 {source, target, amount, notes}',
  afterLoseCards: '失去牌后 {player, lastHand, equips}',
};

// 修正点：技能/装备的锁定效果，由规则函数汇总
//   sum：各效果返回值相加；chain：依次变换数值；any：任一为真；allow：任一返回 false 即禁止
export const MODIFIERS = {
  distanceFrom: 'sum',     // (ctx:{from,to}) 你计算与其他角色的距离修正（马术、-1 马）
  distanceTo: 'sum',       // (ctx:{from,to}) 其他角色计算与你的距离修正（+1 马）
  attackRange: 'chain',    // (value) 攻击范围
  shaLimit: 'chain',       // (value) 出牌阶段【杀】的次数上限（咆哮、诸葛连弩）
  handLimit: 'chain',      // (value) 手牌上限
  extraResponses: 'sum',   // (ctx:{kind, from, to}) 你要求对方额外打出的张数（无双）
  noDistanceLimit: 'any',  // (ctx:{card, from, to}) 你使用该牌无距离限制（奇才）
  ignoreArmor: 'any',      // (ctx:{from, to}) 你的【杀】无视防具（青釭剑）
  targetable: 'allow',     // (ctx:{card: 牌类, from, to}) 你能否成为该牌的目标（空城、谦逊）
  effective: 'allow',      // (ctx:{card: 牌, kind: 牌类, nature, from, to}) 该牌对你是否有效（藤甲）
};

// 牌名/武器攻击范围（由卡牌定义登记时填充，界面与战报直接使用）
export const CARD_NAME = {};
export const EQUIP_RANGE = {};

const SKILLS = new Map();
const CARDS = new Map();
const JUDGES = new Map();
const CARD_BY_CN = new Map();
export const PACKS = [];
export const HEROES = {};
export const HERO_LIST = [];
export const LORD_HEROES = [];
export const SKILL_INFO = {};

export function defineSkill(spec) {
  if (!spec?.id) throw new Error('技能缺少 id');
  return spec;
}

export function defineCard(spec) {
  if (!spec?.id) throw new Error('卡牌缺少 id');
  return spec;
}

function registerJudge(j, owner) {
  if (!j) return;
  if (JUDGES.has(j.name) && JUDGES.get(j.name).owner !== owner) throw new Error(`判定【${j.name}】重复登记`);
  JUDGES.set(j.name, { ...j, owner });
}

export function registerSkill(s) {
  if (SKILLS.has(s.id)) throw new Error(`技能 ${s.id} 重复登记`);
  SKILLS.set(s.id, s);
  SKILL_INFO[s.id] = [s.name, s.desc];
  registerJudge(s.judge, s.id);
}

export function registerCard(c) {
  if (CARDS.has(c.id)) throw new Error(`卡牌 ${c.id} 重复登记`);
  CARDS.set(c.id, c);
  CARD_BY_CN.set(c.name, c);
  CARD_NAME[c.id] = c.name;
  if (c.range) EQUIP_RANGE[c.id] = c.range;
  registerJudge(c.judge, c.id);
}

// pack = { id, name, avatarDir, heroes: [], skills: [], cards: [], deck: [] }
export function registerPack(pack) {
  if (PACKS.some(p => p.id === pack.id)) return;
  PACKS.push(pack);
  for (const c of pack.cards || []) registerCard(c);
  for (const s of pack.skills || []) registerSkill(s);
  for (const h of pack.heroes || []) {
    if (HEROES[h.id]) throw new Error(`武将 ${h.id} 重复登记`);
    const hero = { lordSkills: [], ...h, pack: pack.id };
    hero.avatar = h.avatar || `${pack.avatarDir || 'assets/heroes'}/${h.id}.png`;
    HEROES[h.id] = hero;
    HERO_LIST.push(hero);
    if (hero.lordSkills.length) LORD_HEROES.push(hero.id);
  }
}

export const getSkill = id => SKILLS.get(id) || null;
export const getCard = id => CARDS.get(id) || null;
export const cardByCN = cn => CARD_BY_CN.get(cn) || null;
export const allSkills = () => [...SKILLS.values()];
export const allCards = () => [...CARDS.values()];
export const judgeSpec = name => JUDGES.get(name) || null;
// 按 id 查技能或卡牌定义（询问的 reason 即技能/卡牌 id）
export const defOf = id => SKILLS.get(id) || CARDS.get(id) || null;

// 牌类：火【杀】/雷【杀】的牌类是【杀】（卡牌定义 kind），凡「【杀】」的规则都按牌类判断
export const kindOf = name => CARDS.get(name)?.kind || name;
// 属性：normal | fire | thunder
export const natureOf = name => CARDS.get(name)?.nature || 'normal';

export const skillName = id => SKILLS.get(id)?.name || CARDS.get(id)?.name || id;
export const skillDesc = id => SKILLS.get(id)?.desc || CARDS.get(id)?.desc || '';
export const isMale = p => (p.hero || p).gender === 'male';

// ---------- 角色拥有的技能与效果 ----------
// 武将技能 + 主公技（仅主公）+ 获得的技能 − 失去的技能
export function skillIdsOf(p) {
  const h = p.hero;
  const ids = [...h.skills, ...(p.role === 'lord' ? h.lordSkills || [] : []), ...(p.gainedSkills || [])];
  const lost = p.lostSkills || [];
  return [...new Set(ids)].filter(id => !lost.includes(id));
}

export function hasSkill(p, id) {
  return skillIdsOf(p).includes(id);
}

export function hasLordSkill(p, id) {
  return !!SKILLS.get(id)?.lord && hasSkill(p, id);
}

export function skillsOf(p) {
  return skillIdsOf(p).map(id => SKILLS.get(id)).filter(Boolean);
}

// 装备区的牌作为效果来源（与技能统一参与时机与修正）
export function equipEffectsOf(p) {
  return Object.values(p.equip || {}).filter(Boolean).map(c => CARDS.get(c.name)).filter(Boolean);
}

export function effectsOf(p) {
  return [...skillsOf(p), ...equipEffectsOf(p)];
}

// ---------- 修正汇总 ----------
export function modify(p, key, base, ctx = {}, game = null) {
  const kind = MODIFIERS[key];
  if (!kind) throw new Error(`未知修正点 ${key}`);
  let v = base;
  for (const e of effectsOf(p)) {
    const fn = e.modifiers?.[key];
    if (!fn) continue;
    const r = fn(kind === 'chain' ? v : ctx, p, game, ctx);
    if (kind === 'sum') v += r || 0;
    else if (kind === 'chain') v = r ?? v;
    else if (kind === 'any' && r) return true;
    else if (kind === 'allow' && r === false) return false;
  }
  if (kind === 'any') return false;
  if (kind === 'allow') return true;
  return v;
}

// ---------- 转化技 ----------
export function viewAsOf(p) {
  return effectsOf(p).flatMap(e => (e.viewAs || []).map(v => ({ ...v, skill: e.id })));
}

// 多张牌当一张牌（丈八蛇矛：两张手牌当【杀】）
export function multiViewAsOf(p, as) {
  return viewAsOf(p).filter(v => v.count > 1 && (!as || v.as === as));
}

// 使 allow 型修正返回 false 的效果 id（空城、谦逊、藤甲……），无则 null
export function effectBlocker(p, key, ctx, game = null) {
  for (const e of effectsOf(p)) {
    const fn = e.modifiers?.[key];
    if (fn && fn(ctx, p, game, ctx) === false) return e.id;
  }
  return null;
}

export const targetBlocker = (p, ctx, game = null) => effectBlocker(p, 'targetable', ctx, game);

// ---------- 主动技能 ----------
export function activeSkillsOf(p) {
  return skillIdsOf(p).filter(id => SKILLS.get(id)?.active);
}

// 出牌阶段限次：limit = { phase: 1 } 等，次数记在对应作用域的技能状态里
export function usesLeft(p, id) {
  const lim = SKILLS.get(id)?.active?.limit;
  if (!lim) return Infinity;
  const [scope, n] = Object.entries(lim)[0];
  return n - (p.st(scope, id).uses || 0);
}

export function markSkillUsed(p, id) {
  const lim = SKILLS.get(id)?.active?.limit;
  if (!lim) return;
  const [scope] = Object.keys(lim);
  const s = p.st(scope, id);
  s.uses = (s.uses || 0) + 1;
}

export function canUseSkill(game, p, id) {
  const a = SKILLS.get(id)?.active;
  if (!a || !hasSkill(p, id)) return false;
  return usesLeft(p, id) > 0 && (!a.usable || a.usable(game, p));
}

// 当前还能选的目标（按已选目标递进计算）
export function skillTargetCandidates(game, p, id, picked = []) {
  const a = SKILLS.get(id)?.active;
  if (!a || !a.targets?.max || picked.length >= a.targets.max) return [];
  return game.alivePlayers().filter(t => a.targets.ok(game, p, t, picked));
}

function ownsFor(p, c, zone) {
  if (!c) return false;
  if (p.hand.some(h => h.id === c.id)) return true;
  return zone === 'any' && Object.values(p.equip).some(e => e && e.id === c.id);
}

// 引擎入口的完整校验：牌的数量/区域、目标的数量/顺序合法性
export function validateSkill(game, p, action) {
  const a = SKILLS.get(action.skillId)?.active;
  if (!a || !canUseSkill(game, p, action.skillId)) return false;
  const cards = action.cards || [];
  const targets = action.targets || [];
  const c = a.cards || { min: 0, max: 0 };
  const t = a.targets || { min: 0, max: 0 };
  if (cards.length < c.min || cards.length > c.max) return false;
  if (new Set(cards.map(x => x?.id)).size !== cards.length) return false;
  if (!cards.every(x => ownsFor(p, x, c.zone))) return false;
  if (targets.length < t.min || targets.length > t.max) return false;
  const picked = [];
  for (const x of targets) {
    if (!x?.alive || !t.ok(game, p, x, picked)) return false;
    picked.push(x);
  }
  return true;
}

// ---------- AI 缺失检测 ----------
// AI 遇到某技能/卡牌缺少所需决策函数时记录一次（完整性测试断言为空）
export const MISSING_AI = new Set();
export function aiOf(id, fn) {
  const f = defOf(id)?.ai?.[fn];
  if (!f) MISSING_AI.add(`${id}.ai.${fn}`);
  return f || null;
}
