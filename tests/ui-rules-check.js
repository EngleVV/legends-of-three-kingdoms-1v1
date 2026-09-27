// 定向验证：用户反馈的出牌流程问题在真实 UI 上是否已修复
// 用法：node tests/ui-rules-check.js
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
const STD_DECK = buildStandardDeck();
await import('../src/ui/app.js');

const doc = document;
const $ = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];
const click = el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}`);
  if (!cond) fails++;
};

// 把对手归一化为「可被【杀】指定」的基线：有手牌（避免空城生效）、无防御马。
// 对手武将是随机的，不归一化会让距离/空城相关断言偶发误报。
function normalizeOpp(g) {
  const opp = g.players[1];
  opp.equip['horse+'] = null;
  if (opp.hand.length === 0) {
    const c = g.deck.cards.pop();
    if (c) opp.hand.push(c);
  }
}

// 等到「玩家的出牌阶段、且未进入技能子流程、且无残留选中」再断言。
// 对局是异步推进的，不等待会在引擎切换询问的间隙注入状态，导致偶发误报。
// 判定依据是 UI 的 pending 状态（而非横幅文案，文案会随改版变化）。
async function ensurePlayPhase() {
  // 预算要足够大：对手可能连续行动，玩家也可能被【乐不思蜀】跳过出牌阶段
  for (let i = 0; i < 3000; i++) {
    if ($('#overlay')) { console.log('（对局已结束，无法继续断言）'); return false; }
    const pend = window.__ui?.()?.pending;
    if (pend?.mode === 'play' && !pend.skillId) {
      if (!pend.selected.length) return true;
      const c = $$('#banner [data-action]').find(b => b.dataset.action === 'cancel-skill');
      if (c) { click(c); await sleep(6); continue; }
      return true;
    }
    // 推进其它询问，直到回到出牌阶段
    const actions = $$('#banner [data-action]');
    const find = n => actions.find(b => b.dataset.action === n);
    const unselected = $$('#hand-row .card.selectable:not(.selected)');
    // 五谷丰登/观星：横幅里是候选卡牌，没有按钮
    const bannerCards = $$('#banner [data-card-id].selectable');
    const pick = find('confirm-pick');
    if (pick) {
      // 需要先凑够张数才能确定（弃牌阶段等）
      if (!pick.disabled) click(pick);
      else if (unselected.length) click(unselected[0]);
      else if (find('cancel')) click(find('cancel'));
    } else if (find('confirm-guanxing')) {
      click(find('confirm-guanxing'));
    } else if (bannerCards.length) {
      click(bannerCards[0]);
    } else {
      const zone = actions.find(b => b.dataset.action.startsWith('zone:'));
      const simple = ['cancel', 'no'].map(find).find(b => b && !b.disabled);
      if (zone) click(zone);
      else if (simple) click(simple);
    }
    await sleep(6);
  }
  return false;
}

// 启动一局并等到玩家的出牌阶段。对局随机，偶尔会在拿到出牌阶段前就结束，
// 因此失败时重开一局重试而不是直接放弃。
async function startAndWaitPlayPhase(heroId, tries = 3) {
  for (let t = 0; t < tries; t++) {
    if ($('#overlay [data-action="restart"]')) {
      click($('#overlay [data-action="restart"]'));
      await sleep(10);
    }
    if ($('#setup').classList.contains('hidden')) {
      // 上一局仍在进行，无法重开，直接退出重试
      break;
    }
    click($(`#setup [data-hero="${heroId}"]`));
    await sleep(5);
    click($('#setup [data-action="start-game"]'));
    await sleep(5);
    if (await ensurePlayPhase()) return window.__sg?.();
    console.log(`（第 ${t + 1} 次未拿到出牌阶段，重开一局）`);
  }
  return null;
}

const g = await startAndWaitPlayPhase('caocao');
if (!g) { console.log('无法进入出牌阶段'); process.exit(1); }

const me = g.players[0];
const ui = { get pending() { return null; } };
const selectableNames = () => $$('#hand-row .card.selectable')
  .map(el => me.hand.find(c => c.id === Number(el.dataset.cardId))?.name);

