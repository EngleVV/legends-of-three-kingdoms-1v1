// 应用入口：选将 → 对局循环 → 事件分发
import { Game } from '../core/game.js';
import { UIController } from './ui-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { HEROES, HERO_LIST } from '../data/heroes.js';
import { canUseInPlayPhase, canUseAsSha } from '../data/cards.js';
import { makeVirtual } from '../core/card-use.js';
import { renderGame, renderSetup, renderResult, isOppTargetable, directUseAction } from './render.js';
import { snapshotFx, playFx } from './animate.js';

let ui = null;
let game = null;
let logs = [];
let selectedHeroId = null;

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
    if (!pend.selected.length) pend.asSha = false;
  }
  snapshotFx(game);          // 重绘前：记录卡牌/体力/回合状态，供动画差值
  renderGame(game, ui, logs);
  if (drag?.active) markDragging();
  playFx(game);              // 重绘后：卡牌飞行 / 飘字 / 震动 / 回合横幅
  if (game.over && !document.getElementById('overlay')) renderResult(game);
}

// ---------- 对局 ----------
function startGame() {
  if (!selectedHeroId) return;
  const myHero = HEROES[selectedHeroId];
  const aiChoices = HERO_LIST.filter(h => h.id !== selectedHeroId);
  const aiHero = aiChoices[Math.floor(Math.random() * aiChoices.length)];

  ui = new UIController();
  const ai = new AIController(500);
  logs = [];
  game = new Game({
    heroes: [myHero, aiHero],
    controllers: [ui, ai],
    logger: msg => logs.push({ html: logHtml(msg) }),
  });
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
  if (action === 'restart') {
    document.getElementById('overlay')?.remove();
    game = null; ui = null;
    renderSetup(selectedHeroId);
    return;
  }

  const pend = ui.pending;
  if (!pend) return;

  if (action.startsWith('zone:')) {
    finish([action.slice(5)]);
    return;
  }
  if (action.startsWith('wugu:')) {
    if (pend.mode !== 'pick-wugu') return;
    const card = pend.opts.opts.info.candidates.find(c => c.id === Number(action.slice(5)));
    if (card) finish([card]);
    return;
  }

  switch (action) {
    case 'confirm-play': finish({ card: pend.selected[0], targets: [] }); break;
    case 'use-as-sha': ui.useAsSha(); render(); break;
    case 'end-play': finish(null); break;
    case 'cancel-skill': ui.backToPlay(); render(); break;
    case 'skill-zhiheng': ui.startSkill('zhiheng'); render(); break;
    case 'skill-rende': ui.startSkill('rende'); render(); break;
    case 'confirm-zhiheng': finish({ skillId: 'zhiheng', cards: pend.selected, targets: [] }); break;
    case 'confirm-respond': {
      const req = pend.opts.req;
      if (pend.selected.length === 2) {
        // 丈八蛇矛：两张手牌当【杀】打出
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
    case 'confirm-judge-replace': finish(pend.selected[0]); break;
    case 'confirm-pick': finish(pend.selected); break;
    case 'confirm-guanxing':
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

// 自己装备区的牌：仅在制衡（可弃置任意张牌）时可点选
function onSelfEquipClick(cardId) {
  const pend = ui?.pending;
  if (!pend || !game) return;
  if (pend.mode !== 'play' || pend.skillId !== 'zhiheng') return;
  const card = Object.values(game.players[0].equip).find(c => c && c.id === Number(cardId));
  if (!card) return;
  const i = pend.selected.findIndex(c => c.id === card.id);
  if (i >= 0) pend.selected.splice(i, 1);
  else pend.selected.push(card);
  render();
}

// 观星：点击一张牌在「牌堆顶 / 牌堆底」之间切换（放到另一行末尾）
function onGuanxingClick(cardId) {
  const pend = ui?.pending;
  if (pend?.mode !== 'guanxing') return;
  const id = Number(cardId);
  const inTop = pend.gx.top.some(c => c.id === id);
  ui.moveGuanxing(id, inTop ? 'bottom' : 'top');
  render();
}

function onOppAvatarClick() {
  const pend = ui?.pending;
  if (!pend || pend.mode !== 'play' || !game) return;
  const opp = game.players[1];
  const me = game.players[0];
  if (pend.skillId === 'rende') {
    if (pend.selected.length > 0) {
      finish({ skillId: 'rende', cards: pend.selected, targets: [opp] });
    }
    return;
  }
  if (pend.skillId !== null) return;

  if (pend.selected.length === 2) {
    // 丈八蛇矛：两张手牌合成【杀】
    finish({ cards: [...pend.selected], card: pend.selected[0], targets: [opp] });
    return;
  }
  if (pend.selected.length !== 1) return;

  const sel = pend.selected[0];
  const selfOk = canUseInPlayPhase(game, me, sel);
  const asShaOk = canUseAsSha(me, sel) && canUseInPlayPhase(game, me, sel, 'sha');
  if (pend.asSha || (!selfOk && asShaOk)) {
    // 武圣：以【杀】名义使用
    finish({ card: makeVirtual(sel, 'sha'), targets: [opp] });
    return;
  }
  finish({ card: sel, targets: [opp] });
}

// ---------- 拖拽出牌（参考官方：按住手牌拖出，松手于目标武将即指定目标，松手于牌桌即使用，拖回手牌区则取消） ----------
const DRAG_THRESHOLD = 8;
let drag = null;
let suppressClick = false;

function dropZoneAt(x, y) {
  const pend = ui?.pending;
  if (!pend || !game) return null;
  const el = document.elementFromPoint(x, y);
  // 手牌区之上的牌桌区域视为「打出」；1v1 唯一目标，拖到牌桌任意处即自动指定对方
  const handTop = document.getElementById('hand-row').getBoundingClientRect().top;
  if (y >= handTop - 10 || !el?.closest('#table')) return null;
  if (isOppTargetable(game, pend)) return 'target';
  if (directUseAction(game, pend)) return 'use';
  return null;
}

// 拖拽中每次重绘后重新标记：原牌留空位、可放置区域高亮
function markDragging() {
  const pend = ui?.pending;
  const ids = new Set((pend?.selected || []).map(c => String(c.id)));
  for (const el of document.querySelectorAll('#hand-row [data-card-id]')) {
    el.classList.toggle('drag-origin', ids.has(el.dataset.cardId));
  }
  const oppOk = !!pend && isOppTargetable(game, pend);
  const useOk = !!pend && !!directUseAction(game, pend);
  document.getElementById('opp-row').classList.toggle('drop-target', oppOk);
  document.getElementById('opp-row').classList.toggle('drop-hover', oppOk && drag.zone === 'target');
  document.getElementById('field').classList.toggle('drop-target', useOk);
  document.getElementById('field').classList.toggle('drop-hover', useOk && drag.zone === 'use');
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
  if (commit && d.zone === 'target') { onOppAvatarClick(); return; }
  if (commit && d.zone === 'use') { onBannerAction(directUseAction(game, pend)); return; }
  // 未放到有效区域：牌回到手中，恢复拖拽前的选择
  pend.selected = d.prevSelected;
  pend.asSha = d.prevAsSha;
  render();
}

document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || drag) return;
  const el = e.target.closest('#hand-row [data-card-id]');
  if (!el || !ui?.pending || ui.pending.mode === 'guanxing') return;
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
    drag.prevAsSha = pend.asSha;
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
  if (e.button !== 0 || gxDrag || ui?.pending?.mode !== 'guanxing') return;
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
  if (commit && d.drop && ui?.pending?.mode === 'guanxing') {
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
    selectedHeroId = heroEl.dataset.hero;
    renderSetup(selectedHeroId);
    return;
  }

  // 横幅 / 选将 / 结算界面的按钮
  const btn = e.target.closest('[data-action]');
  if (btn) { onBannerAction(btn.dataset.action); return; }

  // 观星面板中的牌
  const gxCard = e.target.closest('#picker .gx-item');
  if (gxCard) { onGuanxingClick(gxCard.dataset.cardId); return; }

  // 对方头像（指定目标）
  if (e.target.closest('#opp-row .avatar')) { onOppAvatarClick(); return; }

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

// 启动：显示选将界面
renderSetup(selectedHeroId);
