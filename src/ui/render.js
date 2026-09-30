// 渲染：状态 → DOM（全量重绘）
import {
  CARD_NAME, cardLabel, isRed, distance, attackRange,
  canUseInPlayPhase, canUseZhangbaSha, canUseCardAs, pairViewAs,
  shaLeftOf, shaLimitOf, EQUIP_RANGE, needsTarget, needsVictim, legalTargets, zhangbaTargets,
  canSecondTarget, conversionNames, conversionOf, judgeName, handLimitOf,
} from '../data/cards.js';
import {
  HEROES, HERO_LIST, PACKS, skillName, skillDesc, skillIdsOf, defOf, getSkill,
  activeSkillsOf, canUseSkill, skillTargetCandidates,
} from '../core/registry.js';
import { realsOf } from '../core/util.js';
import { ROLE_NAME, SIDE_NAME } from '../core/identity.js';

const SUIT_SYM = { '♠': '♠', '♥': '♥', '♣': '♣', '♦': '♦' };
const RANK_STR = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
// 官方牌面的类别标识
const TYPE_LABEL = { basic: '基本', trick: '锦囊', delayed: '延时锦囊' };
const SUBTYPE_LABEL = { weapon: '武器', armor: '防具', 'horse+': '坐骑', 'horse-': '坐骑' };

export function cardHtml(card, { small = false, selectable = false, selected = false, virtualSha = false, disabled = false } = {}) {
  const type = card.type || 'basic';
  const cls = ['card', isRed(card) ? 'red' : 'black', `t-${type}`];
  if (small) cls.push('small');
  if (selectable) cls.push('selectable');
  if (selected) cls.push('selected');
  if (virtualSha) cls.push('virtual-sha');
  // 官方：当前询问下不能使用的手牌置暗
  if (disabled) cls.push('disabled');
  const cname = CARD_NAME[card.name] || card.name;
  // 合成牌（丈八蛇矛）无花色/点数，需容错
  const rank = card.rank == null ? '' : (RANK_STR[card.rank] ?? card.rank);
  const suit = SUIT_SYM[card.suit] || '';
  // 类别标识：装备按子类显示「武器/防具/坐骑」，其余按牌类
  const cat = type === 'equip' ? (SUBTYPE_LABEL[card.subType] || '装备') : (TYPE_LABEL[type] || '');
  // 武器显示攻击范围（官方牌面右上角）
  const range = type === 'equip' && card.subType === 'weapon' ? EQUIP_RANGE[card.name] : null;
  // len-N 让 CSS 按牌名字数缩放字号，保证竖排单列不折行
  return `<div class="${cls.join(' ')}" data-card-id="${card.id}">
    <div class="corner"><span class="rank">${rank}</span><span class="suit">${suit}</span></div>
    ${range ? `<span class="range">${range}</span>` : ''}
    <div class="cname len-${cname.length}">${cname}</div>
    ${cat ? `<span class="cat">${cat}</span>` : ''}
  </div>`;
}

// 体力：官方勾玉，按剩余比例变色（残血脉动）
function hpHtml(p) {
  const hp = Math.max(0, p.hp);
  const ratio = p.maxHp > 0 ? hp / p.maxHp : 0;
  const state = hp <= 1 ? 'low' : ratio > 0.66 ? 'high' : ratio > 0.33 ? 'mid' : 'low';
  const full = '<i class="magatama full"></i>'.repeat(hp);
  const empty = '<i class="magatama empty"></i>'.repeat(Math.max(0, p.maxHp - hp));
  return `<div class="hp-hearts s-${state}">${full}${empty}<span class="hp-num">${p.hp}/${p.maxHp}</span></div>`;
}

const SLOT_LABEL = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };
const EQUIP_SLOTS = ['weapon', 'armor', 'horse+', 'horse-'];

// 装备区：固定 4 槽位，空槽显示占位，避免布局跳动
// pick 用于制衡等「可弃置装备」的场景，标记哪些装备可点选/已选
function equipHtml(p, pick = null, canPick = () => false) {
  return EQUIP_SLOTS.map(slot => {
    const c = p.equip[slot];
    const opts = c && pick && (canPick(c) || pick.has(c.id))
      ? { small: true, selectable: canPick(c), selected: pick.has(c.id) }
      : { small: true };
    return `<div class="slot" data-zone="equip:${slot}">
      <div class="zone-label">${SLOT_LABEL[slot]}</div>
      <div class="mini-cards">${c ? cardHtml(c, opts) : '<span class="slot-ph">—</span>'}</div>
    </div>`;
  }).join('');
}

// 判定区的牌按「生效牌名」显示（国色的方块牌显示为【乐不思蜀】）
const asJudge = c => (c.delayedAs ? { ...c, name: c.delayedAs, type: 'delayed' } : c);
function judgeHtml(p) {
  const cards = p.judgeZone.map(c => cardHtml(asJudge(c), { small: true })).join('');
  return `<div class="zone judge" data-zone="judge">
    <div class="zone-label">判定区</div>
    <div class="mini-cards">${cards || '<span class="slot-ph">—</span>'}</div>
  </div>`;
}

// 对手手牌：牌背堆叠（最多画 8 张）
function handBackHtml(n) {
  const backs = '<i class="cardback"></i>'.repeat(Math.min(n, 8));
  return `<div class="hand-back"><div class="backs">${backs}</div><span class="hand-num">手牌 ${n}</span></div>`;
}

const KINGDOM_CLASS = { 蜀: 'k-shu', 魏: 'k-wei', 吴: 'k-wu', 群: 'k-qun' };

// 身份徽章：自己、主公、已阵亡者明示，其余为「?」（官方身份局）
const ROLE_SHORT = { lord: '主', loyalist: '忠', rebel: '反', renegade: '内' };
function roleBadge(game, p) {
  if (game.mode !== 'identity') return '';
  const known = p === game.players[0] || p.roleRevealed;
  return known
    ? `<span class="role-badge r-${p.role}" title="${ROLE_NAME[p.role]}">${ROLE_SHORT[p.role]}</span>`
    : '<span class="role-badge r-unknown" title="身份未知">?</span>';
}

// 技能名（悬停显示技能描述）
function skillTagsHtml(ids, sep = ' · ') {
  return ids.map(id => `<span class="skill-tag" title="${skillName(id)}：${skillDesc(id)}">${skillName(id)}</span>`).join(sep);
}

