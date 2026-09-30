// 身份局截图：选将界面 / 出牌阶段 / 选中【杀】并指定目标，用于人工核对 5 人布局
// 用法：node tests/shot-identity.js [输出前缀]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' || rel === '\\' ? 'index.html' : rel);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));

const out = process.argv[2] || 'shot';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);

await page.click('[data-action="mode:identity"]');
await page.click('#setup [data-hero]');
await page.screenshot({ path: `${out}-id-setup.png` });
await page.click('#setup [data-action="start-game"]');

// 推进到玩家的出牌阶段：其余询问一律取消/随便选
for (let i = 0; i < 900; i++) {
  const mode = await page.evaluate(() => {
    const ui = window.__ui?.(); const p = ui?.pending;
    if (!p) return window.__sg?.()?.over ? 'over' : null;
    if (p.mode === 'play') return 'play';
    const b = document.querySelector('[data-action="cancel"],[data-action="no"],[data-action="confirm-guanxing"],[data-action^="zone:"],[data-action^="wugu:"]');
    if (b) b.click();
    else if (p.mode === 'pick-hand') ui._finish(window.__sg().players[0].hand.slice(0, p.opts.opts.count));
    return p.mode;
  });
  if (mode === 'play' || mode === 'over') break;
  await page.waitForTimeout(100);
}

// 布置一个信息丰富的局面
await page.evaluate(() => {
  const g = window.__sg(); const me = g.players[0];
  const grab = n => { const i = g.deck.cards.findIndex(c => c.name === n); return i >= 0 ? g.deck.cards.splice(i, 1)[0] : null; };
  me.hand.push(...['sha', 'jiedao', 'shunshou'].map(grab).filter(Boolean));
  const o = g.others(me);
  if (o[0]) o[0].equip.weapon = grab('qinglong');
  if (o[1]) { o[1].equip['horse+'] = grab('ma+1'); o[1].judgeZone.push(grab('le')); }
  if (o[2]) o[2].equip.armor = grab('bagua');
  me.flags.shaUsed = 0;
  g.notify();
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-id-play.png` });

await page.locator('#hand-row .card.selectable', { has: page.locator('.cname', { hasText: /^杀$/ }) }).first().click();
await page.waitForTimeout(200);
const t = page.locator('.seat.targetable').first();
if (await t.count()) await t.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-id-target.png` });
console.log('提示栏：', (await page.locator('#banner').textContent()).replace(/\s+/g, ' ').trim());

// 借刀杀人两步：持武器者 → 其【杀】的目标
await page.click('[data-action="cancel-skill"]').catch(() => {});
await page.locator('#hand-row .card.selectable', { has: page.locator('.cname', { hasText: /^借刀杀人$/ }) }).first().click().catch(() => {});
await page.waitForTimeout(200);
const v = page.locator('.seat.targetable').first();
if (await v.count()) await v.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-id-jiedao.png` });

// 结算界面：让一名反贼阵亡再结束对局
await page.evaluate(async () => {
  const { killPlayer } = await import('/src/core/identity.js');
  const g = window.__sg();
  const others = g.players.filter(p => p.seat !== 0);
  const r = others.find(p => p.role === 'rebel');
  if (r) killPlayer(g, r, null);
  g.notify();
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-id-dead.png` });
await page.evaluate(async () => {
  const { killPlayer } = await import('/src/core/identity.js');
  const g = window.__sg();
  for (const p of g.players) if (!g.over && p.alive && (p.role === 'rebel' || p.role === 'renegade')) killPlayer(g, p, null);
  if (!g.over) killPlayer(g, g.lord, null);
  g.notify();
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-id-result.png` });
console.log(errs.length ? `页面错误：${errs.join(' | ')}` : '无页面错误');
await browser.close();
server.close();
process.exit(errs.length ? 1 : 0);
