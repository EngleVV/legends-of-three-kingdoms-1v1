// 选牌面板端到端验证（真实浏览器）：顺手牵羊 / 过河拆桥 / 五谷丰登 / 观星
// 用法：node tests/ui-picker.js [截图前缀]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' || rel === '\\' ? 'index.html' : rel);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const shot = process.argv[2];

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
// 选诸葛亮以便测观星；AI 不出无懈（清掉其手牌中的无懈）
await page.click('#setup [data-hero="zhugeliang"]');
await page.click('#setup [data-action="start-game"]');

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const mode = () => page.evaluate(() => window.__ui?.()?.pending?.mode ?? null);

// 推进到指定询问；途中其他询问自动应付
async function waitMode(target, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const m = await mode();
    if (m === target) return;
    if (m && m !== 'play') {
      await page.evaluate(() => {
        const ui = window.__ui(); const p = ui.pending; const me = window.__sg().players[0];
        if (p.mode === 'pick-hand') ui._finish(me.hand.slice(0, p.opts.opts.count));
        else if (p.mode === 'guanxing') ui._finish({ top: p.gx.top, bottom: p.gx.bottom });
        else if (p.mode === 'pick-zone') ui._finish(['hand']);
        else if (p.mode === 'pick-wugu') ui._finish([p.opts.opts.info.candidates[0]]);
        else ui._finish(p.mode === 'invoke' ? false : null);
      });
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`等待 ${target} 超时（当前 ${await mode()}）`);
}

// 出牌阶段：布置局面后使用指定锦囊
async function useTrick(name, setup) {
  await waitMode('play');
  const id = await page.evaluate(([name, setup]) => {
    const g = window.__sg();
    const grab = n => {
      let i = g.deck.cards.findIndex(c => c.name === n);
      if (i >= 0) return g.deck.cards.splice(i, 1)[0];
      i = g.deck.discardPile.findIndex(c => c.name === n);
      return i >= 0 ? g.deck.discardPile.splice(i, 1)[0] : null;
    };
    const [me, opp] = g.players;
    // 双方都去掉无懈，避免打断
    for (const p of g.players) p.hand = p.hand.filter(c => c.name !== 'wuxie');
    const card = grab(name);
    me.hand = [card, grab('sha')];
    if (setup === 'rich') {
      opp.hand = [grab('shan'), grab('tao'), grab('sha')];
      // 按子类从牌堆取，避免某张指定装备恰好在别人手里
      const grabSub = st => {
        const i = g.deck.cards.findIndex(c => c.subType === st);
        return i >= 0 ? g.deck.cards.splice(i, 1)[0] : null;
      };
      opp.equip = { weapon: grabSub('weapon'), armor: grabSub('armor'), 'horse+': grabSub('horse+'), 'horse-': null };
      opp.judgeZone = [grab('le')];
      me.equip['horse-'] = grabSub('horse-');
    }
    g.notify();
    return card.id;
  }, [name, setup]);
  await page.click(`#hand-row [data-card-id="${id}"]`);
  const target = await page.locator('#opp-row.targetable').count();
  if (target) await page.click('#opp-row .avatar');
  else await page.click('#banner [data-action="confirm-play"]');
}

// ---------- 1. 过河拆桥：面板按区域展示，手牌背面、装备/判定正面 ----------
await useTrick('guohe', 'rich');
await waitMode('pick-zone');
check(await page.locator('#picker .picker-title').textContent() === '过河拆桥', '过河拆桥弹出选牌面板');
check(await page.locator('#picker .pick-label').allTextContents().then(t => t.join()) === '手牌区,装备区,判定区', '面板分为手牌区/装备区/判定区');
check(await page.locator('#picker .cardback.big').count() === 3, '对方 3 张手牌以背面展示');
check(await page.locator('#picker .pick-sec:nth-child(4) .card').count() === 3, '装备区展示 3 张装备正面');
if (shot) await page.screenshot({ path: `${shot}-guohe.png` });
await page.locator('#picker [data-action="zone:weapon"]').click();
await page.waitForTimeout(150);
check(await page.evaluate(() => !window.__sg().players[1].equip.weapon), '点击武器：对方武器被弃置');
check(await page.locator('#picker').isHidden(), '选择后面板关闭');