function playerZoneHtml(game, p, isSelf, equipPick = null, canPick = () => false) {
  const isTurn = game.players[game.currentTurnSeat ?? 0] === p;
  // 正在等该角色做决定：头像下方显示思考进度条（官方倒计时条的样式，不做超时自动操作）
  const thinking = !game.over && game.asking?.player === p;
  const phase = PHASE_NAME[game.currentPhase];
  // 头像图缺失时自行移除，回落为纯文字武将牌（不留白块）；阵亡武将牌整体变灰
  return `
    <div class="hero-plate${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}">
      <div class="avatar" data-seat="${p.seat}">
        <img class="portrait" src="${p.hero.avatar}" alt="" onerror="this.remove()">
        ${isTurn && phase && !game.over ? `<span class="phase-badge">${phase}</span>` : ''}
        <span class="kingdom ${KINGDOM_CLASS[p.hero.kingdom] || ''}">${p.hero.kingdom}</span>
        ${roleBadge(game, p)}
        <span class="hero-name">${p.name}</span>
      </div>
      ${hpHtml(p)}
      <div class="think-bar"><i></i></div>
      <div class="skills">${skillTagsHtml(skillIdsOf(p))}</div>
    </div>
    <div class="zones">
      ${judgeHtml(p)}
      <div class="zone equips">${equipHtml(p, equipPick, canPick)}</div>
    </div>
    ${isSelf ? '' : handBackHtml(p.hand.length)}
  `;
}

// ---------- 身份局紧凑座位 ----------
// 头像 + 身份徽章 + 勾玉 + 手牌数 + 与你的距离 + 装备小条 + 判定区小标
function seatMiniHtml(game, p, cls) {
  const me = game.players[0];
  const isTurn = game.players[game.currentTurnSeat ?? 0] === p && !game.over;
  const thinking = !game.over && game.asking?.player === p;
  const phase = PHASE_NAME[game.currentPhase];
  const eq = EQUIP_SLOTS.map(slot => {
    const c = p.equip[slot];
    if (!c) return '';
    const rank = RANK_STR[c.rank] ?? c.rank;
    return `<div class="eq-line ${isRed(c) ? 'red' : 'black'}" data-card-id="${c.id}"><span class="eq-slot">${SLOT_LABEL[slot]}</span><span class="eq-name">${CARD_NAME[c.name] || c.name}</span><span class="eq-suit">${c.suit}${rank}</span></div>`;
  }).join('');
  const judge = p.judgeZone.map(c => { const n = judgeName(c); return `<span class="jz-tag" data-card-id="${c.id}">${n === 'le' ? '乐' : n === 'shandian' ? '电' : (CARD_NAME[n] || '?')[0]}</span>`; }).join('');
  const dist = p.alive ? distance(me, p, game) : null;
  return `
    <div class="seat mini ${cls.join(' ')}${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}" data-seat="${p.seat}">
      <div class="hero-plate${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}">
        <div class="avatar" data-seat="${p.seat}">
          <img class="portrait" src="${p.hero.avatar}" alt="" onerror="this.remove()">
          ${isTurn && phase ? `<span class="phase-badge">${phase}</span>` : ''}
          <span class="kingdom ${KINGDOM_CLASS[p.hero.kingdom] || ''}">${p.hero.kingdom}</span>
          ${roleBadge(game, p)}
          ${judge ? `<span class="jz-tags">${judge}</span>` : ''}
          <span class="hero-name">${p.name}</span>
          ${p.alive ? '' : '<span class="dead-mark">阵亡</span>'}
        </div>
        ${hpHtml(p)}
        <div class="think-bar"><i></i></div>
      </div>
      <div class="seat-side">
        <div class="seat-meta"><span class="hand-n"><i class="cardback"></i>${p.hand.length}</span>${dist ? `<span class="dist">距离 ${dist}</span>` : ''}</div>
        <div class="seat-skills">${skillTagsHtml(skillIdsOf(p), ' ')}</div>
        <div class="seat-equips" data-zone="equip">${eq || '<span class="eq-none">无装备</span>'}</div>
      </div>
    </div>`;
}

// 其他角色的显示顺序：左 → 右 = 上家 … 下家（与官方逆时针座次一致），阵亡者保留原位
export function othersForDisplay(game) {
  const n = game.players.length;
  const me = game.players[0];
  const list = [];
  for (let k = n - 1; k >= 1; k--) list.push(game.players[(me.seat + k) % n]);
  return list;
}

// 自己装备区的某张牌当前可否点选：
//   可弃置装备的主动技能（制衡/离间）、贯石斧（不含其本身）、流离，
//   以及允许装备作素材的转化技（武圣当杀、奇袭当拆、国色当乐、急救当桃）
export function equipSelectable(game, me, pend, card) {
  if (!pend || !card) return false;
  if (pend.mode === 'play' && pend.skillId) {
    const spec = getSkill(pend.skillId)?.active;
    return spec?.cards?.zone === 'any' && (pend.selected.length < spec.cards.max || pend.selected.some(c => c.id === card.id));
  }
  if (pend.mode === 'pick-hand' && pend.opts.opts.includeEquip) {
    return !(pend.opts.opts.exclude || []).includes(card.id);
  }
  if (pend.mode === 'play') return conversionNames(me, card, game).some(n => canUseInPlayPhase(game, me, card, n));
  if (pend.mode === 'respond') return canUseCardAs(me, card, pend.opts.req.type, game);
  if (pend.mode === 'peach') return canUseCardAs(me, card, 'tao', game);
  return false;
}

// 选中的牌是否为自己装备区的牌（武圣以装备当【杀】）
export function isEquipped(me, card) {
  return Object.values(me.equip).some(e => e && card && e.id === card.id);
}

// ---------- 出牌阶段可选牌判断 ----------
// 全部委托给引擎的统一判据，避免 UI/引擎规则不一致。
// 一张牌可被点选的情形：① 能以本名使用；② 能被武圣转化为【杀】。
// 丈八蛇矛的双牌【杀】需先点「丈八蛇矛」按钮（官方式装备技能），再选两张手牌。
function playableCheck(game, p, card) {
  return canUseInPlayPhase(game, p, card) || usableConversions(game, p, card).length > 0;
}

// 该牌在出牌阶段可经转化技使用的牌名（龙胆当杀、奇袭当拆、国色当乐……）
export function usableConversions(game, p, card) {
  return conversionNames(p, card, game).filter(n => canUseInPlayPhase(game, p, card, n));
}

// 距离 / 攻击范围 / 杀次数 提示
function rangeInfoHtml(game) {
  const me = game.players[0];
  const r = attackRange(me);
  const limit = shaLimitOf(me);
  const shaInfo = limit === Infinity
    ? '【杀】不限次数'
    : `本回合还可出 ${shaLeftOf(me)} 张【杀】`;
  if (game.players.length > 2) return `攻击范围 ${r} · ${shaInfo}`;
  const opp = game.players[1];
  const d = distance(me, opp, game);
  const out = d <= r ? '' : '（对方在攻击范围外）';
  return `距离 ${d} · 攻击范围 ${r}${out} · ${shaInfo}`;
}


function respondCandidates(game, p, req) {
  if (!req) return [];
  // 能单独当所需牌打出的（牌名相符或经转化技）
  const direct = p.hand.filter(c => canUseCardAs(p, c, req.type, game));
  // 多张当一张（丈八蛇矛）：任意手牌均可作为合成材料
  if (pairViewAs(p, req.type)) return p.hand;
  return direct;
}

