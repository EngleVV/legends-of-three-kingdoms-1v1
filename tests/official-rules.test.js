// 对照官方规则的定向测试：1v1 开局、伤害时机、新增装备（青釭/寒冰/仁王盾）、武器细节
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { Controller } from '../src/controller.js';
import { HEROES } from '../src/data/heroes.js';
import { buildStandardDeck } from '../src/data/cards.js';
import { makeVirtual, resolveCardUse, resolveSlash } from '../src/core/card-use.js';
import { applyDamage } from '../src/core/damage.js';

function mkGame(h1, h2, c1, c2, logger = () => {}) {
  return new Game({ heroes: [HEROES[h1], HEROES[h2]], controllers: [c1, c2], logger });
}
class Script extends Controller {
  constructor(o = {}) { super(); Object.assign(this, o); }
}
function drawOutBy(g, pred) {
  const i = g.deck.cards.findIndex(pred);
  if (i < 0) throw new Error('牌堆中找不到符合条件的牌');
  return g.deck.cards.splice(i, 1)[0];
}
const drawOut = (g, name) => drawOutBy(g, c => c.name === name);
const black = c => c.suit === '♠' || c.suit === '♣';
const red = c => c.suit === '♥' || c.suit === '♦';

// ---------- 牌堆 ----------
test('牌堆：官方标准版 + EX 共 108 张，四种花色各 27 张', () => {
  const d = buildStandardDeck();
  assert.strictEqual(d.length, 108);
  for (const s of ['♠', '♥', '♣', '♦']) assert.strictEqual(d.filter(c => c.suit === s).length, 27, s);
  for (const n of ['qinggang', 'hanbing', 'renwang']) assert.ok(d.some(c => c.name === n), n);
  assert.strictEqual(d.filter(c => c.name === 'zhugenu').length, 2);
});

// ---------- 1v1 开局 ----------
test('开局：起始手牌 = 体力上限，先手首回合只摸 1 张', async () => {
  const logs = [];
  const g = mkGame('zhugeliang', 'caocao', new Script(), new Script(), m => logs.push(m));
  g.turnCount = 500; // 只跑一个回合
  await g.run();
  assert.ok(logs.includes('诸葛亮 摸 3 张牌'), '诸葛亮体力上限 3，起始 3 张');
  assert.ok(logs.includes('曹操 摸 4 张牌'), '曹操体力上限 4，起始 4 张');
  const first = logs.findIndex(m => m.startsWith('────'));
  const draws = logs.slice(first).filter(m => / 摸 \d 张牌$/.test(m));
  assert.match(draws[0], / 摸 1 张牌$/, '先手首回合摸 1 张');
});

// ---------- 伤害时机 ----------
test('伤害时机：濒死结算先于反馈，反馈拿到的桃不能用于本次自救', async () => {
  let fankuiAsked = 0;
  const g = mkGame('simayi', 'caocao',
    new Script({
      async askSkillInvoke(p, id) { if (id === 'fankui') fankuiAsked++; return true; },
      async askChooseCards() { return ['hand']; },
      async askPeach(p) { return p.hand.find(c => c.name === 'tao') || null; },
    }),
    new Script());
  g.registerHeroHooks();
  const [sy, cc] = g.players;
  sy.hp = 1; sy.hand = [];
  cc.hand = [drawOut(g, 'tao')];
  await applyDamage(g, cc, sy, 1, drawOut(g, 'sha'));
  assert.ok(g.over, '司马懿无桃应阵亡');
  assert.strictEqual(fankuiAsked, 0, '阵亡后不应触发反馈');
});

test('奸雄：可获得【南蛮入侵】', async () => {
  const g = mkGame('sunquan', 'caocao',
    new Script(),
    new Script({ async askSkillInvoke(p, id) { return id === 'jianxiong'; } }));
  g.registerHeroHooks();
  const [sq, cc] = g.players;
  const nm = drawOut(g, 'nanman');
  sq.hand = [nm]; cc.hand = [];
  await resolveCardUse(g, sq, { card: nm, targets: [] });
  assert.strictEqual(cc.hp, 3);
  assert.ok(cc.hand.some(c => c.id === nm.id), '曹操应获得南蛮入侵');
  assert.ok(!g.deck.discardPile.some(c => c.id === nm.id), '不应同时在弃牌堆');
});

test('桃园结义：体力满的角色跳过结算（不询问无懈）', async () => {
  let asks = 0;
  const g = mkGame('liubei', 'caocao',
    new Script({ async askNullify() { asks++; return null; } }), new Script());
  g.registerHeroHooks();
  const [lb, cc] = g.players;
  const ty = drawOut(g, 'taoyuan');
  lb.hand = [ty, drawOut(g, 'wuxie')];
  cc.hp = 2;
  await resolveCardUse(g, lb, { card: ty, targets: [] });
  assert.strictEqual(cc.hp, 3);
  assert.strictEqual(asks, 1, '只对受伤的曹操询问一次');
});

