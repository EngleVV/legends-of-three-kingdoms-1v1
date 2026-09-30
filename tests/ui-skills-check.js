// 新武将技能的玩家交互（jsdom 加载真实页面）：转化按钮、主动技能、选角色、选花色、急救
// 用法：node tests/ui-skills-check.js
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
const STD = buildStandardDeck();
await import('../src/ui/app.js');

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => el && el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const btn = n => $$('#banner [data-action], #picker [data-action]').find(b => b.dataset.action === n);
let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}`); if (!cond) fails++; };

async function ensurePlay() {
  for (let i = 0; i < 4000; i++) {
    if ($('#overlay')) return false;
    const pend = window.__ui?.()?.pending;
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
    await sleep(4);
  }
  return false;
}

// 1v1 选曹操开局；之后直接替换玩家的武将技能，复用同一局验证各技能交互
click($('#setup [data-action="mode:1v1"]'));
click($('#setup [data-hero="caocao"]'));
click($('#setup [data-action="start-game"]'));
await sleep(5);
if (!await ensurePlay()) { console.log('无法进入出牌阶段'); process.exit(1); }
const g = window.__sg();
const me = g.players[0];
const opp = g.players[1];
let synth = 700000;
const grab = pred => {
  const f = typeof pred === 'string' ? c => c.name === pred : pred;
  for (const pile of [g.deck.cards, g.deck.discardPile]) {
    const i = pile.findIndex(f);
    if (i >= 0) return pile.splice(i, 1)[0];
  }
  return { ...STD.find(f), id: ++synth };
};
const red = c => c.suit === '♥' || c.suit === '♦';
const asHero = id => { me.hero = { ...HEROES[id] }; me.name = HEROES[id].name; };
function reset() {
  for (const k of Object.keys(me.equip)) me.equip[k] = null;
  for (const k of Object.keys(opp.equip)) opp.equip[k] = null;
  me.judgeZone = []; opp.judgeZone = [];
  me.flags = { shaUsed: 0 };
  me.resetState('phase'); me.resetState('turn');
  me.hp = me.maxHp = 4;
  if (!opp.hand.length) opp.hand.push(grab('shan'));
}
const byName = n => $$('#hand-row [data-card-id]').find(el => me.hand.find(c => c.id === Number(el.dataset.cardId))?.name === n);

console.log('\n== 1) 奇袭：黑色牌可「当【过河拆桥】使用」 ==');
await ensurePlay(); reset(); asHero('ganning');
me.hand = [grab(c => c.name === 'shan' && !red(c)) || grab('shan')];
me.hand = [grab(c => c.name === 'sha' && !red(c))];
g.notify(); await sleep(10);
click(byName('sha')); await sleep(10);
check(!!btn('use-as:guohe'), '选中黑色【杀】后出现「当【过河拆桥】使用」按钮');
click(btn('use-as:guohe')); await sleep(10);
check($('#banner').textContent.includes('【奇袭】'), '提示栏写明【奇袭】将牌当【过河拆桥】');
check(!!btn('use-as:'), '可切回「按【杀】使用」');
click(btn('confirm-target')); await sleep(20);
check(window.__ui().pending?.mode === 'pick-zone' || g.lastAction?.card?.name === 'guohe', '确定后以【过河拆桥】结算');
if (window.__ui().pending?.mode === 'pick-zone') click($$('#picker [data-action^="zone:"]')[0]);
await sleep(20);

console.log('\n== 2) 龙胆：【闪】不可单独使用时自动当【杀】 ==');
await ensurePlay(); reset(); asHero('zhaoyun');
me.hand = [grab('shan')];
g.notify(); await sleep(10);
check(!!byName('shan')?.classList.contains('selectable'), '【闪】在出牌阶段可点选（龙胆当杀）');
click(byName('shan')); await sleep(10);
check($('#banner').textContent.includes('【龙胆】'), '提示栏写明【龙胆】当【杀】');
click(btn('cancel-skill')); await sleep(10);

console.log('\n== 3) 国色：装备区的方块牌可当【乐不思蜀】 ==');
await ensurePlay(); reset(); asHero('daqiao');
const zixing = grab(c => c.name === 'ma-1' && c.suit === '♦');
me.equip['horse-'] = zixing;
me.hand = [];
g.notify(); await sleep(10);
const eqEl = $(`#self-row [data-card-id="${zixing.id}"]`);
check(!!eqEl?.classList.contains('selectable'), '方块坐骑在装备区可点选');
click(eqEl); await sleep(10);
check($('#banner').textContent.includes('【国色】') && $('#banner').textContent.includes('乐不思蜀'), '提示栏：【国色】当【乐不思蜀】');
click(btn('confirm-target')); await sleep(20);
check(opp.judgeZone.some(c => c.id === zixing.id), '对方判定区出现该牌');
check(!!$('#opp-row .zone.judge .cname')?.textContent.includes('乐'), '判定区显示为【乐不思蜀】');

