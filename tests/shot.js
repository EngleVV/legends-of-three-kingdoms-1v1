// UI 截图工具：自带静态服务，启动对局并截图，用于人工核对布局
// 用法：node tests/shot.js [输出前缀] [场景]
//   场景 play（默认，进入出牌阶段）| setup（选将界面）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// 自带静态服务：避免依赖外部 http server
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' ? 'index.html' : rel);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const URL_BASE = `http://127.0.0.1:${server.address().port}`;

const out = process.argv[2] || 'shot';
const scene = process.argv[3] || 'play';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
await page.goto(`${URL_BASE}/index.html`);

async function finish(code = 0) {
  await browser.close();
  server.close();
  process.exit(code);
}

if (scene === 'setup') {
  await page.click('#setup [data-hero="caocao"]');
  await page.screenshot({ path: `${out}-setup.png` });
  console.log(`已保存 ${out}-setup.png`);
  await finish();
}

// 去掉 AI 延迟，进对局
await page.click('#setup [data-hero="caocao"]');
await page.click('#setup [data-action="start-game"]');

// 等到轮到玩家操作
await page.waitForFunction(() => {
  const b = document.querySelector('#banner');
  return b && b.querySelector('[data-action]');
}, { timeout: 15000 }).catch(() => {});

// 布置一个信息丰富的局面，便于检查各区域渲染
await page.evaluate((scene) => {
  const g = window.__sg?.();
  if (!g) return;
  const grab = n => {
    const i = g.deck.cards.findIndex(c => c.name === n);
    return i >= 0 ? g.deck.cards.splice(i, 1)[0] : null;
  };
  const [me, opp] = g.players;
  me.equip.weapon = grab('qinglong');
  me.equip.armor = grab('bagua');
  me.equip['horse-'] = grab('ma-1');
  opp.equip.weapon = grab('zhangba');
  opp.equip['horse+'] = grab('ma+1');
  opp.judgeZone = [grab('le')].filter(Boolean);
  me.judgeZone = [grab('shandian')].filter(Boolean);
  me.hp = 3;
  opp.hp = 2;
  opp.hand = [grab('sha'), grab('shan'), grab('tao')].filter(Boolean);
  // 手牌覆盖全部 4 种牌类，便于核对牌面：基本 / 锦囊 / 延时锦囊 / 装备(武器)
  me.hand = ['sha', 'tao', 'wuzhong', 'nanman', 'le', 'shandian', 'guanshi', 'bagua']
    .map(grab).filter(Boolean);
  me.flags.shaUsed = 0;
  g.deck.discardPile.push(...['guohe', 'wanjian', 'shunshou'].map(grab).filter(Boolean));
  g.notify();
}, scene);

await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-${scene}.png` });
console.log(`已保存 ${out}-${scene}.png`);

// 额外截一张“已选中一张杀、待指定目标”的状态
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#hand-row .card.selectable')];
  const sha = cards.find(el => el.querySelector('.cname')?.textContent === '杀');
  (sha || cards[0])?.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-selected.png` });
console.log(`已保存 ${out}-selected.png`);

await finish();
