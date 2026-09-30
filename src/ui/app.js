// 应用入口：选将 → 对局循环 → 事件分发
import { Game } from '../core/game.js';
import { UIController } from './ui-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { HEROES, HERO_LIST } from '../data/heroes.js';
import { makeVirtual } from '../core/card-use.js';
import { dealRoles, lordCandidates, heroChoices, assignRest, LORD_HEROES } from '../core/identity.js';
import { shuffle } from '../core/deck.js';
import {
  renderGame, renderSetup, renderResult, directUseAction, equipSelectable, targetSpec, usingAs, pickPlayerSpec, pairOf,
} from './render.js';
import { snapshotFx, playFx, showTargetPreview } from './animate.js';

let ui = null;
let game = null;
let logs = [];
// 选将界面状态：mode = '1v1' | 'identity'；pack / search：武将筛选；identity = { roles, role, choices, lordHeroId }
const setup = { mode: '1v1', selectedId: null, pack: 'all', search: '', identity: null };
const HERO_IDS = HERO_LIST.map(h => h.id);

// 身份局：发身份并准备候选武将（人类固定为 0 号座位）。
// 主公若是 AI，先由其从主公候选中选将（优先有主公技的武将），人类再从剩余武将中 3 选 1。
function dealIdentity() {
  const roles = dealRoles(5);
  const role = roles[0];
  let choices, lordHeroId = null;
  if (role === 'lord') {
    choices = lordCandidates(HERO_IDS);
  } else {
    lordHeroId = shuffle(LORD_HEROES)[0];
    choices = heroChoices(HERO_IDS, [lordHeroId], 3);
  }
  setup.identity = { roles, role, choices, lordHeroId };
  setup.selectedId = null;
}

// ---------- 日志 ----------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 战报中的牌名按花色着色（官方战报红色花色为红字），便于一眼看出出了什么牌
const CARD_RE = /(黑桃|梅花|红桃|方片)(10|[2-9AJQK])【([^】]+)】/g;
function colorCards(html) {
  return html.replace(CARD_RE, (m, suit) =>
    `<span class="log-card ${suit === '红桃' || suit === '方片' ? 'red' : 'black'}">${m}</span>`);
}

function logHtml(msg) {
  let cls = 'log-line';
  if (msg.startsWith('────')) cls += ' turn';
  else if (msg.includes('发动')) cls += ' skill';
  else if (msg.includes('伤害') || msg.includes('命中') || msg.includes('阵亡')) cls += ' damage';
  return `<div class="${cls}">${colorCards(escapeHtml(msg))}</div>`;
}

// ---------- 渲染 ----------
function render() {
  if (!game) return;
  // 已选中的牌可能因引擎改动而失效（如被弃置/交给对方）。
  // 渲染前剔除，避免横幅与「可指定目标」高亮基于已不存在的牌，误导玩家。
  // 制衡可选装备区的牌，故判定范围为「手牌 + 装备区」。
  // 注意只清理 selected：观星/五谷的牌本就不在手牌里，另有状态。
  const pend = ui?.pending;
  if (pend && pend.selected.length) {
    const me = game.players[0];
    const held = id => me.hand.some(h => h.id === id)
      || Object.values(me.equip).some(e => e && e.id === id);
    pend.selected = pend.selected.filter(c => held(c.id));
    if (!pend.selected.length) pend.asName = null;
  }
  normalizeTargets();
  snapshotFx(game);          // 重绘前：记录卡牌/体力/回合状态，供动画差值
  renderGame(game, ui, logs);
  if (drag?.active) markDragging();
  playFx(game);              // 重绘后：卡牌飞行 / 飘字 / 震动 / 回合横幅
  // 已选目标：从自己的头像向目标画常驻指示线（官方选目标时的指示器）
  const p2 = ui?.pending;
  const live = (p2?.mode === 'play' || p2?.mode === 'pick-player') && !game.over;
  showTargetPreview(game.players[0].seat,
    live ? (p2.targets || []).map(t => t.seat) : [], live ? p2.victim?.seat ?? null : null);
  if (game.over && !document.getElementById('overlay')) renderResult(game);
}

