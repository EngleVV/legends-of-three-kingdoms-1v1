// 诊断脚本：jsdom 加载真实 UI（index.html + app.js），自动点击连续跑多局
// 用法：node tests/ui-dom.js [局数] [1v1|identity]
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rounds = Number(process.argv[2] || 5);
const MODE = process.argv[3] || '1v1';

// 覆盖统计：日志中出现即记为已覆盖
const COVERAGE_KEYS = [
  '突袭', '裸衣', '天妒', '遗计', '刚烈', '倾国', '洛神', '龙胆', '铁骑', '集智', '奇袭',
  '苦肉', '英姿', '反间', '国色', '流离', '连营', '结姻', '枭姬', '急救', '青囊', '离间', '闭月',
  '仁德', '奸雄', '制衡', '观星', '空城', '反馈', '鬼才',
  '八卦阵', '雌雄双股剑', '贯石斧', '闪电', '借刀杀人',
  '南蛮入侵', '万箭齐发', '桃园结义', '五谷丰登', '无中生有',
  '丈八蛇矛',
  ...(MODE === 'identity' ? ['阵亡', '激将', '护驾'] : []),
];
const covered = new Set();
const anomalies = [];
function scanLog(text) {
  for (const k of COVERAGE_KEYS) if (text.includes(k)) covered.add(k);
  for (const bad of ['undefined', 'NaN', '无来源牌', '??']) {
    const i = text.indexOf(bad);
    if (i >= 0) anomalies.push(`${bad} ← …${text.slice(Math.max(0, i - 40), i + 40)}…`);
  }
}

const dom = new JSDOM(html, { url: pathToFileURL(process.cwd() + '/index.html') });
global.document = dom.window.document;
global.window = dom.window;
process.on('unhandledRejection', e => console.log('UNHANDLED REJECTION:', e));

// 去掉 AI 500ms 延迟，加速测试
const { AIController } = await import('../src/ai/ai-controller.js');
AIController.prototype.wait = async () => {};

await import('../src/ui/app.js');

