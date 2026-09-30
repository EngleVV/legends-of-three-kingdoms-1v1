// 拖拽出牌端到端验证（真实浏览器）：用法 node tests/ui-drag.js [截图前缀]
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
await page.click('#setup [data-hero="caocao"]');
await page.click('#setup [data-action="start-game"]');

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// 等到玩家出牌阶段（期间遇到其它询问一律取消/放弃）
async function waitPlay() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const mode = await page.evaluate(() => window.__ui?.()?.pending?.mode ?? null);
    if (mode === 'play') return;
    if (mode) {
      await page.evaluate(() => {
        const b = document.querySelector('#banner');
        const btn = b.querySelector('[data-action="cancel"],[data-action="no"],[data-action="confirm-arrange"],[data-action^="zone:"]')
          || b.querySelector('[data-card-id]');
        if (btn) { btn.click(); return; }
        // 弃牌阶段：选够张数
        const ui = window.__ui(); const p = ui.pending;
        if (p.mode === 'pick-hand') {
          const me = window.__sg().players[0];
          ui._finish(me.hand.slice(0, p.opts.opts.count));
        }
      });
    }
    await page.waitForTimeout(100);
  }
  throw new Error('等待出牌阶段超时');
}

// 布置手牌
async function setupHand(names, oppHp = 4) {
  await waitPlay();
  await page.evaluate(([names, oppHp]) => {
    const g = window.__sg();
    // 牌堆里可能恰好没有该牌（已被摸走/打出），依次从牌堆、弃牌堆取
    const grab = n => {
      for (const pile of [g.deck.cards, g.deck.discardPile]) {
        const i = pile.findIndex(c => c.name === n);
        if (i >= 0) return pile.splice(i, 1)[0];
      }
      return null;
    };
    const [me, opp] = g.players;
    me.hand = names.map(grab).filter(Boolean);
    me.flags.shaUsed = 0;
    me.equip.weapon = null; opp.equip.armor = null;
    // 对手随机：去掉 +1 马、保证有手牌（避免空城），确保【杀】可指定
    opp.equip['horse+'] = null;
    if (!opp.hand.length) { const c = g.deck.cards.pop(); if (c) opp.hand.push(c); }
    opp.hp = oppHp; opp.maxHp = Math.max(opp.maxHp, oppHp);
    g.notify();
  }, [names, oppHp]);
}

const cardBox = async name => {
  const el = page.locator('#hand-row .card', { has: page.locator('.cname', { hasText: new RegExp(`^${name}$`) }) }).first();
  return el.boundingBox();
};
async function dragTo(from, to, { hover } = {}) {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  if (hover) await hover();
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const center = async sel => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// 1. 拖【杀】到对方武将 → 使用【杀】指定对方
await setupHand(['sha', 'wuzhong', 'tao', 'shan']);
const lastUsed = () => page.evaluate(() => {
  const a = window.__sg().lastAction;
  return a ? `${a.card.name}#${a.card.id}>${(a.targets || []).map(t => t.seat).join(',')}` : '';
});
const logLen = lastUsed;
let before = await logLen();
await dragTo(await cardBox('杀'), await center('#opp-row .avatar'), {
  hover: async () => {
    check(await page.locator('#drag-ghost .card').count() === 1, '拖拽时出现跟随指针的牌影');
    check(await page.locator('#opp-row.drop-hover').count() === 1, '悬停对方武将时高亮目标');
    check(await page.locator('#hand-row .card.drag-origin').count() === 1, '原牌位置留下半透明空位');
    if (shot) await page.screenshot({ path: `${shot}-drag-sha.png` });
  },
});
await page.waitForTimeout(300);
let used = await lastUsed();
check(used !== before && used.startsWith('sha#') && used.endsWith('>1'), `松手于对方武将：【杀】指定对方 (${used})`);
check(await page.locator('#drag-ghost').count() === 0, '松手后牌影消失');

// 2. 拖【无中生有】到中央牌桌 → 直接使用
await waitPlay();
const handN = await page.locator('#hand-row .card').count();
before = await logLen();
await dragTo(await cardBox('无中生有'), await center('#field'));
await waitPlay();
used = await lastUsed();
check(used !== before && used.startsWith('wuzhong#'), `松手于牌桌：【无中生有】被使用 (${used})`);
check(await page.locator('#hand-row .card').count() === handN - 1 + 2, '无中生有结算后摸 2 张');

// 3. 拖回手牌区 → 取消，不出牌、不残留选中
before = await logLen();
const tao = await cardBox('桃');
await dragTo(tao, { x: tao.x + tao.width / 2 + 60, y: tao.y + tao.height / 2 });
check(await logLen() === before, '松手于手牌区：不出牌');
check(await page.evaluate(() => window.__ui().pending.selected.length) === 0, '取消拖拽后恢复为未选中');

// 4. 不可用的牌（【闪】）无法拖起
const shan = await cardBox('闪');
if (shan) {
  await dragTo(shan, await center('#field'), {
    hover: async () => check(await page.locator('#drag-ghost').count() === 0, '不可使用的【闪】无法拖起'),
  });
}

// 5. 点击出牌仍然可用
await setupHand(['sha', 'shan']);
await page.locator('#hand-row .card.selectable').first().click();
check(await page.evaluate(() => window.__ui().pending.selected.length) === 1, '点击选牌仍然有效');

check(errors.length === 0, `无页面错误 ${errors.join('; ')}`);
await browser.close();
server.close();
console.log(failed ? `${failed} 项失败` : '全部通过');
process.exit(failed ? 1 : 0);