// 选目标：剔除已失效的目标；只有一个合法目标时自动选中（1v1 直接点「确定」即可）
function normalizeTargets() {
  const pend = ui?.pending;
  if (!pend || pend.mode !== 'play') return;
  pend.targets = pend.targets || [];
  const first = targetSpec(game, { ...pend, targets: [], victim: null });
  if (!first) { pend.targets = []; pend.victim = null; return; }
  // 多目标（离间）：逐个校验已选目标，保留仍合法的前缀；不自动选中
  if (first.max > 1) {
    const kept = [];
    for (const t of pend.targets) {
      const sp = targetSpec(game, { ...pend, targets: kept });
      if (sp && sp.candidates.some(c => c.seat === t.seat)) kept.push(t); else break;
    }
    pend.targets = kept;
    pend.victim = null;
    return;
  }
  const inList = (list, p) => !!p && list.some(x => x.seat === p.seat);
  if (pend.targets[0] && !inList(first.candidates, pend.targets[0])) { pend.targets = []; pend.victim = null; }
  if (!pend.targets.length && first.candidates.length === 1) pend.targets = [first.candidates[0]];
  const spec = targetSpec(game, pend);
  if (spec?.stage === 'victim') {
    if (pend.victim && !inList(spec.candidates, pend.victim)) pend.victim = null;
    if (!pend.victim && spec.candidates.length === 1) pend.victim = spec.candidates[0];
  } else {
    pend.victim = null;
  }
}

// 按当前选择组装出牌动作（与 AI 返回的动作格式一致）
function buildAction(pend) {
  const targets = [...(pend.targets || [])];
  const sel = pend.selected;
  if (pend.skillId && pairOf(game.players[0], pend.skillId)) return { cards: [...sel], card: sel[0], targets };
  if (pend.skillId) return { skillId: pend.skillId, cards: [...sel], targets };
  const victim = pend.victim ? { victim: pend.victim } : {};
  // 转化技：以转化后的牌名使用（引擎会重新校验转化来源）
  const as = usingAs(game, pend);
  if (as) return { card: makeVirtual(sel[0], as), targets, ...victim };
  return { card: sel[0], targets, ...victim };
}

function confirmTarget() {
  const pend = ui?.pending;
  const spec = targetSpec(game, pend);
  if (!spec?.ready) return;
  finish(buildAction(pend));
}

// ---------- 对局 ----------
function startGame() {
  if (!setup.selectedId) return;
  ui = new UIController();
  logs = [];
  const logger = msg => logs.push({ html: logHtml(msg) });
  if (setup.mode === 'identity') {
    const { roles, lordHeroId } = setup.identity;
    // 按座位排武将：0 号为玩家；AI 主公用其选好的武将；其余 AI 随机
    const heroes = new Array(5).fill(null);
    heroes[0] = setup.selectedId;
    const lordSeat = roles.indexOf('lord');
    if (lordSeat !== 0) heroes[lordSeat] = lordHeroId;
    const rest = assignRest(HERO_IDS, heroes.filter(Boolean), heroes.filter(x => !x).length);
    for (let i = 0; i < 5; i++) if (!heroes[i]) heroes[i] = rest.shift();
    // 4 名 AI：出牌稍慢便于看清，响应更快（见 AIController）
    const ais = [1, 2, 3, 4].map(() => new AIController(320));
    game = new Game({
      heroes: heroes.map(id => HEROES[id]), controllers: [ui, ...ais], mode: 'identity', roles, logger,
    });
  } else {
    const aiChoices = HERO_LIST.filter(h => h.id !== setup.selectedId);
    const aiHero = aiChoices[Math.floor(Math.random() * aiChoices.length)];
    game = new Game({ heroes: [HEROES[setup.selectedId], aiHero], controllers: [ui, new AIController(500)], logger });
  }
  game.onUpdate = render;

  document.getElementById('setup').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  document.getElementById('overlay')?.remove();
  render();

  game.run().then(render).catch(err => {
    console.error('对局异常：', err);
    logs.push({ html: `<div class="log-line damage">对局异常：${escapeHtml(String(err?.message || err))}</div>` });
    render();
  });
  // 调试钩子（控制台/测试用）
  window.__sg = () => game;
  window.__ui = () => ui;
}

