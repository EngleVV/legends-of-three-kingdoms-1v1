// 流程动画（参考官方：卡牌飞行、摸牌滑入、目标指示线、伤害飘字、头像震动、回合横幅）
// 实现方式：全量重绘前抓取「卡牌按 id 的旧位置」，重绘后按前后帧差值做 FLIP 补间；
// 消失的卡生成幽灵飞向弃牌堆（或仁德交付对象），新出现的卡按区域播入场动画。
// 全部基于 WAAPI，不阻塞引擎；环境不支持（jsdom 测试）或系统设定减少动态效果时自动跳过。
const canAnim = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const reduced = canAnim && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ON = canAnim && !reduced;

const EASE = 'cubic-bezier(.2,.8,.3,1)';
const FLIGHT = 340;   // 卡牌跨区飞行
const GHOST = 420;    // 幽灵飞向弃牌堆
const ENTER = 240;    // 新牌入场
const SHAKE = 400;    // 头像受击震动
const FLOAT = 900;    // 飘字
const BANNER = 950;   // 回合横幅
const POINT = 1400;   // 目标指示线：伸出 → 停留 → 淡出

let pendingSnap = null; // 本次重绘前抓取的快照
let prev = null;        // 上一次重绘的快照（playFx 与其比较）
let lastPointSeq = 0;   // 已播放过的指示线序号

const fxLayer = () => document.getElementById('fx-layer');
const rectOf = el => el.getBoundingClientRect();
const zoneOf = el => el.closest('[data-zone]')?.dataset.zone || '';
const avatarOf = seat => document.querySelector(`#table .avatar[data-seat="${seat}"]`);
const pileRect = which => document.querySelector(`#deck-info .pile:${which}`)?.getBoundingClientRect();

// 卡牌是否真的发生位移（避免无意义动画）
function moved(a, b) {
  return Math.abs(a.left - b.left) > 3 || Math.abs(a.top - b.top) > 3;
}

// ---------- 快照：重绘前调用 ----------
export function snapshotFx(game) {
  if (!game || !ON) { pendingSnap = null; return; }
  const byId = new Map();
  for (const el of document.querySelectorAll('#table [data-card-id]')) {
    const id = el.dataset.cardId;
    if (!byId.has(id)) byId.set(id, []);
    // 同一 id 可能同时出现在牌面区与选牌面板，逐份记录，匹配时按区域优先消耗
    byId.get(id).push({
      zone: zoneOf(el), rect: rectOf(el), html: el.outerHTML,
    });
  }
  pendingSnap = {
    cards: byId,
    hp: game.players.map(p => p.hp),
    turn: game.currentTurnSeat,
    over: game.over,
  };
}

// ---------- 特效：重绘后调用 ----------
export function playFx(game) {
  if (!ON) return;
  const snap = pendingSnap;
  pendingSnap = null;
  if (!game || !snap) return;
  const before = prev;   // 上一次重绘的快照
  prev = snap;
  playPointFx(game);
  if (!before) return;   // 首帧无基准，只建基准不播特效
  playCardFx(game, before);
  playHpFx(game, before);
  playTurnFx(game, before);
}

// 卡牌：FLIP 位移 / 入场 / 消失幽灵
function playCardFx(game, before) {
  const old = before.cards;

  const newIds = new Set();
  for (const el of document.querySelectorAll('#table [data-card-id]')) {
    newIds.add(el.dataset.cardId);
  }

  for (const el of document.querySelectorAll('#table [data-card-id]')) {
    const id = el.dataset.cardId;
    const entries = old.get(id);
    const zone = zoneOf(el);
    const now = rectOf(el);
    if (!entries || !entries.length) {
      enterFx(el, zone, now);
      continue;
    }
    // 优先同区域，其次位置最接近的旧条目
    let best = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].zone === zone) { best = i; break; }
      if (Math.abs(entries[i].rect.left - now.left) < Math.abs(entries[best].rect.left - now.left)) best = i;
    }
    const [entry] = entries.splice(best, 1);
    // 手牌区与选牌面板不做真实位移补间（避免动画期间点击/拖拽命中漂移），瞬间就位；
    // 手牌↔场上的飞行由「场上牌从手牌旧位置飞来」这一侧呈现
    if ((zone === 'hand' || zone === 'pick') || !moved(entry.rect, now)) continue;
    // FLIP：先摆到旧位置，再补间回当前位（官方卡牌飞行手感）
    const dx = entry.rect.left - now.left;
    const dy = entry.rect.top - now.top;
    el.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'none' },
    ], { duration: FLIGHT, easing: EASE });
  }

  // 消失的卡：幽灵从旧位置飞向弃牌堆（仁德交付的牌飞向对方）。
  // id 在新帧仍存在的不算消失（如选牌面板关闭，牌面区还有同一张牌）。
  const give = game.lastGive;
  let ghosts = 0;
  for (const [id, entries] of old) {
    if (newIds.has(id)) continue;
    for (const entry of entries) {
      if (ghosts >= 6) break; // 防止极端场面幽灵风暴
      ghosts++;
      spawnGhost(entry, give && give.ids.includes(id) ? avatarRect(give.to) : pileRect('last-child'));
    }
  }
}