console.log('\n== 1) 闪/无懈不能主动使用 ==');
await ensurePlayPhase();
normalizeOpp(g);
// 手动塞入闪与无懈（无丈八蛇矛）
// 取一张指定牌名的牌。牌堆里可能已经没有（被 AI 摸走/打出），
// 因此依次从牌堆、弃牌堆里取，都没有就按标准牌堆造一张（仅测试用，id 保证不冲突）。
let synthId = 900000;
const grab = name => {
  for (const pile of [g.deck.cards, g.deck.discardPile]) {
    const i = pile.findIndex(c => c.name === name);
    if (i >= 0) return pile.splice(i, 1)[0];
  }
  const proto = STD_DECK.find(c => c.name === name);
  return proto ? { ...proto, id: ++synthId } : null;
};
me.equip.weapon = null;
me.hand = [grab('shan'), grab('wuxie'), grab('sha')].filter(Boolean);
me.flags.shaUsed = 0;
g.notify();
await sleep(10);
let names = selectableNames();
check(!names.includes('shan'), `【闪】不可点选（当前可选: ${names.join(',') || '无'}）`);
check(!names.includes('wuxie'), '【无懈可击】不可点选');
check(names.includes('sha'), '【杀】可点选');

console.log('\n== 2) 一回合只能出一张杀 ==');
await ensurePlayPhase();
normalizeOpp(g);
me.flags.shaUsed = 1;
g.notify();
await sleep(10);
names = selectableNames();
check(!names.includes('sha'), `已出过杀后【杀】不可点选（当前可选: ${names.join(',') || '无'}）`);
check($('#banner').textContent.includes('还可出 0 张'), '横幅应提示剩余杀次数');

console.log('\n== 3) 咆哮/诸葛连弩不限次数 ==');
await ensurePlayPhase();
normalizeOpp(g);
me.equip.weapon = grab('zhugenu');
g.notify();
await sleep(10);
names = selectableNames();
check(names.includes('sha'), '装备诸葛连弩后【杀】恢复可点选');
check($('#banner').textContent.includes('不限次数'), '横幅应提示不限次数');
me.equip.weapon = null;
me.flags.shaUsed = 0;

console.log('\n== 4) 锦囊使用条件 ==');
await ensurePlayPhase();
normalizeOpp(g);
me.hp = me.maxHp;
me.hand = [grab('tao'), grab('wuzhong')].filter(Boolean);
g.notify();
await sleep(10);
names = selectableNames();
check(!names.includes('tao'), '体力满时【桃】不可点选');
check(names.includes('wuzhong'), '【无中生有】可点选');
me.hp = 1;
g.notify();
await sleep(10);
check(selectableNames().includes('tao'), '体力未满时【桃】可点选');

const le1 = grab('le'), le2 = grab('le');
g.players[1].judgeZone = [le1];
me.hand = [le2];
g.notify();
await sleep(10);
check(!selectableNames().includes('le'), '对方已有【乐不思蜀】时不可再用');
g.players[1].judgeZone = [];
g.notify();
await sleep(10);
check(selectableNames().includes('le'), '对方无【乐不思蜀】时可用');

console.log('\n== 5) 距离：对方 +1 马使杀超范围 ==');
await ensurePlayPhase();
normalizeOpp(g);
const horse = grab('ma+1');
g.players[1].equip['horse+'] = horse;
me.hand = [grab('sha'), grab('juedou')].filter(Boolean);
me.flags.shaUsed = 0;
g.notify();
await sleep(10);
names = selectableNames();
check(!names.includes('sha'), '对方 +1 马时【杀】不可点选');
check(names.includes('juedou'), '【决斗】不受距离限制，仍可点选');
check($('#banner').textContent.includes('攻击范围外'), '横幅应提示超出攻击范围');
g.players[1].equip['horse+'] = null;

console.log('\n== 6) 丈八蛇矛：闪可作为合成材料 ==');
await ensurePlayPhase();
normalizeOpp(g);
me.equip.weapon = grab('zhangba');
me.hand = [grab('shan'), grab('wuxie')].filter(Boolean);
me.flags.shaUsed = 0;
g.notify();
await sleep(10);
names = selectableNames();
check(names.includes('shan'), '装备丈八蛇矛后【闪】可作为材料点选');
// 选一张后应提示再选一张，而不是提供"确定"
const material = $$('#hand-row .card.selectable')[0];
if (material) {
  click(material);
  await sleep(10);
  check($('#banner').textContent.includes('再选一张'), '仅选一张材料时提示再选一张');
  check(!$$('#banner [data-action]').some(b => b.dataset.action === 'confirm-play'),
    '仅选一张【闪】时不应出现"确定"（避免白白弃牌）');
} else {
  check(false, '应有可点选的合成材料（前置断言已失败，跳过后续）');
}