// ---------- 询问结算 ----------
function finish(result) {
  ui._finish(result);
  render();
}

// ---------- 事件处理 ----------
function onBannerAction(action) {
  if (action === 'start-game') { startGame(); return; }
  if (action.startsWith('pack:')) {
    setup.pack = action.slice(5);
    renderSetup(setup);
    return;
  }
  if (action.startsWith('mode:')) {
    setup.mode = action.slice(5);
    setup.selectedId = null;
    if (setup.mode === 'identity') dealIdentity();
    renderSetup(setup);
    return;
  }
  if (action === 'restart') {
    document.getElementById('overlay')?.remove();
    showTargetPreview(null, []);
    game = null; ui = null;
    if (setup.mode === 'identity') dealIdentity();
    renderSetup(setup);
    return;
  }

  const pend = ui.pending;
  if (!pend) return;

  if (action.startsWith('zone:')) {
    finish([action.slice(5)]);
    return;
  }
  if (action.startsWith('option:')) {
    if (pend.mode === 'pick-option') finish(action.slice(7));
    return;
  }
  if (action.startsWith('use-as:')) { ui.useAs(action.slice(7) || null); render(); return; }
  if (action.startsWith('skill-')) { ui.startSkill(action.slice(6)); render(); return; }
  if (action.startsWith('wugu:')) {
    if (pend.mode !== 'pick-wugu') return;
    const card = pend.opts.opts.info.candidates.find(c => c.id === Number(action.slice(5)));
    if (card) finish([card]);
    return;
  }

  switch (action) {
    case 'confirm-play': finish({ card: pend.selected[0], targets: [] }); break;
    case 'use-as-sha': ui.useAs('sha'); render(); break;
    case 'end-play': finish(null); break;
    case 'cancel-skill': ui.backToPlay(); render(); break;
    case 'confirm-target': confirmTarget(); break;
    case 'confirm-skill':
      if (directUseAction(game, pend) === action) finish({ skillId: pend.skillId, cards: [...pend.selected], targets: [] });
      break;
    case 'confirm-players': finish([...(pend.targets || [])]); break;
    case 'confirm-respond': {
      const req = pend.opts.req;
      if (pend.selected.length > 1) {
        // 多张当一张（丈八蛇矛：两张手牌当【杀】打出）
        finish({ cards: [...pend.selected], as: req.type });
        break;
      }
      const card = pend.selected[0];
      // 武圣等转化：非同名牌以 req.type 名义打出
      finish(card.name === req.type ? card : { card, as: req.type });
      break;
    }
    case 'confirm-peach': finish(pend.selected[0]); break;
    case 'confirm-nullify': finish(pend.selected[0]); break;
    case 'confirm-pick': finish(pend.selected); break;
    case 'confirm-arrange':
      // 牌堆顶一行从左到右依次被摸到；牌堆底一行从左到右依次沉底
      finish({ top: [...pend.gx.top], bottom: [...pend.gx.bottom] });
      break;
    case 'yes': finish(true); break;
    case 'no': finish(false); break;
    case 'cancel': finish(null); break;
  }
}

function onHandCardClick(cardId) {
  const pend = ui?.pending;
  if (!pend || !game) return;
  // dataset 值是字符串，card.id 是数字，必须转换后比较
  const card = game.players[0].hand.find(c => c.id === Number(cardId));
  if (!card) return;
  ui.toggleCard(card);
  render();
}

