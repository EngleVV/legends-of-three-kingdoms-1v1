// 军争篇玩家交互（jsdom 加载真实页面）：重铸、铁索连环多目标、酒+杀、濒死用酒自救、火攻、兵粮寸断
// 用法：node tests/ui-junzheng-check.js
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: pathToFileURL(process.cwd() + '/index.html') });
global.document = dom.window.document;
global.window = dom.window;

const { AIController } = await import('../src/ai/ai-controller.js');
AIController.prototype.wait = async () => {};
const { buildStandardDeck } = await import('../src/data/cards.js');
const { HEROES } = await import('../src/data/heroes.js');
await import('../src/ui/app.js');

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => el && el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const btn = n => $$('#banner [data-action], #picker [data-action]').find(b => b.dataset.action === n);
let fails = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}`);
  if (!cond) {
    fails++;
    const lines = $('#log').textContent.trim().split('\n');
    console.log('      最后战报：' + lines.slice(-4).join(' / '));
  }
};

// 开局：勾选军争篇牌堆，1v1 选曹操
click($('#setup [data-action="deck:junzheng"]'));
check(window.__sg === undefined, '尚未开局');
click($('#setup [data-action="mode:1v1"]'));
click($('#setup [data-hero="caocao"]'));
click($('#setup [data-action="start-game"]'));
await sleep(5);
const g = window.__sg();
const me = g.players[0];
const opp = g.players[1];
let synth = 700000;
const grab = (name, suit, rank) => {
  const pools = [g.deck.cards, g.deck.discardPile, ...g.players.map(p => p.hand)];
  for (const pool of pools) {
    const i = pool.findIndex(c => c.name === name && (!suit || c.suit === suit) && (rank == null || c.rank === rank));
    if (i >= 0) return pool.splice(i, 1)[0];
  }
  const c = buildStandardDeck(['standard', 'junzheng']).find(x => x.name === name && (!suit || x.suit === suit));
  return { ...c, id: ++synth };
};
const logs0 = () => g.logFn ? 0 : 0;
let logs = [];
const origLog = m => { logs.push(m); };
// 记录战报（game.logFn 已被 app 设为 push 到界面，这里包一层读取界面日志）
const logText = () => $('#log').textContent;
// 全桌牌数（守恒不变量）；断言须在「等待我方决策」的静止点做：结算瞬间牌可能已离手、尚未进入处理区
const totalCards = () => g.deck.cards.length + g.deck.discardPile.length + g.pendingDiscard.length
  + g.players.reduce((n, p) => n + p.hand.length + p.judgeZone.length + Object.values(p.equip).filter(Boolean).length, 0);

async function ensurePlay() {
  for (let i = 0; i < 6000; i++) {
    if ($('#overlay')) return false;
    const pend = window.__ui().pending;
    if (pend?.mode === 'play') {
      if (pend.skillId || pend.selected.length) { click(btn('cancel-skill')); await sleep(4); continue; }
      return true;
    }
    const pick = btn('confirm-pick');
    const any = btn('cancel') || btn('no') || btn('confirm-arrange')
      || $$('#picker [data-action]').find(b => /^(zone|wugu|option):/.test(b.dataset.action));
    if (pick && !pick.disabled) click(pick);
    else if (pick) click($('#hand-row .card.selectable:not(.selected)'));
    else if (btn('confirm-players') && !btn('confirm-players').disabled) click(btn('confirm-players'));
    else if (pend?.mode === 'pick-player') click($('.seat.targetable') || $('#self-row .avatar'));
    else if (any) click(any);
    else if (pend?.mode === 'respond') click(btn('cancel'));
    await sleep(4);
  }
  return false;
}

async function waitMode(mode, timeout = 8000) {
  for (let i = 0; i < timeout / 4; i++) {
    if (window.__ui().pending?.mode === mode) return true;
    await sleep(4);
  }
  return false;
}

const clearHands = () => {
  for (const p of g.players) {
    g.discardCards(p.hand.splice(0));
    g.discardCards(p.judgeZone.splice(0));
    for (const k of ['weapon', 'armor', 'horse+', 'horse-']) {
      const c = p.clearEquip(k);
      if (c) g.discardCards([c]);
    }
  }
  me.flags.shaUsed = 0; me.flags.skipPlay = false;
};
// 牌数守恒断言须在「等待我方决策」的静止点做：结算瞬间牌可能已离手、尚未进入处理区
const normalize = () => { me.maxHp = 4; me.hp = 4; opp.maxHp = 4; opp.hp = 4; opp.chained = false; me.chained = false; };

if (!await ensurePlay()) { console.log('无法进入出牌阶段'); process.exit(1); }
check(totalCards() === 160, `军争牌堆已加入（全桌 160 张，实际 ${totalCards()}）`);

// 1) 铁索连环：选中后出现「重铸」，点击后换一张牌
console.log('\n== 1) 铁索连环重铸 ==');
{
  await ensurePlay(); normalize(); clearHands();
  me.hand = [grab('tiesuo')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable'));
  await sleep(10);
  const rb = btn('recast');
  check(!!rb, '选中铁索连环后出现「重铸」按钮');
  const before = me.hand[0].id;
  click(rb);
  await sleep(30);
  check(me.hand.length === 1 && me.hand[0].id !== before, '重铸后换了一张牌');
  check(logText().includes('重铸'), '战报写明重铸');
  check(!logText().includes('失败'), '没有非法操作');
}

// 2) 铁索连环：点目标 → 确定 → 横置，头像出现连环徽章；再点一次解除
console.log('\n== 2) 铁索连环横置/重置 ==');
{
  await ensurePlay(); normalize(); clearHands();
  me.hand = [grab('tiesuo'), grab('tiesuo')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable'));
  await sleep(10);
  click($$('#opp-row .avatar, #opp-row .seat[data-seat]')[0] || $(`#opp-row [data-seat="${opp.seat}"]`));
  await sleep(10);
  check(window.__ui().pending.targets.length === 1, '点了对手目标');
  check(!!btn('confirm-target') && !btn('confirm-target').disabled, '选满下限后「确定」可用');
  click(btn('confirm-target'));
  await sleep(30);
  check(opp.chained, '对手被横置');
  check(!!$('#opp-row .state-badge.chained, #self-row ~ * .state-badge.chained') || !!$('.state-badge.chained'), '头像显示连环徽章');
  // 再用第二张解除
  await ensurePlay(); clearHands();
  me.hand = [grab('tiesuo')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable'));
  await sleep(10);
  click($(`#opp-row [data-seat="${opp.seat}"]`) || $('#opp-row .avatar'));
  await sleep(10);
  click(btn('confirm-target'));
  await sleep(30);
  check(!opp.chained, '再次铁索连环将其重置');
  check(!logText().includes('失败'), '没有非法操作');
}