console.log('\n== 4) 苦肉：无目标主动技能按钮 → 确定 ==');
await ensurePlay(); reset(); asHero('huanggai');
me.hand = [];
g.notify(); await sleep(10);
check(!!btn('skill-kurou') && !btn('skill-kurou').disabled, '出牌阶段有【苦肉】按钮');
click(btn('skill-kurou')); await sleep(10);
check(!!btn('confirm-skill') && !btn('confirm-skill').disabled, '点按钮后可直接确定');
click(btn('confirm-skill')); await sleep(20);
check(me.hp === 3 && me.hand.length === 2, '失去 1 点体力并摸两张');

console.log('\n== 5) 青囊：选一张手牌 → 选自己为目标 → 确定；限一次 ==');
await ensurePlay(); reset(); asHero('huatuo');
me.hp = 2;
me.hand = [grab('shan')];
g.notify(); await sleep(10);
click(btn('skill-qingnang')); await sleep(10);
check(!$('#self-row').classList.contains('targetable'), '未选牌时不可选目标');
click($('#hand-row .card.selectable')); await sleep(10);
check($('#self-row').classList.contains('targetable'), '选牌后自己（已受伤）可选');
check(btn('confirm-target') && (window.__ui().pending.targets.length === 1) === !btn('confirm-target').disabled, '「确定」随目标是否选定而可用');
click($('#self-row .avatar')); await sleep(10);
click(btn('confirm-target')); await sleep(20);
check(me.hp === 3 && me.hand.length === 0, '回复 1 点并弃置该牌');
await ensurePlay();
check(btn('skill-qingnang')?.disabled, '本回合已用后按钮置灰');

console.log('\n== 6) 选角色（突袭）：点选武将 → 确定；可不发动 ==');
{
  const done = me.controller.askChoosePlayers(me, { reason: 'tuxi', candidates: [opp], min: 1, max: 2, optional: true });
  await sleep(10);
  check($('#banner').textContent.includes('【突袭】'), '提示栏显示【突袭】');
  check(btn('confirm-players')?.disabled && !!btn('cancel'), '未选时「确定」不可用，可「不发动」');
  click($('#opp-row .avatar')); await sleep(10);
  check($('#opp-row').classList.contains('picked'), '点击后对方被框选');
  click(btn('confirm-players'));
  const r = await done;
  check(r?.length === 1 && r[0] === opp, '返回所选角色');
}

console.log('\n== 7) 选花色（反间）：面板四种花色 ==');
{
  const options = [['♠', '黑桃'], ['♥', '红桃'], ['♣', '梅花'], ['♦', '方片']].map(([id, label]) => ({ id, label }));
  const done = me.controller.askChooseOption(me, { reason: 'fanjian', options, info: { source: opp } });
  await sleep(10);
  const suits = $$('#picker [data-action^="option:"]');
  check(suits.length === 4, '选牌面板显示四种花色');
  check($('#picker').textContent.includes('发动了【反间】'), '面板写明是反间');
  click(suits.find(b => b.dataset.action === 'option:♥'));
  check(await done === '♥', '返回所选花色');
}

console.log('\n== 8) 急救：他人回合濒死时，红色牌可当【桃】 ==');
{
  asHero('huatuo');
  const r = grab(c => c.name === 'shan' && red(c));
  me.hand = [r];
  const turn = g.currentTurnSeat;
  g.currentTurnSeat = opp.seat;
  const done = me.controller.askPeach(me, { dying: opp });
  await sleep(10);
  const el = $(`#hand-row [data-card-id="${r.id}"]`);
  check(!!el?.classList.contains('selectable'), '红色【闪】可点选');
  click(el); await sleep(10);
  check($('#banner').textContent.includes('【急救】'), '提示栏写明【急救】当【桃】');
  click(btn('confirm-peach'));
  check((await done)?.id === r.id, '返回该牌');
  g.currentTurnSeat = turn;
}

console.log('\n== 9) 选将界面：25 将按势力分组并显示技能说明 ==');
{
  const { renderSetup } = await import('../src/ui/render.js');
  const holder = document.createElement('div');
  holder.id = 'setup-test';
  renderSetup({ mode: '1v1', selectedId: 'zhouyu', identity: null });
  check($$('#setup [data-hero]').length === 25, '选将界面有 25 名武将');
  check($$('#setup .kingdom-row').length === 4, '按魏蜀吴群分四行');
  check($('#setup .hero-detail').textContent.includes('反间'), '下方显示所选武将的技能说明');
  document.getElementById('setup').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
}

console.log(`\n结果：${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exit(fails === 0 ? 0 : 1);