// 自己装备区的牌：制衡（弃置任意张）、贯石斧（弃两张）、武圣（红色装备当【杀】）时可点选
function onSelfEquipClick(cardId) {
  const pend = ui?.pending;
  if (!pend || !game) return;
  const me = game.players[0];
  const card = Object.values(me.equip).find(c => c && c.id === Number(cardId));
  if (!card) return;
  const selected = pend.selected.some(c => c.id === card.id);
  if (!selected && !equipSelectable(game, me, pend, card)) return;
  if ((pend.mode === 'play' && !pend.skillId) || pend.mode === 'respond') {
    // 装备区的牌只能经转化技使用或打出（武圣/奇袭/国色），单选；转化名由 usingAs 自动判定
    pend.selected = selected ? [] : [card];
    pend.asName = null;
    pend.targets = [];
  } else {
    ui.toggleCard(card);
  }
  render();
}

// 观星：点击一张牌在「牌堆顶 / 牌堆底」之间切换（放到另一行末尾）
function onGuanxingClick(cardId) {
  const pend = ui?.pending;
  if (pend?.mode !== 'arrange') return;
  const id = Number(cardId);
  const inTop = pend.gx.top.some(c => c.id === id);
  ui.moveGuanxing(id, inTop ? 'bottom' : 'top');
  render();
}

// 点击武将（选目标）：点可选角色 → 选中/改选；再次点击已选目标 → 确定出牌；
// 点已选但当前阶段不可再选的角色（如借刀的持武器者）→ 取消该选择
function onSeatClick(seat) {
  const pend = ui?.pending;
  if (!pend || !game) return;
  const p = game.players[seat];
  // 选择角色（突袭/遗计/流离）：点击切换选中，单选时直接改选
  if (pend.mode === 'pick-player') {
    const sp = pickPlayerSpec(pend);
    const i = pend.targets.indexOf(p);
    if (i >= 0) pend.targets.splice(i, 1);
    else if (pend.opts.opts.candidates.includes(p)) {
      if ((pend.opts.opts.max ?? 1) <= 1) pend.targets = [p];
      else if (sp.candidates.includes(p)) pend.targets.push(p);
    }
    render();
    return;
  }
  if (pend.mode !== 'play') return;
  const spec = targetSpec(game, pend);
  if (!spec) return;
  const isCand = spec.candidates.some(c => c.seat === seat);
  // 多目标（离间）：按顺序点选，再点已选者取消（连同其后的选择）
  if (spec.max > 1) {
    const i = pend.targets.findIndex(t => t.seat === seat);
    if (i >= 0) pend.targets = pend.targets.slice(0, i);
    else if (isCand) pend.targets = [...pend.targets, p];
    render();
    return;
  }
  if (spec.stage === 'victim') {
    if (pend.victim?.seat === seat && spec.ready) { confirmTarget(); return; }
    if (isCand) pend.victim = p;
    else if (pend.targets[0]?.seat === seat) { pend.targets = []; pend.victim = null; }
    render();
    return;
  }
  if (!isCand) return;
  if (pend.targets[0]?.seat === seat) {
    if (spec.ready) { confirmTarget(); return; }
  } else {
    pend.targets = [p];
    pend.victim = null;
  }
  render();
}

// ---------- 拖拽出牌（参考官方：按住手牌拖出，松手于目标武将即指定目标，松手于牌桌即使用，拖回手牌区则取消） ----------
const DRAG_THRESHOLD = 8;
let drag = null;
let suppressClick = false;

// 拖放落点：落在可选目标的武将上 → 'target'（附 seat）；落在牌桌其他位置且无需再选目标 → 'use'
function dropZoneAt(x, y) {
  const pend = ui?.pending;
  if (!pend || !game) return null;
  const el = document.elementFromPoint(x, y);
  const handTop = document.getElementById('hand-row').getBoundingClientRect().top;
  if (y >= handTop - 10 || !el?.closest('#table')) return null;
  const spec = targetSpec(game, pend);
  const seatEl = el.closest('.seat[data-seat], #opp-row[data-seat], #self-row[data-seat]');
  if (spec && seatEl) {
    const seat = Number(seatEl.dataset.seat);
    if (spec.candidates.some(c => c.seat === seat)) return { zone: 'target', seat };
  }
  if (directUseAction(game, pend)) return { zone: 'use' };
  return null;
}