const doc = document;
const $ = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];
const click = el => {
  clicks.push(el.dataset.action || el.dataset.cardId || el.className);
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
};
const clicks = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function playUntilOver(heroId) {
  // 身份局：切到身份局标签（每次重新发身份），从候选武将中选第一名
  if (MODE === 'identity') {
    click($('#setup [data-action="mode:identity"]'));
    await sleep(5);
    heroId = $('#setup [data-hero]').dataset.hero;
  }
  click($(`#setup [data-hero="${heroId}"]`));
  await sleep(5);
  click($('#setup [data-action="start-game"]'));
  await sleep(5);

  const t0 = Date.now();
  let idleCount = 0;
  while (Date.now() - t0 < 30000) {
    if ($('#overlay')) {
      scanLog($('#log').textContent);
      return { ok: true, ms: Date.now() - t0 };
    }

    const prompt = $('#banner .prompt')?.textContent || '';
    // 提示栏不应出现缺失上下文（undefined/null）、内部牌名（【sha】）或缺主语（「 对你使用了」）
    const bannerText = $('#banner').textContent;
    if (/undefined|null|NaN|【[a-z]|(^|[，。])\s*对你使用了/.test(bannerText)) anomalies.push(`提示栏：${bannerText.trim().slice(0, 80)}`);
    const actions = $$('#banner [data-action], #picker [data-action]');
    const hasAction = name => actions.some(b => b.dataset.action === name);
    const findAction = name => actions.find(b => b.dataset.action === name);
    const handSel = $$('#hand-row .card.selectable');
    const handUnselected = handSel.filter(c => !c.classList.contains('selected'));
    const bannerCards = $$('#picker .gx-item');
    let acted = false;

    // 出牌阶段已选中需要目标的牌 → 点头像
    // 出牌阶段选目标：目标已齐直接点「确定」，否则点一个可选目标（身份局点座位）
    if (!acted && hasAction('confirm-target') && !findAction('confirm-target').disabled) {
      click(findAction('confirm-target')); acted = true;
    }
    const seatEl = $('.seat.targetable') || $('#opp-row.targetable .avatar') || $('#self-row.targetable .avatar');
    if (!acted && seatEl) { click(seatEl); acted = true; }
    // 确认类：先选牌再确认
    if (!acted) {
      const name = ['confirm-respond', 'confirm-peach', 'confirm-nullify', 'confirm-pick', 'confirm-players', 'confirm-skill']
        .find(hasAction);
      if (name) {
        const btn = findAction(name);
        if (!btn.disabled) { click(btn); acted = true; }
        else if (handUnselected.length) { click(handUnselected[0]); acted = true; }
        else if ($('.seat.targetable') || $('#self-row.targetable .avatar') || $('#opp-row.targetable .avatar')) {
          click($('.seat.targetable') || $('#self-row.targetable .avatar') || $('#opp-row.targetable .avatar')); acted = true;
        }
        else if ($('#self-row .card.selectable:not(.selected)')) { click($('#self-row .card.selectable:not(.selected)')); acted = true; }
        else if (name === 'confirm-pick' && hasAction('cancel')) { click(findAction('cancel')); acted = true; }
      }
    }
    if (!acted && hasAction('confirm-arrange')) {
      // 先把第一张切到牌堆底，覆盖点击切换逻辑，再确定
      if (bannerCards.length && !$('#picker [data-gx-row="bottom"] .gx-item')) click(bannerCards[0]);
      else click(findAction('confirm-arrange'));
      acted = true;
    }
    if (!acted) {
      const zoneBtn = actions.find(b => /^(zone|wugu|option):/.test(b.dataset.action));
      if (zoneBtn) { click(zoneBtn); acted = true; }
    }
    if (!acted && hasAction('confirm-play')) { click(findAction('confirm-play')); acted = true; }
    if (!acted && hasAction('confirm-skill') && !findAction('confirm-skill').disabled) {
      click(findAction('confirm-skill')); acted = true;
    }
    if (!acted && handUnselected.length) { click(handUnselected[0]); acted = true; }
    if (!acted && bannerCards.length) { click(bannerCards[0]); acted = true; }
    if (!acted) {
      for (const name of ['end-play', 'cancel', 'cancel-skill', 'no']) {
        const btn = findAction(name);
        if (btn && !btn.disabled) { click(btn); acted = true; break; }
      }
    }

    if (acted) idleCount = 0;
    else {
      idleCount++;
      if (idleCount > 300) {
        const g = window.__sg?.();
        const st = g ? g.players.map(p => ({
          name: p.name, hp: p.hp,
          hand: p.hand.map(c => c && `${c.name || '??'}${c.id || ''}`),
          equip: Object.fromEntries(Object.entries(p.equip).map(([k, c]) => [k, c && `${c.name || '??'}#${c.id}`])),
          judge: p.judgeZone.map(c => c && c.name),
        })) : 'no game';
        return {
        ok: false,
        prompt: '无操作可点卡死，banner="' + $('#banner').textContent.slice(0, 80) + '"'
          + '\n  最近点击: ' + clicks.slice(-8).join(', ')
          + '\n  状态: ' + JSON.stringify(st)
          + '\n  对局日志尾: ' + [...$$('#log .log-line')].slice(-5).map(e => e.textContent).join(' | '),
      };
      }
      await sleep(10);
    }
  }
  return {
    ok: false,
    prompt: '30s 超时，banner="' + $('#banner').textContent.slice(0, 60) + '"'
      + '\n  最近点击: ' + clicks.slice(-12).join(', ')
      + '\n  对局日志尾: ' + [...$$('#log .log-line')].slice(-6).map(e => e.textContent).join(' | '),
  };
}

let pass = 0;
const { HERO_LIST } = await import('../src/data/heroes.js');
const heroes = HERO_LIST.map(h => h.id);
for (let i = 0; i < rounds; i++) {
  const r = await playUntilOver(heroes[i % heroes.length]);
  if (r.ok) { pass++; console.log(`局 ${i + 1} (${heroes[i % heroes.length]}): 完成 (${r.ms}ms)`); }
  else console.log(`局 ${i + 1} (${heroes[i % heroes.length]}): 卡住！banner="${r.prompt}"`);
  if (r.prompt?.includes('undefined') || r.prompt?.includes('NaN')) anomalies.push(r.prompt);
  // 点"再来一局"回到选将界面
  $('#overlay [data-action="restart"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(5);
}
console.log(`${pass}/${rounds} 完成`);
if (anomalies.length) {
  console.log(`\n异常 ${anomalies.length} 处：`);
  for (const a of [...new Set(anomalies)].slice(0, 10)) console.log('  ' + a);
}
console.log(`\n日志覆盖 ${covered.size}/${COVERAGE_KEYS.length}：${[...covered].join('、')}`);
console.log(`未覆盖：${COVERAGE_KEYS.filter(k => !covered.has(k)).join('、') || '（无）'}`);
process.exit(pass === rounds && anomalies.length === 0 ? 0 : 1);