// 3) 酒 + 杀：伤害 +1，头像出现「酒」徽章
console.log('\n== 3) 酒 + 杀 ==');
{
  await ensurePlay(); normalize(); clearHands();
  opp.hand = [];
  me.hand = [grab('jiu'), grab('sha')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable')); // 酒（第一张）
  await sleep(10);
  click(btn('confirm-play'));
  await sleep(30);
  check(me.flags.shaBonus === 1, '使用酒后下一张【杀】伤害 +1');
  check(!!$('.state-badge.drunk'), '头像显示酒徽章');
  await ensurePlay(); clearHands();
  me.hand = [grab('sha')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable'));
  await sleep(10);
  click($(`#opp-row [data-seat="${opp.seat}"]`) || $('#opp-row .avatar'));
  await sleep(10);
  click(btn('confirm-target'));
  await sleep(40);
  check(opp.hp === 2, '酒杀造成 2 点伤害');
  await ensurePlay();
}

// 4) 濒死时用【酒】自救
console.log('\n== 4) 濒死用酒自救 ==');
{
  await ensurePlay(); normalize(); clearHands();
  // 固定对手为吕布：没有摸牌阶段技能（裸衣/英姿/奇袭等），【杀】恰好 1 点伤害
  opp.hero = { ...HEROES.lvbu, lordSkills: [] };
  me.hand = [grab('jiu')];
  me.hp = 1;
  opp.hand = [grab('sha')];
  // 垫牌：对方回合只摸到两张【闪】，保证其只出一张【杀】
  g.deck.putOnTop([grab('shan', '♥'), grab('shan', '♥')]);
  g.notify();
  click(btn('end-play')); // 结束出牌，进入对方回合
  check(await waitMode('peach'), '对方杀后进入濒死求救');
  check($('#hand-row .card.selectable')?.dataset.cardId === String(me.hand[0].id), '【酒】可选作求救牌');
  check($('#banner').textContent.includes('【酒】'), '提示写明可用【酒】');
  // 可能被连续打至濒死：每次都用手里的【酒】自救
  let saved = false;
  for (let i = 0; i < 5 && me.hp <= 0; i++) {
    if (!window.__ui().pending || window.__ui().pending.mode !== 'peach') break;
    const sel = $('#hand-row .card.selectable');
    if (!sel) break;
    click(sel);
    await sleep(10);
    click(btn('confirm-peach'));
    await sleep(30);
    saved = saved || me.hp >= 1;
  }
  check(saved && !me.dead, '用【酒】自救成功');
  await ensurePlay();
}

// 5) 火攻：展示同花色手牌并弃置，造成火焰伤害
console.log('\n== 5) 火攻 ==');
{
  await ensurePlay(); normalize(); clearHands();
  const shown = grab('shan', '♥');
  opp.hand = [shown];
  me.hand = [grab('huogong'), grab('sha', '♥')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable')); // 火攻
  await sleep(10);
  click($(`#opp-row [data-seat="${opp.seat}"]`) || $('#opp-row .avatar'));
  await sleep(10);
  click(btn('confirm-target'));
  // 对方（AI）展示手牌后，进入弃置同花色手牌的选择
  check(await waitMode('pick-hand'), '进入弃同花色手牌的选择');
  const sel = $$('#hand-row .card.selectable');
  check(sel.length === 1 && sel[0].dataset.cardId === String(me.hand.find(c => c.suit === '♥' && c.name === 'sha').id), '只有同花色手牌可选');
  click(sel[0]);
  await sleep(10);
  click(btn('confirm-pick'));
  await sleep(40);
  check(opp.hp === 3, '火攻造成 1 点火焰伤害');
  check(logText().includes('火焰伤害'), '战报写明火焰伤害');
  await ensurePlay();
}

// 6) 兵粮寸断：对方跳过摸牌阶段
console.log('\n== 6) 兵粮寸断 ==');
{
  await ensurePlay(); normalize(); clearHands();
  const top = grab('sha', '♠'); // 非梅花 → 生效
  me.hand = [grab('bingliang')];
  g.notify(); await sleep(10);
  click($('#hand-row .card.selectable'));
  await sleep(10);
  click($(`#opp-row [data-seat="${opp.seat}"]`) || $('#opp-row .avatar'));
  await sleep(10);
  click(btn('confirm-target'));
  await sleep(30);
  check(opp.judgeZone.some(c => (c.delayedAs || c.name) === 'bingliang'), '兵粮寸断进入对方判定区');
  // 垫牌：判定牌 ♠（生效）+ 对方摸到的两张【闪】
  g.deck.putOnTop([top, grab('shan', '♥'), grab('shan', '♥')]);
  opp.hand = [];
  click(btn('end-play'));
  // 等对方回合结束回到我的出牌阶段
  await ensurePlay();
  check(logText().includes('跳过摸牌阶段'), '对方跳过摸牌阶段');
}

console.log(fails ? `\n结果：${fails} 项失败` : '\n结果：全部通过');
process.exit(fails ? 1 : 0);
