// 身份局 UI 定向验证（jsdom 加载真实页面）：选目标流程、身份徽章
// 用法：node tests/ui-identity-check.js
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: pathToFileURL(process.cwd() + '/index.html') });
global.document = dom.window.document;
global.window = dom.window;

const { AIController } = await import('../src/ai/ai-controller.js');
const { buildStandardDeck } = await import('../src/data/cards.js');
const STD = buildStandardDeck();
AIController.prototype.wait = async () => {};
await import('../src/ui/app.js');

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const btn = n => $$('#banner [data-action], #picker [data-action]').find(b => b.dataset.action === n);
let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}`); if (!cond) fails++; };

// 推进到玩家的出牌阶段（其余询问一律取消/随便选）
async function ensurePlay() {
  for (let i = 0; i < 4000; i++) {
    if ($('#overlay')) return false;
    const pend = window.__ui?.()?.pending;
    if (pend?.mode === 'play') {
      if (pend.skillId || pend.selected.length) { const c = btn('cancel-skill'); if (c) click(c); await sleep(4); continue; }
      return true;
    }
    const pick = btn('confirm-pick');
    const any = btn('cancel') || btn('no') || btn('confirm-guanxing')
      || $$('#picker [data-action]').find(b => /^(zone|wugu):/.test(b.dataset.action));
    if (pick && !pick.disabled) click(pick);
    else if (pick) { const c = $('#hand-row .card.selectable:not(.selected)'); if (c) click(c); }
    else if (any) click(any);
    await sleep(4);
  }
  return false;
}

async function start() {
  for (let t = 0; t < 5; t++) {
    $('#overlay [data-action="restart"]') && click($('#overlay [data-action="restart"]'));
    await sleep(5);
    click($('#setup [data-action="mode:identity"]'));
    await sleep(5);
    click($('#setup [data-hero]'));
    click($('#setup [data-action="start-game"]'));
    await sleep(5);
    if (await ensurePlay()) return window.__sg();
  }
  return null;
}

const g = await start();
if (!g) { console.log('无法进入出牌阶段'); process.exit(1); }
const me = g.players[0];
let synth = 800000;
const grab = n => {
  for (const pile of [g.deck.cards, g.deck.discardPile]) {
    const i = pile.findIndex(c => c.name === n);
    if (i >= 0) return pile.splice(i, 1)[0];
  }
  // 都被摸走/装备着时按标准牌堆合成一张（仅测试用，id 不冲突）
  return { ...STD.find(c => c.name === n), id: ++synth };
};
// 归一化：所有人存活、无马无武器、有手牌（避免空城），便于断言距离
function normalize() {
  for (const p of g.players) {
    if (!p.alive) continue;
    for (const k of ['weapon', 'horse+', 'horse-']) {
      if (p.equip[k]) g.deck.discard([p.equip[k]]);
      p.equip[k] = null;
    }
    if (!p.hand.length) p.hand.push(g.deck.cards.pop());
  }
  me.flags.shaUsed = 0;
}
const seatEl = seat => $(`.seat[data-seat="${seat}"]`);
const alive = g.others(me);

console.log('\n== 1) 身份徽章 ==');
check(!!$('#self-row .role-badge') && !$('#self-row .role-badge').classList.contains('r-unknown'), '自己的身份明示');
const lordSeat = g.lord.seat;
if (lordSeat !== 0) check(!seatEl(lordSeat).querySelector('.role-badge.r-unknown'), '主公身份明示');
const hidden = alive.filter(p => !p.roleRevealed);
check(hidden.every(p => seatEl(p.seat).querySelector('.role-badge.r-unknown')), '其他未阵亡角色显示「?」');
check($$('#opp-row .seat.mini').length === 4, '顶部显示 4 个座位');

console.log('\n== 2) 【杀】：只有攻击范围内的角色可选，点选后「确定」出牌 ==');
await ensurePlay();
normalize();
me.hand = [grab('sha')];
g.notify(); await sleep(10);
click($('#hand-row .card.selectable'));
await sleep(10);
const inRange = g.others(me).filter(p => (Math.abs(p.seat - me.seat) === 1 || Math.abs(p.seat - me.seat) === 4));
const tgtSeats = $$('.seat.targetable').map(el => Number(el.dataset.seat)).sort();
check(JSON.stringify(tgtSeats) === JSON.stringify(inRange.map(p => p.seat).sort()), `可选目标为相邻两人（${tgtSeats}）`);
const far = g.others(me).find(p => !inRange.includes(p));
check(seatEl(far.seat).classList.contains('untargetable'), '攻击范围外的角色置暗');
check(btn('confirm-target')?.disabled, '未选目标时「确定」不可用');
click(seatEl(far.seat)); await sleep(10);
check(!window.__ui().pending.targets.length, '点击范围外的角色无效');
const tgt = inRange[0];
click(seatEl(tgt.seat)); await sleep(10);
check(seatEl(tgt.seat).classList.contains('picked'), '点击后目标被框选');
check(btn('confirm-target') && !btn('confirm-target').disabled, '选中目标后「确定」可用');
check($('#banner').textContent.includes(`→ ${tgt.name}`), '提示栏写明「【杀】 → 目标」');
click(inRange[1] ? seatEl(inRange[1].seat) : seatEl(tgt.seat)); await sleep(10);
if (inRange[1]) check(window.__ui().pending.targets[0].seat === inRange[1].seat, '点击另一名可选角色即改选');
const seq0 = g.indicator?.seq || 0;
const want = (inRange[1] || tgt).seat;
click(btn('confirm-target')); await sleep(30);
// 结算中八卦阵判定会改写 lastAction，这里用指示线记录判断出牌目标
check(g.indicator?.seq > seq0 && g.indicator.from === me.seat && g.indicator.to.includes(want)
  && !me.hand.some(c => c.name === 'sha'), '确定后对所选目标使用【杀】');

console.log('\n== 3) 借刀杀人：先选持武器者，再选其【杀】的目标 ==');
await ensurePlay();
normalize();
const holder = g.others(me)[1];
holder.equip.weapon = grab('qinglong');
me.hand = [grab('jiedao')];
g.notify(); await sleep(10);
click($('#hand-row .card.selectable')); await sleep(10);
// 只有一名角色装备武器 → 第一目标自动选中，直接进入第二步
check(window.__ui().pending.targets[0]?.seat === holder.seat && seatEl(holder.seat).classList.contains('picked'),
  '唯一装备武器的角色被自动选为第一目标');
check($('#banner').textContent.includes('使用【杀】的目标'), '第二步提示选择【杀】的目标');
const victims = $$('.seat.targetable, #self-row.targetable').map(el => Number(el.dataset.seat));
check(victims.length > 0 && !victims.includes(holder.seat), `可选的【杀】目标不含持武器者本人（${victims}）`);
check(btn('confirm-target')?.disabled || victims.length === 1, '未选第二目标时「确定」不可用');
const v = victims.find(s => s !== me.seat) ?? victims[0];
click(v === me.seat ? $('#self-row .avatar') : seatEl(v)); await sleep(10);
check(window.__ui().pending.victim?.seat === v, '选中第二目标');
check(!btn('confirm-target').disabled, '两个目标齐备后「确定」可用');
click(btn('confirm-target')); await sleep(40);
check(g.lastAction?.card?.name === 'jiedao' || me.hand.every(c => c.name !== 'jiedao'), '借刀杀人已使用');

console.log('\n== 4) 仁德：选牌后选择交给哪名角色 ==');
await ensurePlay();
normalize();
if (!me.hero.skills.includes('rende')) me.hero = { ...me.hero, skills: [...me.hero.skills, 'rende'] };
me.hand = [grab('shan'), grab('shan')];
g.notify(); await sleep(10);
click(btn('skill-rende')); await sleep(10);
check($$('.seat.targetable').length === 0, '未选牌时不可选角色');
click($('#hand-row .card.selectable')); await sleep(10);
check($$('.seat.targetable').length === g.others(me).length, '选牌后所有其他角色可选');
const to = g.others(me)[2];
click(seatEl(to.seat)); await sleep(10);
const before = to.hand.length;
click(btn('confirm-target')); await sleep(30);
check(to.hand.length === before + 1, `交给了所选的 ${to.name}`);

console.log(`\n结果：${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exit(fails === 0 ? 0 : 1);