// 已选的单张牌以什么牌名使用：手动选了转化（pend.asName）；或该牌本身不能使用、
// 只有一种可用的转化（如龙胆的【闪】当【杀】、装备区的牌）时自动转化。返回转化名或 null（按本名）。
export function usingAs(game, pend) {
  const me = game.players[0];
  const sel = pend?.selected?.[0];
  if (!sel || pend.skillId || pend.selected.length !== 1) return null;
  if (pend.asName) return pend.asName;
  const self = !isEquipped(me, sel) && canUseInPlayPhase(game, me, sel);
  const conv = usableConversions(game, me, sel);
  return !self && conv.length ? conv[0] : null;
}
export const usingAsSha = (game, pend) => usingAs(game, pend) === 'sha';

// 当前选择的「指定目标」需求（官方流程：选牌 → 点武将选目标 → 确定）。
// 返回 null 表示无需目标；否则 { name 牌名/技能, stage 'target'|'victim', candidates 当前可选角色, ready 目标已齐 }。
// 借刀杀人分两步：先选持武器者（target），再选其【杀】的目标（victim）。
export function targetSpec(game, pend) {
  if (!pend || pend.mode !== 'play') return null;
  const me = game.players[0];
  const sel = pend.selected;
  const targets = pend.targets || [];
  const one = (name, candidates) => ({ name, stage: 'target', candidates, ready: targets.length === 1 });
  const pv = pend.skillId && pairOf(me, pend.skillId);
  if (pv) return sel.length === pv.count ? one('sha', zhangbaTargets(game, me)) : null;
  if (pend.skillId) {
    // 主动技能：牌选够后才进入选目标；多目标（离间）按选择顺序递进
    const sk = getSkill(pend.skillId)?.active;
    const cmin = sk?.cards?.min ?? 0;
    if (!sk || !sk.targets?.max || sel.length < cmin) return null;
    return {
      name: pend.skillId, stage: 'target', max: sk.targets.max,
      // 单目标：候选始终为全部合法目标（可改选）；多目标（离间）：按已选递进
      candidates: skillTargetCandidates(game, me, pend.skillId, sk.targets.max > 1 ? targets : []),
      ready: targets.length >= sk.targets.min && sel.length <= (sk.cards?.max ?? 0),
    };
  }
  if (sel.length !== 1) return null;
  const name = usingAs(game, pend) || sel[0].name;
  if (!needsTarget(name)) return null;
  // 有第二个目标的牌（借刀杀人）：先选第一个目标，再选第二个目标
  if (needsVictim(name) && targets[0]) {
    const holder = targets[0];
    return {
      name, stage: 'victim', holder, ready: !!pend.victim,
      candidates: game.alivePlayers().filter(v => canSecondTarget(game, name, me, holder, v)),
    };
  }
  return { ...one(name, legalTargets(game, me, sel[0], name)), ready: targets.length === 1 && !needsVictim(name) };
}

// 兼容旧调用：当前是否有可指定的其他角色
export function isOppTargetable(game, pend) {
  const spec = targetSpec(game, pend);
  return !!spec && spec.candidates.some(p => p !== game.players[0]);
}

// 多张手牌当一张牌的转化（丈八蛇矛）：出牌阶段以其来源 id 作为「技能」按钮
export function pairOf(me, id) {
  const pv = pairViewAs(me, 'sha');
  return pv && pv.skill === id ? pv : null;
}

// 主动技能（或多张当一张的转化）在出牌阶段可选的牌数上限
export function skillCardMax(me, id) {
  const a = getSkill(id)?.active;
  if (a) return a.cards?.max ?? 0;
  return pairOf(me, id)?.count ?? 0;
}

// 当前选择无需目标即可直接生效时，返回对应的横幅动作；否则返回 null
export function directUseAction(game, pend) {
  if (!pend) return null;
  const me = game.players[0];
  const n = pend.selected.length;
  switch (pend.mode) {
    case 'play': {
      const spec = targetSpec(game, pend);
      if (spec) return spec.ready ? 'confirm-target' : null;
      // 无目标的主动技能（制衡/苦肉）：牌数满足即可确定
      const sk = pend.skillId && getSkill(pend.skillId)?.active;
      if (sk) {
        const c = sk.cards || { min: 0, max: 0 };
        return !sk.targets?.max && n >= c.min && n <= c.max ? 'confirm-skill' : null;
      }
      if (pend.skillId || n !== 1 || usingAs(game, pend)) return null;
      const sel = pend.selected[0];
      return canUseInPlayPhase(game, me, sel) && !needsTarget(sel.name) ? 'confirm-play' : null;
    }
    case 'respond': {
      const req = pend.opts.req;
      const pv = pairViewAs(me, req.type);
      const composite = !!pv && n === pv.count;
      const single = n === 1 && canUseCardAs(me, pend.selected[0], req.type, game);
      return single || composite ? 'confirm-respond' : null;
    }
    case 'pick-player': return (pend.targets?.length || 0) >= (pend.opts.opts.min ?? 1) ? 'confirm-players' : null;
    case 'pick-hand': return n === pend.opts.opts.count ? 'confirm-pick' : null;
    case 'peach': return n === 1 ? 'confirm-peach' : null;
    case 'nullify': return n === 1 ? 'confirm-nullify' : null;
  }
  return null;
}

// ---------- 主渲染 ----------
// 选择角色（突袭/遗计/流离）：与选目标共用座位高亮
export function pickPlayerSpec(pend) {
  if (pend?.mode !== 'pick-player') return null;
  const { candidates = [], max = 1 } = pend.opts.opts;
  const picked = pend.targets || [];
  return {
    name: pend.opts.opts.reason, stage: 'target', max,
    candidates: picked.length >= max && max > 1 ? [] : candidates.filter(c => !picked.includes(c)),
    ready: picked.length >= (pend.opts.opts.min ?? 1),
  };
}