// 拖拽中每次重绘后重新标记：原牌留空位、可放置区域高亮
function markDragging() {
  const pend = ui?.pending;
  const ids = new Set((pend?.selected || []).map(c => String(c.id)));
  for (const el of document.querySelectorAll('#hand-row [data-card-id]')) {
    el.classList.toggle('drag-origin', ids.has(el.dataset.cardId));
  }
  const spec = pend ? targetSpec(game, pend) : null;
  const useOk = !!pend && !!directUseAction(game, pend);
  for (const el of document.querySelectorAll('.seat[data-seat], #opp-row[data-seat], #self-row[data-seat]')) {
    if (el.id === 'opp-row' && el.classList.contains('multi')) continue;
    const seat = Number(el.dataset.seat);
    const ok = !!spec && spec.candidates.some(c => c.seat === seat);
    el.classList.toggle('drop-target', ok);
    el.classList.toggle('drop-hover', ok && drag.zone?.zone === 'target' && drag.zone.seat === seat);
  }
  document.getElementById('field').classList.toggle('drop-target', useOk);
  document.getElementById('field').classList.toggle('drop-hover', useOk && drag.zone?.zone === 'use');
  drag.ghost?.classList.toggle('will-drop', !!drag.zone);
}

function clearDragMarks() {
  for (const el of document.querySelectorAll('.drag-origin, .drop-target, .drop-hover')) {
    el.classList.remove('drag-origin', 'drop-target', 'drop-hover');
  }
}

function buildGhost() {
  const pend = ui.pending;
  const ghost = document.createElement('div');
  ghost.id = 'drag-ghost';
  // 多选（丈八蛇矛/制衡/仁德/弃牌）时整叠拖动
  for (const c of pend.selected) {
    const src = document.querySelector(`#hand-row [data-card-id="${c.id}"]`);
    if (!src) continue;
    const cl = src.cloneNode(true);
    cl.classList.remove('selectable', 'selected', 'drag-origin');
    ghost.appendChild(cl);
  }
  document.body.appendChild(ghost);
  return ghost;
}

