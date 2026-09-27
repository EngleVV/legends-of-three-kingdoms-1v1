// 应用入口：选将 → 对局循环 → 事件分发
import { Game } from '../core/game.js';
import { UIController } from './ui-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { HEROES, HERO_LIST } from '../data/heroes.js';
import { canUseInPlayPhase, canUseAsSha } from '../data/cards.js';
import { makeVirtual } from '../core/card-use.js';
import { renderGame, renderSetup, renderResult } from './render.js';

let ui = null;
let game = null;
let logs = [];
let selectedHeroId = null;

// ---------- 日志 ----------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logHtml(msg) {
  let cls = 'log-line';
  if (msg.startsWith('────')) cls += ' turn';
  else if (msg.includes('发动')) cls += ' skill';
  else if (msg.includes('伤害') || msg.includes('使用【杀】') || msg.includes('命中') || msg.includes('阵亡')) cls += ' damage';
  return `<div class="${cls}">${escapeHtml(msg)}</div>`;
}

// ---------- 渲染 ----------
function render() {
  if (!game) return;
  // 已选中的牌可能因引擎改动而失效（如被弃置/交给对方）。
  // 渲染前剔除，避免横幅与「可指定目标」高亮基于已不存在的牌，误导玩家。
  // 制衡可选装备区的牌，故判定范围为「手牌 + 装备区」。
  // 注意只清理 selected：观星用 seq、五谷用横幅直传，它们的牌本就不在手牌里。
  const pend = ui?.pending;
  if (pend && pend.selected.length) {
    const me = game.players[0];
    const held = id => me.hand.some(h => h.id === id)
      || Object.values(me.equip).some(e => e && e.id === id);
    pend.selected = pend.selected.filter(c => held(c.id));
    if (!pend.selected.length) pend.asSha = false;
  }
  renderGame(game, ui, logs);
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
    case 'confirm-guanxing': {
      // 点选的置于牌堆顶（点击顺序即摸牌顺序），未点选的沉入牌堆底
      const rest = pend.opts.cards.filter(c => !pend.seq.some(s => s.id === c.id));
      finish({ top: [...pend.seq], bottom: rest });
      break;
    }
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
  if (pend.mode === 'guanxing') { ui.toggleGuanxing(card); render(); return; }
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

function onBannerCardClick(cardId) {
  const pend = ui?.pending;
  if (!pend) return;
  if (pend.mode === 'guanxing') {
    const card = pend.opts.cards.find(c => c.id === Number(cardId));
    if (card) { ui.toggleGuanxing(card); render(); }
    return;
  }
  if (pend.mode === 'pick-wugu') {
    const card = pend.opts.opts.info.candidates.find(c => c.id === Number(cardId));
    if (card) finish([card]);
  }
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

document.addEventListener('click', e => {
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

  // 横幅中的卡牌（五谷/观星）
  const bannerCard = e.target.closest('#banner [data-card-id]');
  if (bannerCard) { onBannerCardClick(bannerCard.dataset.cardId); return; }

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