export function renderGame(game, ui, logs) {
  const me = game.players[0];
  const pend = ui.pending;
  const spec = targetSpec(game, pend) || pickPlayerSpec(pend);
  // 每名角色在选目标流程中的状态：可选 / 已选 / 不可选
  const picked = new Set([...(pend?.targets || []), pend?.victim].filter(Boolean).map(p => p.seat));
  const seatCls = p => {
    if (!spec) return [];
    const c = [];
    if (spec.candidates.some(x => x.seat === p.seat)) c.push('targetable');
    else if (!picked.has(p.seat)) c.push('untargetable');
    if (picked.has(p.seat)) c.push('picked');
    return c;
  };

  const oppRow = document.getElementById('opp-row');
  const multi = game.players.length > 2;
  oppRow.classList.toggle('multi', multi);
  if (multi) {
    oppRow.innerHTML = othersForDisplay(game).map(p => seatMiniHtml(game, p, seatCls(p))).join('');
    for (const k of ['targetable', 'untargetable', 'picked']) oppRow.classList.remove(k);
  } else {
    const opp = game.players[1];
    oppRow.innerHTML = playerZoneHtml(game, opp, false);
    oppRow.dataset.seat = opp.seat;
    for (const k of ['targetable', 'untargetable', 'picked']) oppRow.classList.toggle(k, seatCls(opp).includes(k));
  }
  // 制衡可弃置装备区的牌，故此时自己的装备需要可点选
  const equipPick = pend ? new Set(pend.selected.map(c => c.id)) : null;
  const selfRow = document.getElementById('self-row');
  selfRow.innerHTML = playerZoneHtml(game, me, true, equipPick,
    c => equipSelectable(game, me, pend, c));
  // 借刀杀人的【杀】目标可以是自己
  selfRow.dataset.seat = me.seat;
  for (const k of ['targetable', 'picked']) selfRow.classList.toggle(k, seatCls(me).includes(k));

  // 手牌
  const handEl = document.getElementById('hand-row');
  let handSelectable = new Set(), selectedIds = new Set(), virtualShaIds = new Set();
  if (pend) {
    selectedIds = new Set(pend.selected.map(c => c.id));
    if (pend.mode === 'play') {
      if (pend.skillId) {
        // 主动技能按技能定义的张数上限；多张当一张按其张数；已选满时其余牌不可再选
        const max = skillCardMax(me, pend.skillId);
        const full = pend.selected.length >= max;
        handSelectable = new Set(me.hand.filter(c => !full || selectedIds.has(c.id)).map(c => c.id));
      } else {
        handSelectable = new Set(me.hand.filter(c => playableCheck(game, me, c)).map(c => c.id));
      }
    } else if (pend.mode === 'respond') {
      handSelectable = new Set(respondCandidates(game, me, pend.opts.req).map(c => c.id));
      // 转化标记：仅标注「牌名不符但可转化」的牌（龙胆/倾国/武圣）
      for (const c of me.hand) {
        if (c.name !== pend.opts.req.type && canUseCardAs(me, c, pend.opts.req.type, game)) {
          virtualShaIds.add(c.id);
        }
      }
    } else if (pend.mode === 'peach') {
      // 【桃】或急救（回合外红色牌当【桃】）
      handSelectable = new Set(me.hand.filter(c => canUseCardAs(me, c, 'tao', game)).map(c => c.id));
      for (const c of me.hand) if (c.name !== 'tao' && handSelectable.has(c.id)) virtualShaIds.add(c.id);
    } else if (pend.mode === 'nullify') {
      handSelectable = new Set(me.hand.filter(c => canUseCardAs(me, c, 'wuxie', game)).map(c => c.id));
    } else if (pend.mode === 'pick-hand') {
      const ex = pend.opts.opts.exclude || [];
      handSelectable = new Set(me.hand.filter(c => !ex.includes(c.id)).map(c => c.id));
    }
  }
  // 不需要选牌的主动技能（苦肉/反间/激将）：手牌不可点
  if (pend?.mode === 'play' && pend.skillId && skillCardMax(me, pend.skillId) === 0) {
    handSelectable = new Set();
  }
  handEl.innerHTML = me.hand.map(c =>
    cardHtml(c, {
      selectable: handSelectable.has(c.id), selected: selectedIds.has(c.id), virtualSha: virtualShaIds.has(c.id),
      disabled: !!pend && !handSelectable.has(c.id) && !selectedIds.has(c.id),
    })
  ).join('') || '<div class="hand-empty">（无手牌）</div>';

  // 中央：牌堆计数（紧凑，不再放溢出的卡牌）+ 处理区
  document.getElementById('deck-info').innerHTML = `
    <div class="pile"><span class="pile-n">${game.deck.remaining}</span><span class="pile-t">牌堆</span></div>
    <div class="pile"><span class="pile-n">${game.deck.discardPile.length}</span><span class="pile-t">弃牌</span></div>`;
  document.getElementById('field').innerHTML = fieldHtml(game);

  const logEl = document.getElementById('log');
  logEl.innerHTML = logs.slice(-80).map(l => l.html).join('');
  logEl.scrollTop = logEl.scrollHeight;

  // 横幅
  document.getElementById('banner').innerHTML = bannerHtml(game, ui);
  renderPicker(game, ui);
}

// ---------- 中央处理区 ----------
const PHASE_NAME = {
  prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束',
};
const PHASES = Object.keys(PHASE_NAME);

// 阶段进度条：已过的阶段变暗、当前阶段高亮、被【乐不思蜀】跳过的出牌阶段划掉
function phaseStripHtml(game) {
  const turnP = game.players[game.currentTurnSeat ?? 0];
  const cur = PHASES.indexOf(game.currentPhase);
  return `<div class="phase-strip">${PHASES.map((ph, i) => {
    const cls = ['ph'];
    if (i < cur) cls.push('done');
    if (i === cur) cls.push('on');
    if (ph === 'play' && turnP.flags.skipPlay) cls.push('skipped');
    return `<span class="${cls.join(' ')}">${PHASE_NAME[ph]}</span>`;
  }).join('<i class="ph-sep"></i>')}</div>`;
}

function fieldHtml(game) {
  const turnP = game.players[game.currentTurnSeat ?? 0];
  const act = game.lastAction;
  // 优先展示「结算中」的牌（官方处理区语义），否则展示最近一次出牌，再否则展示弃牌堆顶
  let cards, label;
  if (act?.judge) {
    // 判定牌（官方：翻开后置于处理区）。闪电命中时挂起的【闪电】等结算中牌一并展示
    const j = act.judge;
    const others = game.pendingDiscard.filter(c => c.id !== act.card.id);
    cards = [act.card, ...others].slice(0, 4);
    const state = j.result
      ? `<span class="judge-tag ${j.result === '生效' ? 'on' : 'off'}">${j.result}</span>`
      : '<span class="judge-tag">判定中</span>';
    label = `${act.player.name} 判定【${j.reason}】${state}`
      + (j.replacedBy ? `<span class="judge-note">${j.replacedBy} 鬼才改判</span>` : '');
  } else if (game.pendingDiscard.length) {
    cards = game.pendingDiscard.slice(-4);
    label = '结算中';
  } else if (act) {
    // 所用牌 + 该效果从目标处拆掉/拿走的牌（官方处理区语义）
    cards = [...realsOf(act.card), ...(act.spent || [])].slice(0, 4);
    const targetNames = (act.targets || []).map(t => t.name).join('、');
    label = `${act.player.name}${targetNames ? ` → ${targetNames}` : ''}`;
  } else {
    cards = game.deck.discardPile.slice(-4);
    label = cards.length ? '弃牌堆' : '';
  }
  return `
    <div class="field-head">
      <span class="turn-tag">${turnP === game.players[0] ? '你的回合' : `${turnP.name} 的回合`}</span>
      ${game.currentPhase ? phaseStripHtml(game) : ''}
    </div>
    <div class="field-body">
      ${label ? `<span class="field-act">${label}</span>` : ''}
      <div class="mini-cards field-cards">${cards.map(c => cardHtml(c)).join('')}</div>
    </div>`;
}

// ---------- 横幅 ----------
// 提示文案写在各技能/卡牌定义的 prompt 字段里（按询问的 reason 查找），这里只提供通用框架与兜底文案。
// 名称：对自己显示「你」，对他人显示武将名（官方提示栏口吻）
const who = (p, me) => (!p ? '' : p === me ? '你' : p.name);
const cn = name => `【${CARD_NAME[name] || name}】`;
// 无双等需连续打出多张时的进度，如「（无双：共需 2 张，这是第 1 张）」
const nthOf = info => (info?.need > 1 ? `（无双：共需 ${info.need} 张，这是第 ${info.nth} 张）` : '');