function moveGhost(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.offX}px, ${y - drag.offY}px)`;
}

function endDrag(commit) {
  const d = drag;
  drag = null;
  d.ghost.remove();
  clearDragMarks();
  if (!d.active) return;
  suppressClick = true;
  // 某些情况下 click 不会派发（松手位置不同元素），下一帧兜底复位
  setTimeout(() => { suppressClick = false; }, 0);
  const pend = ui?.pending;
  if (!pend || pend !== d.pend) { render(); return; }
  if (commit && d.zone?.zone === 'target') {
    // 拖到目标武将：选中该目标，目标已齐则直接出牌（借刀杀人还需再选【杀】的目标）
    const p = game.players[d.zone.seat];
    const spec = targetSpec(game, pend);
    if (spec?.stage === 'victim') pend.victim = p;
    else if (spec?.max > 1) { if (!pend.targets.includes(p)) pend.targets.push(p); }
    else { pend.targets = [p]; pend.victim = null; }
    normalizeTargets();
    if (targetSpec(game, pend)?.ready) { confirmTarget(); return; }
    render();
    return;
  }
  if (commit && d.zone?.zone === 'use') { onBannerAction(directUseAction(game, pend)); return; }
  // 未放到有效区域：牌回到手中，恢复拖拽前的选择
  pend.selected = d.prevSelected;
  pend.asName = d.prevAsName;
  render();
}

document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || drag) return;
  const el = e.target.closest('#hand-row [data-card-id]');
  if (!el || !ui?.pending || ui.pending.mode === 'arrange') return;
  if (!el.classList.contains('selectable') && !el.classList.contains('selected')) return;
  const r = el.getBoundingClientRect();
  drag = {
    id: Number(el.dataset.cardId), startX: e.clientX, startY: e.clientY,
    offX: e.clientX - r.left, offY: e.clientY - r.top,
    active: false, zone: null, ghost: null, pend: ui.pending,
  };
});

document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    const pend = ui?.pending;
    const card = game?.players[0].hand.find(c => c.id === drag.id);
    if (!pend || pend !== drag.pend || !card) { drag = null; return; }
    drag.prevSelected = [...pend.selected];
    drag.prevAsName = pend.asName;
    // 拖动未选中的牌时，先按点击规则把它加入选择
    if (!pend.selected.some(c => c.id === card.id)) ui.toggleCard(card);
    drag.active = true;
    render();
    drag.ghost = buildGhost();
    document.body.classList.add('dragging');
  }
  moveGhost(e.clientX, e.clientY);
  drag.zone = dropZoneAt(e.clientX, e.clientY);
  markDragging();
});

document.addEventListener('pointerup', e => {
  if (!drag) return;
  if (!drag.active) { drag = null; return; }
  drag.zone = dropZoneAt(e.clientX, e.clientY);
  document.body.classList.remove('dragging');
  endDrag(true);
});

function cancelDrag() {
  if (gxDrag) { endGxDrag(false); return; }
  if (!drag) return;
  document.body.classList.remove('dragging');
  if (drag.active) endDrag(false); else drag = null;
}
document.addEventListener('pointercancel', cancelDrag);
document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelDrag(); });
window.addEventListener('blur', cancelDrag);

// ---------- 观星拖拽：在牌堆顶/牌堆底两行之间、行内自由拖动排序 ----------
let gxDrag = null;

// 根据指针位置求落点：哪一行、插入到第几位
function gxDropAt(x, y) {
  for (const rowEl of document.querySelectorAll('#picker [data-gx-row]')) {
    const r = rowEl.parentElement.getBoundingClientRect();
    if (y < r.top || y > r.bottom) continue;
    const items = [...rowEl.querySelectorAll('.gx-item:not(.gx-origin)')];
    let index = items.length;
    for (let i = 0; i < items.length; i++) {
      const b = items[i].getBoundingClientRect();
      if (x < b.left + b.width / 2) { index = i; break; }
    }
    return { row: rowEl.dataset.gxRow, index, rowEl, items };
  }
  return null;
}

function gxMarkDrop() {
  for (const el of document.querySelectorAll('#picker .gx-insert')) el.classList.remove('gx-insert', 'before', 'after');
  for (const el of document.querySelectorAll('#picker [data-gx-row]')) el.classList.remove('drop-hover');
  const d = gxDrag.drop;
  if (!d) return;
  d.rowEl.classList.add('drop-hover');
  const it = d.items[d.index] || d.items[d.index - 1];
  if (it) it.classList.add('gx-insert', d.items[d.index] ? 'before' : 'after');
}

document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || gxDrag || ui?.pending?.mode !== 'arrange') return;
  const el = e.target.closest('#picker .gx-item');
  if (!el) return;
  const r = el.getBoundingClientRect();
  gxDrag = {
    id: Number(el.dataset.cardId), el, startX: e.clientX, startY: e.clientY,
    offX: e.clientX - r.left, offY: e.clientY - r.top, active: false, ghost: null, drop: null,
  };
});

document.addEventListener('pointermove', e => {
  if (!gxDrag) return;
  if (!gxDrag.active) {
    if (Math.hypot(e.clientX - gxDrag.startX, e.clientY - gxDrag.startY) < DRAG_THRESHOLD) return;
    gxDrag.active = true;
    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    const cl = gxDrag.el.querySelector('.card').cloneNode(true);
    cl.classList.remove('selectable');
    ghost.appendChild(cl);
    document.body.appendChild(ghost);
    gxDrag.ghost = ghost;
    gxDrag.el.classList.add('gx-origin');
    document.body.classList.add('dragging');
  }
  gxDrag.ghost.style.transform = `translate(${e.clientX - gxDrag.offX}px, ${e.clientY - gxDrag.offY}px)`;
  gxDrag.drop = gxDropAt(e.clientX, e.clientY);
  gxMarkDrop();
});

function endGxDrag(commit) {
  const d = gxDrag;
  gxDrag = null;
  if (!d.active) return;
  d.ghost.remove();
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  if (commit && d.drop && ui?.pending?.mode === 'arrange') {
    // gxDropAt 的下标不含被拖的牌本身，moveGuanxing 需要的是移除该牌后的下标，二者一致
    const gx = ui.pending.gx;
    for (const r of ['top', 'bottom']) {
      const i = gx[r].findIndex(c => c.id === d.id);
      if (i >= 0) gx[r].splice(i, 1);
    }
    const card = ui.pending.opts.cards.find(c => c.id === d.id);
    gx[d.drop.row].splice(d.drop.index, 0, card);
  }
  render();
}

document.addEventListener('pointerup', () => { if (gxDrag) endGxDrag(true); });
document.addEventListener('pointercancel', () => { if (gxDrag) endGxDrag(false); });

document.addEventListener('click', e => {
  // 拖拽结束后浏览器仍会派发一次 click，需吞掉，避免把刚出的牌再次切换
  if (suppressClick) { suppressClick = false; return; }
  // 选将界面
  const heroEl = e.target.closest('#setup [data-hero]');
  if (heroEl) {
    setup.selectedId = heroEl.dataset.hero;
    renderSetup(setup);
    return;
  }

  // 横幅 / 选将 / 结算界面的按钮
  const btn = e.target.closest('[data-action]');
  if (btn) { if (!btn.disabled) onBannerAction(btn.dataset.action); return; }

  // 观星面板中的牌
  const gxCard = e.target.closest('#picker .gx-item');
  if (gxCard) { onGuanxingClick(gxCard.dataset.cardId); return; }

  // 武将（指定目标）：身份局点整个座位，1v1 点头像；借刀杀人的【杀】目标可以是自己
  const seatEl = e.target.closest('.seat[data-seat]')
    || (e.target.closest('#opp-row .avatar, #self-row .avatar') && e.target.closest('[data-seat]'));
  if (seatEl && ((ui?.pending?.mode === 'play' && targetSpec(game, ui.pending)) || ui?.pending?.mode === 'pick-player')) {
    onSeatClick(Number(seatEl.dataset.seat));
    return;
  }

  // 自己的手牌
  // 自己的手牌：只有「可选」或「已选（用于取消）」的牌才响应点击，
  // 否则玩家能点中不可选的牌并绕过规则（例如拿【杀】冒充【无懈可击】）
  const handCard = e.target.closest('#hand-row [data-card-id]');
  if (handCard
    && (handCard.classList.contains('selectable') || handCard.classList.contains('selected'))) {
    onHandCardClick(handCard.dataset.cardId);
    return;
  }

  // 自己装备区的牌（制衡可弃置装备）
  const equipCard = e.target.closest('#self-row [data-card-id]');
  if (equipCard
    && (equipCard.classList.contains('selectable') || equipCard.classList.contains('selected'))) {
    onSelfEquipClick(equipCard.dataset.cardId);
  }
});

// 选将搜索：输入即筛选（重绘后恢复输入框焦点与光标）
document.addEventListener('input', e => {
  if (e.target.id !== 'hero-search') return;
  setup.search = e.target.value;
  const pos = e.target.selectionStart;
  renderSetup(setup);
  const el = document.getElementById('hero-search');
  el.focus();
  el.setSelectionRange(pos, pos);
});

// 启动：显示选将界面
renderSetup(setup);