// ---------- 防具 ----------
test('仁王盾：黑色【杀】无效，红色【杀】有效；青釭剑无视仁王盾', async () => {
  const g = mkGame('zhangfei', 'caocao', new Script(), new Script());
  g.registerHeroHooks();
  const [zf, cc] = g.players;
  cc.equip.armor = drawOut(g, 'renwang');
  cc.hand = [];
  await resolveSlash(g, zf, cc, makeVirtual(drawOutBy(g, c => c.name === 'sha' && black(c)), 'sha'));
  assert.strictEqual(cc.hp, 4, '黑杀对仁王盾无效');
  await resolveSlash(g, zf, cc, makeVirtual(drawOutBy(g, c => c.name === 'sha' && red(c)), 'sha'));
  assert.strictEqual(cc.hp, 3, '红杀照常命中');
  zf.equip.weapon = drawOut(g, 'qinggang');
  await resolveSlash(g, zf, cc, makeVirtual(drawOutBy(g, c => c.name === 'sha' && black(c)), 'sha'));
  assert.strictEqual(cc.hp, 2, '青釭剑无视防具');
});

test('青釭剑：无视八卦阵（不询问八卦阵）', async () => {
  let asked = 0;
  const g = mkGame('zhangfei', 'caocao', new Script(),
    new Script({ async askSkillInvoke(p, id) { if (id === 'bagua') asked++; return true; } }));
  g.registerHeroHooks();
  const [zf, cc] = g.players;
  zf.equip.weapon = drawOut(g, 'qinggang');
  cc.equip.armor = drawOut(g, 'bagua');
  cc.hand = [];
  await resolveSlash(g, zf, cc, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(asked, 0);
  assert.strictEqual(cc.hp, 3);
});

// ---------- 武器 ----------
test('寒冰剑：防止伤害，改为弃置对方两张牌', async () => {
  const g = mkGame('zhangfei', 'sunquan',
    new Script({ async askSkillInvoke(p, id) { return id === 'hanbing'; },
      async askChooseCards() { return ['hand']; } }),
    new Script());
  g.registerHeroHooks();
  const [zf, sq] = g.players;
  zf.equip.weapon = drawOut(g, 'hanbing');
  sq.hand = [drawOut(g, 'tao'), drawOut(g, 'wuzhong')];
  await resolveSlash(g, zf, sq, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(sq.hp, 4, '伤害被防止');
  assert.strictEqual(sq.hand.length, 0, '两张牌被弃置');
});

test('青龙偃月刀：被闪后可连续追杀', async () => {
  const g = mkGame('zhangfei', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [zf, sq] = g.players;
  zf.equip.weapon = drawOut(g, 'qinglong');
  zf.hand = [drawOut(g, 'sha'), drawOut(g, 'sha')];
  sq.hand = [drawOut(g, 'shan'), drawOut(g, 'shan'), drawOut(g, 'shan')];
  await resolveSlash(g, zf, sq, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(zf.hand.length, 0, '两张杀都用于追杀');
  assert.strictEqual(sq.hand.length, 0, '对方打出三张闪');
  assert.strictEqual(sq.hp, 4);
});

test('贯石斧：可弃置装备区的牌强制命中，但不能弃置贯石斧本身', async () => {
  let pick = null;
  const g = mkGame('zhangfei', 'sunquan',
    new Script({ async askChooseCards(p, o) { return o.reason === 'guanshi' ? pick : null; } }),
    new AIController());
  g.registerHeroHooks();
  const [zf, sq] = g.players;
  const axe = drawOut(g, 'guanshi');
  const horse = drawOut(g, 'ma-1');
  const h = drawOut(g, 'tao');
  zf.equip.weapon = axe; zf.equip['horse-'] = horse; zf.hand = [h];
  sq.hand = [drawOut(g, 'shan'), drawOut(g, 'shan')];
  pick = [h, axe];
  await resolveSlash(g, zf, sq, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(sq.hp, 4, '含贯石斧本身的选择应被拒绝');
  assert.strictEqual(zf.equip.weapon, axe);
  pick = [h, horse];
  await resolveSlash(g, zf, sq, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(sq.hp, 3, '弃手牌 + 坐骑强制命中');
  assert.strictEqual(zf.equip['horse-'], null);
  assert.strictEqual(zf.hand.length, 0);
});

// ---------- 武圣 ----------
test('武圣：装备区的红色牌可当【杀】使用，按失去该装备后的距离判定', async () => {
  const g = mkGame('guanyu', 'sunquan', new Script(), new Script());
  g.registerHeroHooks();
  const [gy, sq] = g.players;
  const redHorse = drawOutBy(g, c => c.name === 'ma-1' && red(c));
  gy.equip['horse-'] = redHorse; gy.hand = []; gy.flags = { shaUsed: 0 };
  sq.hand = [];
  // 对方 +1 马：有 -1 马时距离 1，但把 -1 马当【杀】后距离变 2，超出攻击范围
  sq.equip['horse+'] = drawOut(g, 'ma+1');
  await resolveCardUse(g, gy, { card: makeVirtual(redHorse, 'sha'), targets: [sq] });
  assert.strictEqual(gy.equip['horse-'], redHorse, '距离不足应拒绝');
  sq.equip['horse+'] = null;
  await resolveCardUse(g, gy, { card: makeVirtual(redHorse, 'sha'), targets: [sq] });
  assert.strictEqual(sq.hp, 3);
  assert.strictEqual(gy.equip['horse-'], null);
  assert.strictEqual(gy.flags.shaUsed, 1);
});