function useLabelOf(card) {
  const reals = realsOf(card);
  return reals.length > 1 ? reals.map(cardLabel).join(' + ') : cardLabel(reals[0] || card);
}

// 提示函数的辅助对象（定义里的 prompt 函数第二个参数 h）
function helpers(me) {
  return {
    who: p => who(p, me),
    cn,
    nth: nthOf,
    label: c => (c ? cardLabel(c) : ''),
    cards: c => (Array.isArray(c) ? c.map(cardLabel).join('、') : useLabelOf(c)),
    names: ps => ps.map(p => who(p, me)).join('、'),
  };
}
const promptOf = id => defOf(id)?.prompt || {};

// 响应提示：说清楚「谁对你用了什么 → 你要打出什么 → 不打会怎样」
function respondPrompt(me, req) {
  const fn = promptOf(req.reason).respond;
  return fn ? fn(req, helpers(me)) : `请打出一张${cn(req.type)}`;
}

// 无懈可击：写明哪张锦囊将对谁生效
function nullifyPrompt(me, e) {
  if (e.isNullify) {
    return `${who(e.source, me)} 使用了【无懈可击】，【${e.name}】即将失效，是否使用【无懈可击】抵消之？`;
  }
  const tgt = who(e.target, me);
  // 延时锦囊没有使用者（判定阶段结算）
  if (!e.source) return `${tgt}判定区的【${e.name}】即将判定，是否使用【无懈可击】？`;
  return `${who(e.source, me)} 使用的【${e.name}】即将对 ${tgt} 生效，是否使用【无懈可击】？`;
}

// 发动技能/装备效果的询问
function invokePrompt(me, id, info = {}) {
  const fn = promptOf(id).invoke;
  return fn ? fn(info, helpers(me)) : [`是否发动【${skillName(id)}】？`, skillDesc(id)];
}

// 非自己操作时的提示：写明正在等谁、做什么（官方「对方思考中」）
const reasonName = a => (defOf(a[0]?.reason) ? `【${skillName(a[0].reason)}】` : '');
const ASK_VERB = {
  askPlayCard: () => '出牌',
  askRespondCard: a => `打出${cn(a[0]?.type || 'sha')}`,
  askPeach: () => '是否使用【桃】',
  askNullify: () => '是否使用【无懈可击】',
  askSkillInvoke: a => `是否发动【${skillName(a[0])}】`,
  askChoosePlayers: a => `${reasonName(a)}选择角色`,
  askChooseOption: a => `${reasonName(a)}选择一项`,
  askChooseCards: a => (a[0]?.reason === 'discard-phase' ? `弃置 ${a[0].count} 张手牌` : `${reasonName(a)}选择卡牌`),
  askArrange: a => `${reasonName(a)}排列牌`,
};

export function waitingText(game) {
  const me = game.players[0];
  const a = game.asking;
  // 身份局中你已阵亡、其余角色继续对局
  const dead = me.dead && !game.over ? `你已阵亡（${ROLE_NAME[me.role] || ''}），观战中 · ` : '';
  return dead + waitingCore(game, me, a);
}

function waitingCore(game, me, a) {
  if (a && a.player !== me) {
    const verb = ASK_VERB[a.method]?.(a.args) || '行动';
    return `${a.player.name} 思考中：${verb}…`;
  }
  const turnP = game.players[game.currentTurnSeat ?? 0];
  const phase = PHASE_NAME[game.currentPhase];
  return `${who(turnP, me)}的回合${phase ? ` · ${phase}阶段` : ''}，结算中…`;
}