function avatarRect(seat) {
  const el = avatarOf(seat);
  return el ? rectOf(el) : pileRect('last-child');
}

function enterFx(el, zone, now) {
  if (zone === 'hand') {
    // 摸牌：官方手法——飞行的只是影子，真实牌立即在最终位置可交互。
    // 本体快速淡入，同时一张不拦截点击的幽灵从牌堆飞向落点。
    const from = pileRect('first-child');
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER, easing: 'ease-out' });
    if (!from) return;
    const clone = el.cloneNode(true);
    clone.removeAttribute('data-card-id');
    const ghost = document.createElement('div');
    ghost.className = 'fx-ghost';
    ghost.style.left = `${now.left}px`;
    ghost.style.top = `${now.top}px`;
    ghost.style.width = `${now.width}px`;
    ghost.style.height = `${now.height}px`;
    ghost.appendChild(clone);
    fxLayer().appendChild(ghost);
    ghost.animate([
      { transform: `translate(${from.left - now.left}px, ${from.top - now.top}px) scale(.6)`, opacity: .95 },
      { transform: 'none', opacity: 1 },
    ], { duration: FLIGHT, easing: EASE }).onfinish = () => ghost.remove();
  } else if (zone === 'pick') {
    // 选牌面板条目：纯淡入（拖拽/点选要求命中位置稳定，不做位移缩放）
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  } else {
    // 场上/装备/判定出现：官方式的轻微弹出
    el.animate([
      { transform: 'scale(.85)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: ENTER, easing: EASE });
  }
}

function spawnGhost(entry, target) {
  if (!target) return;
  const ghost = document.createElement('div');
  ghost.className = 'fx-ghost';
  ghost.style.left = `${entry.rect.left}px`;
  ghost.style.top = `${entry.rect.top}px`;
  ghost.style.width = `${entry.rect.width}px`;
  ghost.style.height = `${entry.rect.height}px`;
  ghost.innerHTML = entry.html;
  fxLayer().appendChild(ghost);
  const dx = (target.left + target.width / 2) - (entry.rect.left + entry.rect.width / 2);
  const dy = (target.top + target.height / 2) - (entry.rect.top + entry.rect.height / 2);
  ghost.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(.45)`, opacity: .15 },
  ], { duration: GHOST, easing: 'ease-in' }).onfinish = () => ghost.remove();
}

// 体力：伤害飘字 + 头像震动 / 回复飘字
function playHpFx(game, before) {
  game.players.forEach((p, i) => {
    const was = before.hp[i];
    if (was === undefined || p.hp === was) return;
    const avatar = avatarOf(p.seat);
    if (!avatar) return;
    const rect = rectOf(avatar);
    if (p.hp < was) {
      avatar.animate([
        { transform: 'none' },
        { transform: 'translate(-6px, 0) rotate(-2deg)' },
        { transform: 'translate(5px, -2px) rotate(2deg)' },
        { transform: 'translate(-3px, 1px)' },
        { transform: 'none' },
      ], { duration: SHAKE });
      spawnFloat(`-${was - p.hp}`, '#ff6b5a', rect);
    } else {
      spawnFloat(`+${p.hp - was}`, '#8fd18a', rect);
    }
  });
}

function spawnFloat(text, color, rect) {
  const el = document.createElement('div');
  el.className = 'fx-float';
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top - 6}px`;
  fxLayer().appendChild(el);
  el.animate([
    { transform: 'translate(-50%, 0) scale(.7)', opacity: 0 },
    { transform: 'translate(-50%, -22px) scale(1.15)', opacity: 1, offset: .25 },
    { transform: 'translate(-50%, -46px) scale(1)', opacity: 0 },
  ], { duration: FLOAT, easing: 'ease-out' }).onfinish = () => el.remove();
}

// 回合切换：中央横幅闪现
function playTurnFx(game, before) {
  if (game.over || before.over) return;
  if (before.turn === game.currentTurnSeat) return;
  const name = game.players[game.currentTurnSeat ?? 0]?.name;
  if (!name) return;
  const table = document.getElementById('table');
  const rect = rectOf(table);
  const el = document.createElement('div');
  el.className = 'fx-turn';
  el.textContent = `── ${name} 的回合 ──`;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height * 0.42}px`;
  fxLayer().appendChild(el);
  el.animate([
    { transform: 'translate(-50%, -50%) scale(.85)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .3 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .7 },
    { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 },
  ], { duration: BANNER, easing: 'ease-out' }).onfinish = () => el.remove();
}

// 目标指示线（官方：使用牌指定目标时，从使用者武将牌伸出一道指向目标的光箭，目标武将牌闪一圈）
function playPointFx(game) {
  const ind = game.indicator;
  if (!ind || ind.seq === lastPointSeq) return;
  lastPointSeq = ind.seq;
  const fromEl = avatarOf(ind.from);
  if (!fromEl) return;
  const a = rectOf(fromEl);
  for (const seat of ind.to) {
    const toEl = avatarOf(seat);
    if (!toEl) continue;
    const b = rectOf(toEl);
    spawnPointer(a, b);
    spawnTargetRing(b);
  }
}

// 构造一条从 a 指向 b 的光箭（起止点收进头像边缘，箭头停在目标头像外沿）
function makePointer(a, b) {
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2, by = b.top + b.height / 2;
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const inset = Math.min(a.height, b.height) * 0.5 + 6;
  const len = dist - inset * 2;
  if (len <= 10) return null;
  const ux = dx / dist, uy = dy / dist;
  const el = document.createElement('div');
  el.className = 'fx-pointer';
  el.style.left = `${ax + ux * inset}px`;
  el.style.top = `${ay + uy * inset}px`;
  el.style.width = `${len}px`;
  el.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)`;
  return el;
}

function spawnPointer(a, b) {
  const el = makePointer(a, b);
  if (!el) return;
  fxLayer().appendChild(el);
  // 从使用者一侧向目标伸出（clip-path 展开，箭头不被拉伸变形）
  el.animate([
    { clipPath: 'inset(0 100% 0 0)', opacity: 1, offset: 0 },
    { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.22 },
    { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.78 },
    { clipPath: 'inset(0 0 0 0)', opacity: 0, offset: 1 },
  ], { duration: POINT, easing: 'ease-out' }).onfinish = () => el.remove();
}

function spawnTargetRing(b) {
  const el = document.createElement('div');
  el.className = 'fx-target-ring';
  el.style.left = `${b.left - 4}px`;
  el.style.top = `${b.top - 4}px`;
  el.style.width = `${b.width + 8}px`;
  el.style.height = `${b.height + 8}px`;
  fxLayer().appendChild(el);
  el.animate([
    { opacity: 0, transform: 'scale(1.25)', offset: 0 },
    { opacity: 0, transform: 'scale(1.25)', offset: 0.18 },
    { opacity: 1, transform: 'scale(1)', offset: 0.32 },
    { opacity: 1, transform: 'scale(1)', offset: 0.78 },
    { opacity: 0, transform: 'scale(1)', offset: 1 },
  ], { duration: POINT, easing: 'ease-out' }).onfinish = () => el.remove();
}

// 选目标时的常驻指示线：从自己头像指向已选目标；借刀杀人另画「持武器者 → 其【杀】的目标」。
// 每次重绘后调用，先清除旧的再按当前选择重画；不依赖动画 API，减少动态效果设置下也显示。
export function showTargetPreview(fromSeat, targetSeats = [], victimSeat = null) {
  const layer = typeof document !== 'undefined' && fxLayer();
  if (!layer) return;
  for (const el of layer.querySelectorAll('.fx-pointer.preview, .fx-target-ring.preview')) el.remove();
  if (fromSeat == null) return;
  const link = (a, b) => {
    const ea = avatarOf(a), eb = avatarOf(b);
    if (!ea || !eb) return;
    const ra = rectOf(ea), rb = rectOf(eb);
    if (!rb.width) return; // 无布局（jsdom）
    if (a !== b) {
      const el = makePointer(ra, rb);
      if (el) { el.classList.add('preview'); layer.appendChild(el); }
    }
    spawnRingStatic(rb);
  };
  for (const t of targetSeats) link(fromSeat, t);
  if (victimSeat != null && targetSeats[0] != null) link(targetSeats[0], victimSeat);
}

function spawnRingStatic(b) {
  if (!b.width) return;
  const el = document.createElement('div');
  el.className = 'fx-target-ring preview';
  el.style.left = `${b.left - 4}px`;
  el.style.top = `${b.top - 4}px`;
  el.style.width = `${b.width + 8}px`;
  el.style.height = `${b.height + 8}px`;
  fxLayer().appendChild(el);
}