console.log('\n== 7) 不可选的牌点了不能生效（防止冒充） ==');
await ensurePlayPhase();
normalizeOpp(g);
me.equip.weapon = null;
me.hand = [grab('sha'), grab('wuxie'), grab('tao')].filter(Boolean);
me.hp = me.maxHp;
me.flags.shaUsed = 0;
g.notify();
await sleep(10);
// 体力满时【桃】不可选，点它不应被选中
const taoEl = $$('#hand-row [data-card-id]').find(el =>
  me.hand.find(c => c.id === Number(el.dataset.cardId))?.name === 'tao');
check(!!taoEl && !taoEl.classList.contains('selectable'), '【桃】当前为不可选状态');
click(taoEl);
await sleep(10);
check($$('#hand-row .card.selected').length === 0, '点击不可选的【桃】不应被选中');
// 可选的【杀】仍可正常点选
const shaEl = $$('#hand-row .card.selectable')[0];
click(shaEl);
await sleep(10);
check($$('#hand-row .card.selected').length === 1, '可选的牌仍可正常点选');

console.log('\n== 8) 对手区 targetable 高亮随选牌切换 ==');
await ensurePlayPhase();
normalizeOpp(g);
// 先清掉上一节残留的选中状态
const clearBtn = $$('#banner [data-action]').find(b => b.dataset.action === 'cancel-skill');
if (clearBtn) { click(clearBtn); await sleep(10); }
me.equip.weapon = null;
me.hand = [grab('sha'), grab('wuzhong')].filter(Boolean);
me.hp = 2;
me.flags.shaUsed = 0;
g.players[1].equip['horse+'] = null;
g.notify();
await sleep(10);
check(!$('#opp-row').classList.contains('targetable'), '未选牌时对手区不高亮');
const shaCard = $$('#hand-row .card.selectable').find(el =>
  me.hand.find(c => c.id === Number(el.dataset.cardId))?.name === 'sha');
click(shaCard);
await sleep(10);
check($('#opp-row').classList.contains('targetable'), '选中【杀】后对手区高亮（指示可点头像）');
// 取消选择后应恢复
const cancelBtn = $$('#banner [data-action]').find(b => b.dataset.action === 'cancel-skill');
if (cancelBtn) click(cancelBtn);
await sleep(10);
check(!$('#opp-row').classList.contains('targetable'), '取消选择后高亮消失');

console.log('\n== 9) 制衡可弃置装备区的牌 ==');
await ensurePlayPhase();
normalizeOpp(g);
// 换成孙权才有制衡；直接给当前武将挂上技能以复用同一局
if (!me.hero.skills.includes('zhiheng')) me.hero = { ...me.hero, skills: [...me.hero.skills, 'zhiheng'] };
me.equip['horse+'] = grab('ma+1');
me.hand = [grab('sha')].filter(Boolean);
me.flags.zhihengUsed = false;
g.notify();
await sleep(10);
const zhBtn = $$('#banner [data-action]').find(b => b.dataset.action === 'skill-zhiheng');
check(!!zhBtn, '出牌阶段应有【制衡】按钮');
if (zhBtn) {
  click(zhBtn);
  await sleep(10);
  const equipSel = $$('#self-row .card.selectable');
  check(equipSel.length > 0, '制衡模式下自己的装备可点选');
  check($$('#hand-row .card.selectable').length > 0, '手牌同样可点选');
  // 点装备应被选中
  if (equipSel.length) {
    click(equipSel[0]);
    await sleep(10);
    check($$('#self-row .card.selected').length === 1, '点击装备后被选中');
    const ok = $$('#banner [data-action]').find(b => b.dataset.action === 'confirm-zhiheng');
    check(!!ok && !ok.disabled, '选中装备后「确定」可用');
  }
  const back = $$('#banner [data-action]').find(b => b.dataset.action === 'cancel-skill');
  if (back) { click(back); await sleep(10); }
}

console.log(`\n结果：${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exit(fails === 0 ? 0 : 1);