// ---------- 2. 顺手牵羊：点手牌背面随机获得一张 ----------
await useTrick('shunshou', 'rich');
await waitMode('pick-zone');
check(await page.locator('#picker .picker-title').textContent() === '顺手牵羊', '顺手牵羊弹出选牌面板');
const before = await page.evaluate(() => window.__sg().players[1].hand.length);
await page.locator('#picker [data-action="zone:hand"]').nth(1).click();
await page.waitForTimeout(150);
check(await page.evaluate(() => window.__sg().players[1].hand.length) === before - 1, '点手牌背面：获得对方一张手牌');

// ---------- 3. 五谷丰登：亮出面板，选走的牌标注获得者 ----------
await useTrick('wugu');
await waitMode('pick-wugu');
check(await page.locator('#picker .picker-title').textContent() === '五谷丰登', '五谷丰登弹出亮牌面板');
check(await page.locator('#picker .pick-item').count() === 2, '亮出牌数 = 存活角色数');
if (shot) await page.screenshot({ path: `${shot}-wugu.png` });
const takenId = await page.locator('#picker [data-action^="wugu:"]').first().getAttribute('data-action');
await page.locator('#picker [data-action^="wugu:"]').first().click();
await page.waitForTimeout(100);
check(await page.evaluate(id => window.__sg().players[0].hand.some(c => c.id === id), Number(takenId.slice(5))), '点击的牌进入自己手牌');

// ---------- 4. 观星：两行面板，点击切换 + 拖动排序 ----------
// 结束本回合，等下个回合准备阶段
await waitMode('play');
await page.click('#banner [data-action="end-play"]');
await waitMode('guanxing', 90000);
check(await page.locator('#picker .picker-title').textContent() === '观星', '观星弹出面板');
const topIds = () => page.evaluate(() => window.__ui().pending.gx.top.map(c => c.id));
const botIds = () => page.evaluate(() => window.__ui().pending.gx.bottom.map(c => c.id));
const init = await topIds();
check(init.length === 2 && (await botIds()).length === 0, '初始全部位于牌堆顶');
// 点击切换到牌堆底
await page.locator(`#picker .gx-item[data-card-id="${init[0]}"]`).click();
check((await botIds()).join() === String(init[0]), '点击牌：移到牌堆底');
// 拖回牌堆顶最左侧
const src = await page.locator(`#picker .gx-item[data-card-id="${init[0]}"]`).boundingBox();
const dst = await page.locator(`#picker .gx-item[data-card-id="${init[1]}"]`).boundingBox();
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
await page.mouse.move(src.x + 30, src.y - 20, { steps: 4 });
await page.mouse.move(dst.x + 8, dst.y + dst.height / 2, { steps: 8 });
check(await page.locator('#picker .gx-insert.before').count() === 1, '拖拽时显示插入位置');
if (shot) await page.screenshot({ path: `${shot}-guanxing.png` });
await page.mouse.up();
await page.waitForTimeout(100);
check((await topIds()).join() === [init[0], init[1]].join(), '拖到另一张之前：插入牌堆顶首位');
check((await botIds()).length === 0, '牌堆底已清空');
await page.click('#picker [data-action="confirm-guanxing"]');
await page.waitForTimeout(100);
// 摸牌阶段按顺序摸到这两张
const drew = await page.evaluate(ids => ids.every(id => window.__sg().players[0].hand.some(c => c.id === id)), init);
check(drew, '确定后：摸牌阶段摸到观星置顶的牌');

check(errors.length === 0, `无页面错误 ${errors.join('; ')}`);
await browser.close();
server.close();
console.log(failed ? `${failed} 项失败` : '全部通过');
process.exit(failed ? 1 : 0);