export function bannerHtml(game, ui) {
  const me = game.players[0];
  const pend = ui.pending;
  if (!pend) {
    return `<span class="hint waiting">${waitingText(game)}</span>`;
  }
  const btn = (action, label, { primary = false, disabled = false } = {}) =>
    `<button data-action="${action}" ${primary ? 'class="primary"' : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
  const h = helpers(me);

  let prompt = '', hint = '', buttons = '';

  switch (pend.mode) {
    case 'play': {
      const spec = targetSpec(game, pend);
      const sel = pend.selected[0];
      const sk = pend.skillId && getSkill(pend.skillId)?.active;
      const pv = pend.skillId && pairOf(me, pend.skillId);
      hint = rangeInfoHtml(game);
      // 已选单张牌时可切换的转化（当【杀】/【过河拆桥】/【乐不思蜀】使用、或按原牌使用）
      const convBtns = () => {
        if (pend.skillId || !sel || pend.selected.length !== 1) return '';
        const cur = usingAs(game, pend);
        const btns = usableConversions(game, me, sel).filter(n => n !== cur)
          .map(n => btn(`use-as:${n}`, `当${cn(n)}使用`)).join('');
        const selfOk = !isEquipped(me, sel) && canUseInPlayPhase(game, me, sel);
        return btns + (cur && selfOk ? btn('use-as:', `按${cn(sel.name)}使用`) : '');
      };
      if (spec) {
        [prompt, hint] = targetPrompt(game, pend, spec);
        buttons = btn('confirm-target', '确定', { primary: true, disabled: !spec.ready })
          + convBtns() + btn('cancel-skill', pend.skillId ? '返回' : '取消');
      } else if (pv) {
        prompt = `【${skillName(pend.skillId)}】请选择 ${pv.count} 张手牌当【杀】使用（已选 ${pend.selected.length}/${pv.count}）`;
        buttons = btn('cancel-skill', '返回');
      } else if (sk) {
        const n = pend.selected.length;
        [prompt, hint] = skillCardPrompt(me, pend.skillId, n);
        buttons = (sk.targets?.max ? '' : btn('confirm-skill', `确定${n ? `（${n}）` : ''}`, { primary: true, disabled: directUseAction(game, pend) !== 'confirm-skill' }))
          + btn('cancel-skill', '返回');
      } else if (sel) {
        prompt = directUsePrompt(game, me, sel);
        hint = '点击「确定」或拖动卡牌至牌桌';
        buttons = btn('confirm-play', '确定', { primary: true }) + convBtns() + btn('cancel-skill', '取消');
      } else {
        const anyPlayable = me.hand.some(c => playableCheck(game, me, c))
          || Object.values(me.equip).some(c => c && equipSelectable(game, me, pend, c));
        const skills = activeSkillsOf(me);
        const pair = canUseZhangbaSha(game, me) && pairViewAs(me, 'sha');
        const skillOk = skills.some(id => canUseSkill(game, me, id)) || !!pair;
        prompt = anyPlayable || skillOk
          ? '出牌阶段，请选择一张卡牌'
          : '出牌阶段，没有可以使用的牌，请点击「结束出牌」';
        hint = `${hint} · 可点击或拖动手牌出牌`;
        buttons =
          // 主动技能按钮：不可发动时置灰（出牌阶段限一次已用过等）；主公技只在可用时出现
          skills.filter(id => !getSkill(id).lord || canUseSkill(game, me, id))
            .map(id => btn(`skill-${id}`, skillName(id), { disabled: !canUseSkill(game, me, id) })).join('') +
          // 多张当一张（丈八蛇矛）：装备技能按钮（官方式），可用时才出现
          (pair ? btn(`skill-${pair.skill}`, skillName(pair.skill)) : '') +
          btn('end-play', '结束出牌', { primary: !skills.length || !(anyPlayable || skillOk) });
      }
      break;
    }
    case 'respond': {
      const req = pend.opts.req;
      // 提示语由「需要打出什么」(req.type) 与「为什么」(reason + info) 共同决定
      prompt = respondPrompt(me, req);
      const n = pend.selected.length;
      // 「确定」只在选择确实合法时可用：单张需牌名相符或有转化途径（武圣），
      // 多张则须是可用的多张当一张（丈八蛇矛）。否则玩家会以为响应成功却实际白挨伤害。
      const pv = pairViewAs(me, req.type);
      const composite = !!pv && n === pv.count;
      const single = n === 1 && canUseCardAs(me, pend.selected[0], req.type, game);
      const cvName = single && conversionOf(me, pend.selected[0], req.type, game)?.skill;
      if (composite) hint = `【${skillName(pv.skill)}】以 ${pv.count} 张手牌当${cn(req.type)}打出`;
      else if (cvName) hint = `【${skillName(cvName)}】将 ${cardLabel(pend.selected[0])} 当${cn(req.type)}打出`;
      else if (n === 1 && !single) hint = pv
        ? `该牌不能单独当此牌使用，请再选一张组成${cn(req.type)}`
        : '该牌不能当此牌使用';
      else if (n === 0) hint = `选择一张${cn(req.type)}后点击「确定」`;
      buttons = btn('confirm-respond', '确定', { primary: true, disabled: !(single || composite) })
        + btn('cancel', promptOf(req.reason).cancel || '不出');
      break;
    }
    case 'peach': {
      const d = pend.opts.info.dying;
      const need = Math.max(1, 1 - d.hp);
      prompt = d === me
        ? `你处于濒死状态，还需 ${need} 个【桃】，是否使用【桃】？`
        : `${d.name} 处于濒死状态，还需 ${need} 个【桃】，是否对其使用【桃】？`;
      const pc = pend.selected[0];
      const via = pc && conversionOf(me, pc, 'tao', game)?.skill;
      hint = via ? `【${skillName(via)}】将 ${cardLabel(pc)} 当【桃】使用` : d === me ? '不使用【桃】将阵亡' : '';
      buttons = btn('confirm-peach', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '不使用');
      break;
    }
    case 'nullify': {
      prompt = nullifyPrompt(me, pend.opts.effect);
      buttons = btn('confirm-nullify', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '不使用');
      break;
    }
    case 'invoke': {
      [prompt, hint] = invokePrompt(me, pend.opts.skillId, pend.opts.info);
      buttons = btn('yes', '发动', { primary: true }) + btn('no', '不发动');
      break;
    }
    case 'pick-hand': {
      const o = pend.opts.opts;
      const n = pend.selected.length;
      let cancel = '取消';
      if (o.reason === 'discard-phase') {
        prompt = `弃牌阶段，请弃置 ${o.count} 张手牌（已选 ${n}/${o.count}）`;
        hint = `手牌上限为 ${handLimitOf(me, game)}`;
      } else {
        const fn = promptOf(o.reason).chooseCards;
        [prompt, hint = '', cancel = '取消'] = fn ? fn(o, h, n)
          : [`请选择 ${o.count} 张${o.includeEquip ? '牌' : '手牌'}（已选 ${n}/${o.count}）`];
      }
      buttons = btn('confirm-pick', '确定', { primary: true, disabled: n !== o.count }) +
        (o.optional ? btn('cancel', cancel) : '');
      break;
    }
    case 'pick-zone': {
      const { from, reason, info } = pend.opts.opts;
      const t = info?.target;
      const title = skillName(reason);
      prompt = from === 'horse'
        ? `【${title}】请选择 ${t.name} 的一张坐骑牌弃置`
        : `【${title}】请选择 ${t ? t.name : '对方'} 的一张牌${promptOf(reason).zone || '获得'}`;
      hint = '在弹出的面板中点击一张牌';
      break;
    }
    case 'pick-wugu': {
      prompt = '【五谷丰登】请选择一张牌获得';
      hint = '在弹出的面板中点击一张牌';
      break;
    }
    case 'arrange': {
      const fn = promptOf(pend.opts.reason).arrange;
      [prompt, hint = ''] = fn ? fn(pend.opts, h) : [`【${skillName(pend.opts.reason)}】请排列这些牌`];
      break;
    }
    case 'pick-player': {
      let cancel;
      [prompt, hint, cancel] = pickPlayerPrompt(game, pend);
      const { optional, min = 1 } = pend.opts.opts;
      buttons = btn('confirm-players', '确定', { primary: true, disabled: (pend.targets?.length || 0) < min })
        + (optional ? btn('cancel', cancel || '不发动') : '');
      break;
    }
    case 'pick-option': {
      const fn = promptOf(pend.opts.opts.reason).chooseOption;
      [prompt, hint = ''] = fn ? fn(pend.opts.opts, h) : [`【${skillName(pend.opts.opts.reason)}】请选择一项`];
      break;
    }
  }
  return `<span class="prompt">${prompt}</span>${hint ? `<span class="hint">${hint}</span>` : ''}<span style="flex:1"></span>${buttons}`;
}

// 选择角色的提示（突袭/遗计/流离）：[提示, 说明, 放弃按钮文字]
function pickPlayerPrompt(game, pend) {
  const me = game.players[0];
  const o = pend.opts.opts;
  const t = pend.targets || [];
  const fn = promptOf(o.reason).choosePlayers;
  if (fn) return fn(o, helpers(me), t);
  return [`请选择角色${t.length ? `：${t.map(p => who(p, me)).join('、')}` : ''}`, ''];
}

// 主动技能选牌阶段的提示：[提示, 说明]
function skillCardPrompt(me, id, n) {
  const sk = getSkill(id).active;
  const c = sk.cards || { min: 0, max: 0 };
  const p = promptOf(id);
  const need = c.max === Infinity ? '任意张' : c.min === c.max ? `${c.min} 张` : `至多 ${c.max} 张`;
  const where = c.zone === 'any' ? '牌（手牌或装备）' : '手牌';
  const text = p.active ? p.active(n, helpers(me))
    : `【${skillName(id)}】请选择 ${need}${where}${c.max !== Infinity ? `（已选 ${n}/${c.max}）` : ''}`;
  return [text, p.hint ? p.hint(me) : skillDesc(id)];
}

// 选目标阶段的提示语：未选 → 请选择目标；已选 → 写明「牌 → 目标」，点确定出牌
function targetPrompt(game, pend, spec) {
  const me = game.players[0];
  const h = helpers(me);
  const t = pend.targets || [];
  const how = '点击武将选择目标（再次点击已选目标或点「确定」出牌），也可拖动卡牌至目标';
  if (pend.mode === 'pick-player') return pickPlayerPrompt(game, pend);
  const pv = pend.skillId && pairOf(me, pend.skillId);
  // 主动技能：文案由技能定义提供
  if (pend.skillId && !pv) {
    const p = promptOf(pend.skillId);
    const text = p.target ? p.target(t, h, pend.selected.length)
      : t.length ? `【${skillName(pend.skillId)}】→ ${h.names(t)}，点击「确定」` : `【${skillName(pend.skillId)}】请选择目标`;
    return [text, p.hint ? p.hint(me) : skillDesc(pend.skillId)];
  }
  const sel = pend.selected[0];
  const conv = usingAs(game, pend);
  const cv = conv && conversionOf(me, sel, conv, game)?.skill;
  const via = pv ? `【${skillName(pend.skillId)}】${pv.count} 张手牌当`
    : conv ? `${cv ? `【${skillName(cv)}】` : ''}将${isEquipped(me, sel) ? '装备区的' : ''}${cn(sel.name)}当` : '';
  const cardName = `${via}${cn(spec.name)}`;
  const p = promptOf(spec.name);
  if (spec.stage === 'victim') {
    return [pend.victim
      ? (p.secondReady ? p.secondReady(spec.holder, pend.victim, h) : `${cardName}：${h.who(spec.holder)} → ${h.who(pend.victim)}，点击「确定」`)
      : (p.secondTarget ? p.secondTarget(spec.holder, h) : `请选择${cardName}的第二个目标`), p.secondHint || ''];
  }
  if (!spec.candidates.length && !t.length) return [`${cardName}当前没有合法目标`, rangeInfoHtml(game)];
  if (!t.length) return [p.firstTarget || `请选择${cardName}的目标`, `${how} · ${rangeInfoHtml(game)}`];
  const alt = spec.candidates.length > 1 ? '可点击其他武将改选' : '再次点击目标或拖动卡牌至目标也可出牌';
  return [`${cardName} → ${h.names(t)}，点击「确定」使用`, `${alt} · ${rangeInfoHtml(game)}`];
}

// 无需目标、点确定即生效的牌的提示
function directUsePrompt(game, me, card) {
  const fn = promptOf(card.name).use;
  return fn ? fn(game, me, card) : `是否使用${cn(card.name)}？`;
}

// ---------- 选牌面板（官方样式：选择目标区域的牌、五谷丰登、选择一项、排列牌） ----------
function pickerHtml(game, ui) {
  const pend = ui.pending;
  const me = game.players[0];
  const panel = (title, sub, body, foot = '', subClass = '') => `
    <div class="picker-panel">
      <div class="picker-title">${title}</div>
      ${sub ? `<div class="picker-sub ${subClass}">${sub}</div>` : ''}
      ${body}
      ${foot ? `<div class="picker-foot">${foot}</div>` : ''}
    </div>`;
  const btn = (action, label, primary = false) =>
    `<button data-action="${action}"${primary ? ' class="primary"' : ''}>${label}</button>`;

  // 五谷丰登：整个结算过程中都展示亮出的牌，已选走的标注获得者
  if (game.wugu) {
    const mine = pend?.mode === 'pick-wugu';
    const cards = game.wugu.cards.map(c => {
      const who = game.wugu.taken[c.id];
      return `<div class="pick-item${who ? ' taken' : ''}"${mine && !who ? ` data-action="wugu:${c.id}"` : ''}>
        ${cardHtml(c, { selectable: mine && !who })}
        ${who ? `<span class="taker">${who}</span>` : ''}
      </div>`;
    }).join('');
    const turnName = mine ? '请选择一张牌' : '等待其他角色选择…';
    return panel('五谷丰登', turnName, `<div class="pick-row" data-zone="pick">${cards}</div>`);
  }
  if (!pend) return '';

  if (pend.mode === 'pick-zone') {
    const { from, reason, info, optional, noJudge } = pend.opts.opts;
    const t = info.target;
    const title = skillName(reason);
    const item = (zone, inner) => `<div class="pick-item" data-action="zone:${zone}">${inner}</div>`;
    const sections = [];
    if (from !== 'horse' && t.hand.length) {
      // 手牌背面朝上，点任意一张即随机获得/弃置其一
      const backs = t.hand.map(() => item('hand', '<i class="cardback big"></i>')).join('');
      sections.push(['手牌区', backs]);
    }
    const slots = from === 'horse' ? ['horse+', 'horse-'] : EQUIP_SLOTS;
    const equips = slots.filter(s => t.equip[s]).map(s => item(s, cardHtml(t.equip[s], { selectable: true }))).join('');
    if (equips) sections.push(['装备区', equips]);
    // 反馈/寒冰剑针对「角色的牌」，不含判定区
    if (from !== 'horse' && !noJudge && t.judgeZone.length) {
      sections.push(['判定区', t.judgeZone.map(c => item(judgeName(c), cardHtml(asJudge(c), { selectable: true }))).join('')]);
    }
    // 无懈链期间对方可能把牌打光：无牌可选时允许跳过，避免死局
    const body = sections.length
      ? sections.map(([label, html]) => `<div class="pick-sec"><div class="pick-label">${label}</div><div class="pick-row" data-zone="pick">${html}</div></div>`).join('')
      : '<div class="picker-sub">对方已无牌可选</div>';
    const foot = !sections.length ? btn('cancel', '跳过') : optional ? btn('cancel', '取消') : '';
    // 面板内同步展示本次使用的锦囊牌面（面板遮罩会盖住中央处理区）
    const usedCard = info.card;
    const sub = `${usedCard ? `<span class="pick-used">${cardHtml(usedCard, { small: true })}</span>` : ''}<span>选择 ${t.name} 的一张牌</span>`;
    return panel(title, sub, body, foot, usedCard ? 'pick-with-card' : '');
  }

  // 选择一项：选项为花色时按花色着色（反间）
  if (pend.mode === 'pick-option') {
    const o = pend.opts.opts;
    const SUIT = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };
    const body = `<div class="pick-row suit-row">${o.options.map(({ id, label }) =>
      `<button class="suit-btn ${SUIT[id] || ''}" data-action="option:${id}">${SUIT[id] ? `<span>${id}</span>` : ''}${label}</button>`).join('')}</div>`;
    const fn = promptOf(o.reason).chooseOption;
    return panel(skillName(o.reason), fn ? fn(o, helpers(me))[0] : '请选择一项', body);
  }

  if (pend.mode === 'arrange') {
    const { top, bottom } = pend.gx;
    const rows = promptOf(pend.opts.reason).rows || { top: '牌堆顶', bottom: '牌堆底' };
    const row = (key, label, cards) => `
      <div class="pick-sec">
        <div class="pick-label">${label}<span class="pick-n">${cards.length}</span></div>
        <div class="pick-row gx-row" data-zone="pick" data-gx-row="${key}">
          ${cards.map((c, i) => `<div class="pick-item gx-item" data-card-id="${c.id}">
            ${cardHtml(c, { selectable: true })}
            ${key === 'top' ? `<span class="order">${i + 1}</span>` : ''}
          </div>`).join('') || '<span class="gx-empty">拖到此处</span>'}
        </div>
      </div>`;
    return panel(skillName(pend.opts.reason),
      `${me.name} 观看牌堆顶 ${pend.opts.cards.length} 张牌：牌堆顶从左到右依次被摸到`,
      row('top', rows.top, top) + row('bottom', rows.bottom, bottom),
      btn('confirm-arrange', '确定', true));
  }
  return '';
}

export function renderPicker(game, ui) {
  const el = document.getElementById('picker');
  const html = pickerHtml(game, ui);
  el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}

// ---------- 选将界面 ----------
// st = { mode: '1v1' | 'identity', selectedId, pack: 扩展包 id | 'all', search, identity: { role, choices: [heroId], lordHeroId } }
const ROLE_DESC = {
  lord: '主公：消灭所有反贼和内奸即获胜。你的身份对所有人明置，体力上限 +1',
  loyalist: '忠臣：保护主公，消灭所有反贼和内奸即获胜',
  rebel: '反贼：击杀主公即获胜（同伴是谁需要你自己判断）',
  renegade: '内奸：先帮主公消灭反贼与忠臣，最后与主公单挑并获胜',
};

function heroCardHtml(h, selectedId, lord = false) {
  const skills = skillTagsHtml([...h.skills, ...(lord ? h.lordSkills || [] : [])], '、');
  return `
    <div class="hero-card ${h.id === selectedId ? 'selected' : ''}" data-hero="${h.id}">
      <div class="face"><img src="${h.avatar}" alt="" onerror="this.remove()"></div>
      <div class="name">${h.name}</div>
      <div class="kingdom-line">${h.kingdom} · ${h.hp + (lord ? 1 : 0)} 体力</div>
      <div class="skills">${skills}</div>
    </div>`;
}

// 选中武将的技能说明
function heroDetailHtml(id) {
  const h = id && HEROES[id];
  if (!h) return '<div class="hero-detail empty">点击武将查看技能说明</div>';
  const rows = [...h.skills, ...(h.lordSkills || [])].map(s =>
    `<div><b>【${skillName(s)}】</b>${skillDesc(s)}</div>`).join('');
  const pack = PACKS.find(p => p.id === h.pack)?.name || '';
  return `<div class="hero-detail"><div class="hd-name">${h.name}<span>${pack} · ${h.kingdom} · ${h.hp} 体力 · ${h.gender === 'female' ? '女' : '男'}</span></div>${rows}</div>`;
}

// 选将筛选：按扩展包、按武将名/技能名搜索
export function heroMatches(h, { pack = 'all', search = '' } = {}) {
  if (pack !== 'all' && h.pack !== pack) return false;
  const q = search.trim();
  if (!q) return true;
  return h.name.includes(q) || h.id.includes(q.toLowerCase())
    || [...h.skills, ...h.lordSkills].some(id => skillName(id).includes(q));
}

export function renderSetup(st) {
  const el = document.getElementById('setup');
  el.classList.remove('hidden');
  document.getElementById('game').classList.add('hidden');
  const tab = (mode, label) =>
    `<button class="mode-tab${st.mode === mode ? ' on' : ''}" data-action="mode:${mode}">${label}</button>`;
  let body;
  if (st.mode === 'identity' && st.identity) {
    const { role, choices, lordHeroId } = st.identity;
    const lordLine = role === 'lord'
      ? '你是主公，请从以下武将中选择（主公技仅主公拥有）'
      : `主公已选择 <b>${HEROES[lordHeroId].name}</b>，请从以下 ${choices.length} 名武将中选择`;
    body = `
      <div class="role-reveal r-${role}"><span class="role-badge big r-${role}">${ROLE_SHORT[role]}</span>
        <div><div class="role-title">你的身份：${ROLE_NAME[role]}</div><div class="role-desc">${ROLE_DESC[role]}</div></div></div>
      <h2>${lordLine}</h2>
      <div id="hero-grid">${choices.map(id => heroCardHtml(HEROES[id], st.selectedId, role === 'lord')).join('')}</div>
      ${heroDetailHtml(st.selectedId)}`;
  } else {
    // 武将按势力分行（可按扩展包筛选、搜索），下方展示所选武将的技能说明
    const list = HERO_LIST.filter(h => heroMatches(h, st));
    const kingdoms = [...new Set(HERO_LIST.map(h => h.kingdom))];
    const rows = kingdoms.map(k => {
      const hs = list.filter(h => h.kingdom === k);
      return hs.length ? `
      <div class="kingdom-row"><span class="kingdom-label ${KINGDOM_CLASS[k] || ''}">${k}</span>
        ${hs.map(h => heroCardHtml(h, st.selectedId)).join('')}</div>` : '';
    }).join('') || '<div class="hero-none">没有符合条件的武将</div>';
    const packTab = (id, label) =>
      `<button class="pack-tab${(st.pack || 'all') === id ? ' on' : ''}" data-action="pack:${id}">${label}</button>`;
    body = `
      <div class="hero-filter">
        ${packTab('all', '全部')}${PACKS.map(p => packTab(p.id, p.name)).join('')}
        <input id="hero-search" type="search" placeholder="搜索武将或技能" value="${(st.search || '').replace(/"/g, '&quot;')}">
      </div>
      <div id="hero-grid" class="compact">${rows}</div>
      ${heroDetailHtml(st.selectedId)}`;
  }
  el.innerHTML = `
    <h1>三 国 杀</h1>
    <div class="mode-tabs">${tab('1v1', '1v1 单挑')}${tab('identity', '5 人身份局')}</div>
    ${body}
    <button class="primary" data-action="start-game" ${st.selectedId ? '' : 'disabled'}>开始对局</button>
  `;
}

export function renderResult(game) {
  if (!game.over) return;
  const me = game.players[0];
  const win = game.winners?.includes(me) || game.winner === me;
  let sub;
  if (game.mode === 'identity') {
    const rows = game.players.map(p => `
      <div class="res-row${game.winners.includes(p) ? ' won' : ''}${p.alive ? '' : ' dead'}">
        <span class="role-badge r-${p.role}">${ROLE_SHORT[p.role]}</span>
        <span class="res-name">${p.name}${p === me ? '（你）' : ''}</span>
        <span class="res-role">${ROLE_NAME[p.role]}</span>
        <span class="res-state">${p.alive ? '存活' : '阵亡'}</span>
      </div>`).join('');
    sub = `<div class="res-side">${SIDE_NAME[game.winnerSide] || ''}获胜</div><div class="res-table">${rows}</div>`;
  } else {
    sub = `<div class="res-side">胜者：${game.winner?.name || ''}</div>`;
  }
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.innerHTML = `
    <div>
      <div class="result ${win ? 'win' : 'lose'}">${win ? '胜 利' : '失 败'}</div>
      ${sub}
      <div style="text-align:center"><button data-action="restart">再来一局</button></div>
    </div>`;
  document.body.appendChild(overlay);
}
