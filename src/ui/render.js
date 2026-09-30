// 渲染：状态 → DOM（全量重绘）
import {
  CARD_NAME, cardLabel, isRed, canTarget, distance, attackRange,
  canUseInPlayPhase, canUseZhangbaSha, canUseAsSha, canZhangbaPair, canUseCardAs,
  shaLeftOf, shaLimitOf, EQUIP_RANGE, NEED_TARGET, legalTargets, zhangbaTargets,
  canJiedaoVictim, canUseJijiang,
} from '../data/cards.js';
import { hasSkill, HEROES, HERO_LIST } from '../data/heroes.js';
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

function judgeHtml(p) {
  const cards = p.judgeZone.map(c => cardHtml(c, { small: true })).join('');
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

// 武将技能名（主公额外显示主公技）
function skillNamesOf(p) {
  const ids = [...p.hero.skills, ...(p.role === 'lord' ? p.hero.lordSkills || [] : [])];
  return ids.map(s => SKILL_CNAME[s] || s);
}

function playerZoneHtml(game, p, isSelf, equipPick = null, canPick = () => false) {
  const skillNames = skillNamesOf(p).join(' · ');
  const isTurn = game.players[game.currentTurnSeat ?? 0] === p;
  // 正在等该角色做决定：头像下方显示思考进度条（官方倒计时条的样式，不做超时自动操作）
  const thinking = !game.over && game.asking?.player === p;
  const phase = PHASE_NAME[game.currentPhase];
  // 头像图缺失时自行移除，回落为纯文字武将牌（不留白块）；阵亡武将牌整体变灰
  return `
    <div class="hero-plate${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}">
      <div class="avatar" data-seat="${p.seat}">
        <img class="portrait" src="assets/heroes/${p.hero.id}.png" alt="" onerror="this.remove()">
        ${isTurn && phase && !game.over ? `<span class="phase-badge">${phase}</span>` : ''}
        <span class="kingdom ${KINGDOM_CLASS[p.hero.kingdom] || ''}">${p.hero.kingdom}</span>
        ${roleBadge(game, p)}
        <span class="hero-name">${p.name}</span>
      </div>
      ${hpHtml(p)}
      <div class="think-bar"><i></i></div>
      <div class="skills">${skillNames}</div>
    </div>
    <div class="zones">
      ${judgeHtml(p)}
      <div class="zone equips">${equipHtml(p, equipPick, canPick)}</div>
    </div>
    ${isSelf ? '' : handBackHtml(p.hand.length)}
  `;
}

const SKILL_CNAME = {
  rende: '仁德', jianxiong: '奸雄', zhiheng: '制衡', wusheng: '武圣',
  paoxiao: '咆哮', guanxing: '观星', kongcheng: '空城', fankui: '反馈',
  guicai: '鬼才', wushuang: '无双', jijiang: '激将', hujia: '护驾', jiuyuan: '救援',
};

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
  const judge = p.judgeZone.map(c => `<span class="jz-tag" data-card-id="${c.id}">${c.name === 'le' ? '乐' : c.name === 'shandian' ? '电' : (CARD_NAME[c.name] || '?')[0]}</span>`).join('');
  const dist = p.alive ? distance(me, p, game) : null;
  return `
    <div class="seat mini ${cls.join(' ')}${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}" data-seat="${p.seat}">
      <div class="hero-plate${isTurn ? ' acting' : ''}${thinking ? ' thinking' : ''}${p.alive ? '' : ' died'}">
        <div class="avatar" data-seat="${p.seat}">
          <img class="portrait" src="assets/heroes/${p.hero.id}.png" alt="" onerror="this.remove()">
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
        <div class="seat-skills">${skillNamesOf(p).join(' ')}</div>
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
//   制衡（弃置任意张牌）、贯石斧（弃两张牌，不含贯石斧本身）、
//   武圣（红色装备牌当【杀】使用或打出）
export function equipSelectable(game, me, pend, card) {
  if (!pend || !card) return false;
  if (pend.mode === 'play' && pend.skillId === 'zhiheng') return true;
  if (pend.mode === 'pick-hand' && pend.opts.opts.includeEquip) {
    return !(me.equip.weapon?.name === 'guanshi' && card.id === me.equip.weapon.id);
  }
  if (pend.mode === 'play' && !pend.skillId) {
    return canUseAsSha(me, card) && canUseInPlayPhase(game, me, card, 'sha');
  }
  if (pend.mode === 'respond' && pend.opts.req.type === 'sha') return canUseAsSha(me, card);
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
  return canUseInPlayPhase(game, p, card)
    || (canUseAsSha(p, card) && canUseInPlayPhase(game, p, card, 'sha'));
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


function respondCandidates(p, req) {
  if (!req) return [];
  // 能单独当所需牌打出的（牌名相符或武圣转化）
  const direct = p.hand.filter(c => canUseCardAs(p, c, req.type));
  // 丈八蛇矛：需要【杀】时，任意两张手牌均可作为合成材料
  if (req.type === 'sha' && canZhangbaPair(p)) return p.hand;
  return direct;
}

// 已选的单张牌是否以【杀】名义使用（武圣：手动切换，或该牌本身不可用但可当杀）
export function usingAsSha(game, pend) {
  const me = game.players[0];
  const sel = pend?.selected?.[0];
  if (!sel || pend.skillId) return false;
  return !!pend.asSha || (!canUseInPlayPhase(game, me, sel)
    && canUseAsSha(me, sel) && canUseInPlayPhase(game, me, sel, 'sha'));
}

// 当前选择的「指定目标」需求（官方流程：选牌 → 点武将选目标 → 确定）。
// 返回 null 表示无需目标；否则 { name 牌名/技能, stage 'target'|'victim', candidates 当前可选角色, ready 目标已齐 }。
// 借刀杀人分两步：先选持武器者（target），再选其【杀】的目标（victim）。
export function targetSpec(game, pend) {
  if (!pend || pend.mode !== 'play') return null;
  const me = game.players[0];
  const sel = pend.selected;
  const targets = pend.targets || [];
  const one = (name, candidates) => ({ name, stage: 'target', candidates, ready: targets.length === 1 });
  switch (pend.skillId) {
    case 'rende': return sel.length ? one('rende', game.others(me)) : null;
    case 'jijiang': return one('jijiang', game.others(me).filter(t => canTarget(game, me, t, 'sha')));
    case 'zhangba': return sel.length === 2 ? one('sha', zhangbaTargets(game, me)) : null;
    case null: case undefined: break;
    default: return null;
  }
  if (sel.length !== 1) return null;
  const name = usingAsSha(game, pend) ? 'sha' : sel[0].name;
  if (!NEED_TARGET.includes(name)) return null;
  if (name === 'jiedao' && targets[0]) {
    const holder = targets[0];
    return {
      name, stage: 'victim', holder, ready: !!pend.victim,
      candidates: game.alivePlayers().filter(v => canJiedaoVictim(game, me, holder, v)),
    };
  }
  return { ...one(name, legalTargets(game, me, sel[0], name)), ready: targets.length === 1 && name !== 'jiedao' };
}

// 兼容旧调用：当前是否有可指定的其他角色
export function isOppTargetable(game, pend) {
  const spec = targetSpec(game, pend);
  return !!spec && spec.candidates.some(p => p !== game.players[0]);
}

// 当前选择无需目标即可直接生效时，返回对应的横幅动作；否则返回 null
export function directUseAction(game, pend) {
  if (!pend) return null;
  const me = game.players[0];
  const n = pend.selected.length;
  switch (pend.mode) {
    case 'play': {
      if (pend.skillId === 'zhiheng') return n > 0 ? 'confirm-zhiheng' : null;
      const spec = targetSpec(game, pend);
      if (spec) return spec.ready ? 'confirm-target' : null;
      if (pend.skillId !== null || n !== 1 || pend.asSha) return null;
      const sel = pend.selected[0];
      return canUseInPlayPhase(game, me, sel) && !NEED_TARGET.includes(sel.name) ? 'confirm-play' : null;
    }
    case 'respond': {
      const req = pend.opts.req;
      const composite = n === 2 && req.type === 'sha' && canZhangbaPair(me);
      const single = n === 1 && canUseCardAs(me, pend.selected[0], req.type);
      return single || composite ? 'confirm-respond' : null;
    }
    case 'pick-hand': return n === pend.opts.opts.count ? 'confirm-pick' : null;
    case 'peach': return n === 1 ? 'confirm-peach' : null;
    case 'nullify': return n === 1 ? 'confirm-nullify' : null;
    case 'judge-replace': return n === 1 ? 'confirm-judge-replace' : null;
  }
  return null;
}

// ---------- 主渲染 ----------
export function renderGame(game, ui, logs) {
  const me = game.players[0];
  const pend = ui.pending;
  const spec = targetSpec(game, pend);
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
      if (pend.skillId === 'jijiang') {
        // 激将只需选目标，不用手牌
      } else if (pend.skillId) {
        // 丈八蛇矛至多选两张；已满两张时其余牌不可再选
        const full = pend.skillId === 'zhangba' && pend.selected.length >= 2;
        handSelectable = new Set(me.hand.filter(c => !full || selectedIds.has(c.id)).map(c => c.id));
      } else {
        handSelectable = new Set(me.hand.filter(c => playableCheck(game, me, c)).map(c => c.id));
      }
    } else if (pend.mode === 'respond') {
      handSelectable = new Set(respondCandidates(me, pend.opts.req).map(c => c.id));
      // 武圣转化标记：仅标注「牌名不符但可转化」的牌
      for (const c of me.hand) {
        if (c.name !== pend.opts.req.type && canUseCardAs(me, c, pend.opts.req.type)) {
          virtualShaIds.add(c.id);
        }
      }
    } else if (pend.mode === 'peach') {
      handSelectable = new Set(me.hand.filter(c => c.name === 'tao').map(c => c.id));
    } else if (pend.mode === 'nullify') {
      handSelectable = new Set(me.hand.filter(c => c.name === 'wuxie').map(c => c.id));
    } else if (pend.mode === 'judge-replace') {
      handSelectable = new Set(me.hand.map(c => c.id));
    } else if (pend.mode === 'pick-hand') {
      handSelectable = new Set(me.hand.map(c => c.id));
    }
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
// 名称：对自己显示「你」，对他人显示武将名（官方提示栏口吻）
const who = (p, me) => (!p ? '' : p === me ? '你' : p.name);
const cn = name => `【${CARD_NAME[name] || name}】`;
// 无双等需连续打出多张时的进度，如「（无双：共需 2 张，这是第 1 张）」
const nthOf = info => (info?.need > 1 ? `（无双：共需 ${info.need} 张，这是第 ${info.nth} 张）` : '');

// 响应提示：说清楚「谁对你用了什么 → 你要打出什么 → 不打会怎样」
function respondPrompt(me, req) {
  const i = req.info || {};
  const src = who(i.source, me);
  const need = cn(req.type);
  switch (req.reason) {
    case 'sha': return `${src} 对你使用了【杀】，请打出一张${need}${nthOf(i)}`;
    case 'wanjian': return `${src} 使用了【万箭齐发】，请打出一张${need}，否则受到 1 点伤害`;
    case 'nanman': return `${src} 使用了【南蛮入侵】，请打出一张${need}，否则受到 1 点伤害`;
    case 'juedou': return `你与 ${who(i.vs, me)} 决斗中，请打出一张${need}，否则受到 1 点伤害${nthOf(i)}`;
    case 'jiedao': return `${src} 对你使用了【借刀杀人】，请对 ${who(i.victim, me)} 使用一张${need}，否则将 ${i.weapon ? cardLabel(i.weapon) : '武器'} 交给 ${src}`;
    case 'qinglong': return `【杀】被抵消，是否发动【青龙偃月刀】对 ${who(i.target, me)} 再使用一张${need}？`;
    case 'jijiang': return `主公 ${who(i.lord, me)} 发动了【激将】，是否代其打出一张【杀】？`;
    case 'hujia': return `主公 ${who(i.lord, me)} 发动了【护驾】，是否代其打出一张【闪】？`;
    default: return `请打出一张${need}`;
  }
}

// 无懈可击：写明哪张锦囊将对谁生效
function nullifyPrompt(me, e) {
  if (e.isNullify) {
    return `${who(e.source, me)} 使用了【无懈可击】，【${e.name}】即将失效，是否使用【无懈可击】抵消之？`;
  }
  const tgt = who(e.target, me);
  if (e.name === '闪电' || e.name === '乐不思蜀') {
    return `${tgt === '你' ? '你' : tgt}判定区的【${e.name}】即将判定，是否使用【无懈可击】？`;
  }
  const src = e.source ? `${who(e.source, me)} 使用的` : '';
  return `${src}【${e.name}】即将对 ${tgt} 生效，是否使用【无懈可击】？`;
}

// 发动技能/装备效果的询问
function invokePrompt(me, id, info = {}) {
  switch (id) {
    case 'bagua': {
      const what = info.reason === 'wanjian' ? '【万箭齐发】' : '【杀】';
      return [`${who(info.source, me)} 对你使用了${what}，是否发动【八卦阵】判定？${nthOf(info)}`, '判定为红色则视为打出一张【闪】'];
    }
    case 'jianxiong': return ['是否发动【奸雄】？', `获得对你造成伤害的 ${info.card ? useLabelOf(info.card) : '牌'}`];
    case 'fankui': return ['是否发动【反馈】？', `获得 ${who(info.source, me)} 的一张牌（手牌或装备）`];
    case 'cixiong': return [`是否对 ${who(info.target, me)} 发动【雌雄双股剑】？`, '对方须弃置一张手牌，否则你摸一张牌'];
    case 'hanbing': return [`是否发动【寒冰剑】？`, `防止此伤害，改为依次弃置 ${who(info.target, me)} 的两张牌`];
    case 'jijiang': return [`需要打出【杀】，是否发动【激将】？`, `令其他蜀势力角色代你打出${info.hasOwn ? '（你也可以自己出）' : ''}`];
    case 'hujia': return [`需要打出【闪】，是否发动【护驾】？`, `令其他魏势力角色代你打出${info.hasOwn ? '（你也可以自己出）' : ''}`];
    default: return [`是否发动【${SKILL_CNAME[id] || id}】？`, ''];
  }
}

function useLabelOf(card) {
  const reals = realsOf(card);
  return reals.length > 1 ? reals.map(cardLabel).join(' + ') : cardLabel(reals[0] || card);
}

// 非自己操作时的提示：写明正在等谁、做什么（官方「对方思考中」）
const ASK_VERB = {
  askPlayCard: () => '出牌',
  askRespondCard: a => `打出${cn(a[0]?.type || 'sha')}`,
  askPeach: () => '是否使用【桃】',
  askNullify: () => '是否使用【无懈可击】',
  askSkillInvoke: a => `是否发动【${SKILL_CNAME[a[0]] || { bagua: '八卦阵', cixiong: '雌雄双股剑', hanbing: '寒冰剑' }[a[0]] || a[0]}】`,
  askChooseCards: a => (a[0]?.reason === 'discard-phase' ? `弃置 ${a[0].count} 张手牌` : '选择卡牌'),
  askChooseJudgeReplace: () => '是否发动【鬼才】改判',
  askGuanxing: () => '观星',
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

  let prompt = '', hint = '', buttons = '';

  switch (pend.mode) {
    case 'play': {
      if (pend.skillId === 'zhiheng') {
        const n = pend.selected.length;
        prompt = `【制衡】请选择任意张牌弃置，然后摸等量的牌${n ? `（已选 ${n} 张）` : ''}`;
        hint = '手牌与装备区的牌都可以弃置';
        buttons = btn('confirm-zhiheng', `确定${n ? `（${n}）` : ''}`, { primary: true, disabled: n === 0 }) + btn('cancel-skill', '返回');
      } else {
        const spec = targetSpec(game, pend);
        const sel = pend.selected[0];
        hint = rangeInfoHtml(game);
        if (spec) {
          [prompt, hint] = targetPrompt(game, pend, spec);
          const asShaOk = !pend.skillId && sel && !usingAsSha(game, pend)
            && canUseAsSha(me, sel) && canUseInPlayPhase(game, me, sel, 'sha');
          buttons = btn('confirm-target', '确定', { primary: true, disabled: !spec.ready })
            + (asShaOk ? btn('use-as-sha', '当【杀】使用') : '')
            + btn('cancel-skill', pend.skillId ? '返回' : '取消');
        } else if (pend.skillId === 'zhangba') {
          prompt = `【丈八蛇矛】请选择两张手牌当【杀】使用（已选 ${pend.selected.length}/2）`;
          buttons = btn('cancel-skill', '返回');
        } else if (pend.skillId === 'rende') {
          prompt = '【仁德】请选择任意张手牌，再选择交给哪名角色';
          hint = rendeHint(me);
          buttons = btn('cancel-skill', '返回');
        } else if (sel) {
          const asShaOk = canUseAsSha(me, sel) && canUseInPlayPhase(game, me, sel, 'sha');
          prompt = directUsePrompt(game, me, sel);
          hint = '点击「确定」或拖动卡牌至牌桌';
          buttons = btn('confirm-play', '确定', { primary: true })
            + (asShaOk ? btn('use-as-sha', '当【杀】使用') : '')
            + btn('cancel-skill', '取消');
        } else {
          const anyPlayable = me.hand.some(c => playableCheck(game, me, c))
            || Object.values(me.equip).some(c => c && equipSelectable(game, me, pend, c));
          const skillOk = (hasSkill(me, 'zhiheng') && !me.flags.zhihengUsed)
            || (hasSkill(me, 'rende') && me.hand.length > 0) || canUseZhangbaSha(game, me)
            || canUseJijiang(game, me);
          prompt = anyPlayable || skillOk
            ? '出牌阶段，请选择一张卡牌'
            : '出牌阶段，没有可以使用的牌，请点击「结束出牌」';
          hint = `${hint} · 可点击或拖动手牌出牌`;
          const hasActiveSkill = hasSkill(me, 'zhiheng') || hasSkill(me, 'rende');
          buttons =
            // 制衡出牌阶段限一次，用过后置灰
            (hasSkill(me, 'zhiheng') ? btn('skill-zhiheng', '制衡', { disabled: !!me.flags.zhihengUsed }) : '') +
            (hasSkill(me, 'rende') ? btn('skill-rende', '仁德', { disabled: me.hand.length === 0 }) : '') +
            // 主公技激将：出牌阶段令蜀势力角色代出【杀】
            (canUseJijiang(game, me) ? btn('skill-jijiang', '激将') : '') +
            // 丈八蛇矛：装备技能按钮（官方式），可用时才出现
            (canUseZhangbaSha(game, me) ? btn('skill-zhangba', '丈八蛇矛') : '') +
            btn('end-play', '结束出牌', { primary: !hasActiveSkill || !(anyPlayable || skillOk) });
        }
      }
      break;
    }
    case 'respond': {
      const req = pend.opts.req;
      // 提示语由「需要打出什么」(req.type) 与「为什么」(reason + info) 共同决定
      prompt = respondPrompt(me, req);
      const n = pend.selected.length;
      // 「确定」只在选择确实合法时可用：单张需牌名相符或有转化途径（武圣），
      // 两张则须是丈八蛇矛的合成【杀】。否则玩家会以为响应成功却实际白挨伤害。
      const composite = n === 2 && req.type === 'sha' && canZhangbaPair(me);
      const single = n === 1 && canUseCardAs(me, pend.selected[0], req.type);
      if (composite) hint = '【丈八蛇矛】以两张手牌当【杀】打出';
      else if (n === 1 && !single) hint = canZhangbaPair(me)
        ? '该牌不能单独当此牌使用，请再选一张组成【杀】'
        : '该牌不能当此牌使用';
      else if (n === 0) hint = `选择一张${cn(req.type)}后点击「确定」`;
      buttons = btn('confirm-respond', '确定', { primary: true, disabled: !(single || composite) })
        + btn('cancel', req.reason === 'qinglong' ? '不发动' : '不出');
      break;
    }
    case 'peach': {
      const d = pend.opts.info.dying;
      const need = Math.max(1, 1 - d.hp);
      prompt = d === me
        ? `你处于濒死状态，还需 ${need} 个【桃】，是否使用【桃】？`
        : `${d.name} 处于濒死状态，还需 ${need} 个【桃】，是否对其使用【桃】？`;
      hint = d === me ? '不使用【桃】将阵亡' : '';
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
    case 'judge-replace': {
      const { judgeCard, reason, player: judger } = pend.opts.info;
      prompt = `${who(judger, me)}的【${reason}】判定牌为 ${cardLabel(judgeCard)}，是否发动【鬼才】打出一张手牌替换之？`;
      hint = reason === '八卦阵' ? '红色：视为打出【闪】'
        : reason === '闪电' ? '黑桃 2~9：受到 3 点雷电伤害'
        : reason === '乐不思蜀' ? '非红桃：跳过出牌阶段' : '';
      buttons = btn('confirm-judge-replace', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '不发动');
      break;
    }
    case 'pick-hand': {
      const { count, reason, optional, info } = pend.opts.opts;
      const n = pend.selected.length;
      if (reason === 'discard-phase') {
        prompt = `弃牌阶段，请弃置 ${count} 张手牌（已选 ${n}/${count}）`;
        hint = `手牌上限等于当前体力值 ${me.hp}`;
      } else if (reason === 'guanshi') {
        prompt = `是否发动【贯石斧】，弃置两张牌令此【杀】依然造成伤害？（已选 ${n}/2）`;
        hint = '可弃置手牌或装备区的牌（贯石斧除外）';
      } else if (reason === 'cixiong-discard') {
        prompt = `${who(info?.source, me)} 发动了【雌雄双股剑】，请弃置一张手牌，否则其摸一张牌`;
      } else {
        prompt = `请选择 ${count} 张手牌（已选 ${n}/${count}）`;
      }
      buttons = btn('confirm-pick', '确定', { primary: true, disabled: n !== count }) +
        (optional ? btn('cancel', reason === 'cixiong-discard' ? '不弃置' : '取消') : '');
      break;
    }
    case 'pick-zone': {
      const { from, reason, info } = pend.opts.opts;
      const t = info?.target;
      const title = ZONE_TITLE[reason];
      prompt = from === 'horse'
        ? `【${title}】请选择 ${t.name} 的一张坐骑牌弃置`
        : `【${title || '选牌'}】请选择 ${t ? t.name : '对方'} 的一张牌${reason === 'guohe' || reason === 'hanbing' ? '弃置' : '获得'}`;
      hint = '在弹出的面板中点击一张牌';
      break;
    }
    case 'pick-wugu': {
      prompt = '【五谷丰登】请选择一张牌获得';
      hint = '在弹出的面板中点击一张牌';
      break;
    }
    case 'guanxing': {
      prompt = `【观星】观看牌堆顶 ${pend.opts.cards.length} 张牌，将其以任意顺序置于牌堆顶或牌堆底`;
      hint = '拖动牌调整顺序与位置，或点击在两行之间切换';
      break;
    }
  }
  return `<span class="prompt">${prompt}</span>${hint ? `<span class="hint">${hint}</span>` : ''}<span style="flex:1"></span>${buttons}`;
}

function rendeHint(me) {
  return me.flags.rendeHealed
    ? '本回合已通过仁德回复过体力'
    : `本回合已交出 ${me.flags.rendeGiven || 0} 张，累计满 2 张回复 1 点体力`;
}

// 选目标阶段的提示语：未选 → 请选择目标；已选 → 写明「牌 → 目标」，点确定出牌
function targetPrompt(game, pend, spec) {
  const me = game.players[0];
  const names = ps => ps.map(p => who(p, me)).join('、');
  const t = pend.targets || [];
  const how = '点击武将选择目标（再次点击已选目标或点「确定」出牌），也可拖动卡牌至目标';
  const sel = pend.selected[0];
  const via = pend.skillId === 'zhangba' ? '【丈八蛇矛】两张手牌当'
    : usingAsSha(game, pend) ? `【武圣】将${isEquipped(me, sel) ? '装备区的' : ''}${cn(sel.name)}当` : '';
  if (spec.name === 'rende') {
    return [t.length
      ? `【仁德】将 ${pend.selected.length} 张手牌交给 ${names(t)}，点击「确定」`
      : `【仁德】已选 ${pend.selected.length} 张，请选择交给哪名角色`, rendeHint(me)];
  }
  if (spec.name === 'jijiang') {
    return [t.length
      ? `【激将】令蜀势力角色代你对 ${names(t)} 使用【杀】，点击「确定」`
      : '【激将】请选择【杀】的目标', rangeInfoHtml(game)];
  }
  const cardName = `${via}${cn(spec.name)}`;
  if (spec.stage === 'victim') {
    return [pend.victim
      ? `【借刀杀人】令 ${who(spec.holder, me)} 对 ${who(pend.victim, me)} 使用【杀】，点击「确定」`
      : `【借刀杀人】请选择 ${who(spec.holder, me)} 使用【杀】的目标`, '须在其攻击范围内，可以是你自己'];
  }
  if (!spec.candidates.length && !t.length) return [`${cardName}当前没有合法目标`, rangeInfoHtml(game)];
  if (!t.length) {
    const first = spec.name === 'jiedao' ? '【借刀杀人】请选择一名装备有武器的角色' : `请选择${cardName}的目标`;
    return [first, `${how} · ${rangeInfoHtml(game)}`];
  }
  const alt = spec.candidates.length > 1 ? '可点击其他武将改选' : '再次点击目标或拖动卡牌至目标也可出牌';
  return [`${cardName} → ${names(t)}，点击「确定」使用`, `${alt} · ${rangeInfoHtml(game)}`];
}

// 无需目标、点确定即生效的牌的提示
function directUsePrompt(game, me, card) {
  const multi = game.players.length > 2;
  const c = cn(card.name);
  if (card.type === 'equip') {
    const old = me.equip[card.subType];
    return `是否装备${c}？${old ? `（将替换 ${cardLabel(old)}）` : ''}`;
  }
  switch (card.name) {
    case 'tao': return '是否使用【桃】回复 1 点体力？';
    case 'shandian': return '是否将【闪电】置入你的判定区？';
    case 'wuzhong': return '是否使用【无中生有】摸两张牌？';
    case 'nanman': return `是否使用【南蛮入侵】？${multi ? '其他角色依次' : '对方'}须打出一张【杀】，否则受到 1 点伤害`;
    case 'wanjian': return `是否使用【万箭齐发】？${multi ? '其他角色依次' : '对方'}须打出一张【闪】，否则受到 1 点伤害`;
    case 'taoyuan': return '是否使用【桃园结义】？所有角色各回复 1 点体力';
    case 'wugu': return '是否使用【五谷丰登】？亮出牌堆顶的牌，各角色依次选择一张';
    default: return `是否使用${c}？`;
  }
}

const ZONE_TITLE = { shunshou: '顺手牵羊', guohe: '过河拆桥', fankui: '反馈', qilin: '麒麟弓', hanbing: '寒冰剑' };

// ---------- 选牌面板（官方样式：顺/拆/反馈/麒麟弓/寒冰剑、五谷丰登、观星） ----------
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
    const title = ZONE_TITLE[reason] || '选择一张牌';
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
      sections.push(['判定区', t.judgeZone.map(c => item(c.name, cardHtml(c, { selectable: true }))).join('')]);
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

  if (pend.mode === 'guanxing') {
    const { top, bottom } = pend.gx;
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
    return panel('观星',
      `${me.name} 观看牌堆顶 ${pend.opts.cards.length} 张牌：牌堆顶从左到右依次被摸到`,
      row('top', '牌堆顶', top) + row('bottom', '牌堆底', bottom),
      btn('confirm-guanxing', '确定', true));
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
// st = { mode: '1v1' | 'identity', selectedId, identity: { role, choices: [heroId], lordHeroId } }
const ROLE_DESC = {
  lord: '主公：消灭所有反贼和内奸即获胜。你的身份对所有人明置，体力上限 +1',
  loyalist: '忠臣：保护主公，消灭所有反贼和内奸即获胜',
  rebel: '反贼：击杀主公即获胜（同伴是谁需要你自己判断）',
  renegade: '内奸：先帮主公消灭反贼与忠臣，最后与主公单挑并获胜',
};

function heroCardHtml(h, selectedId, lord = false) {
  const skills = [...h.skills, ...(lord ? h.lordSkills || [] : [])].map(s => SKILL_CNAME[s] || s).join('、');
  return `
    <div class="hero-card ${h.id === selectedId ? 'selected' : ''}" data-hero="${h.id}">
      <div class="face"><img src="assets/heroes/${h.id}.png" alt="" onerror="this.remove()"></div>
      <div class="name">${h.name}</div>
      <div class="kingdom-line">${h.kingdom} · ${h.hp + (lord ? 1 : 0)} 体力</div>
      <div class="skills">${skills}</div>
    </div>`;
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
      <div id="hero-grid">${choices.map(id => heroCardHtml(HEROES[id], st.selectedId, role === 'lord')).join('')}</div>`;
  } else {
    body = `
      <h2>标准版 · 选择你的武将</h2>
      <div id="hero-grid">${HERO_LIST.map(h => heroCardHtml(h, st.selectedId)).join('')}</div>`;
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
