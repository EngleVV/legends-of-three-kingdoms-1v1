// 军争篇：属性伤害、铁索连环、酒、火攻、兵粮寸断、新装备
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { Controller } from '../src/controller.js';
import { HEROES } from '../src/data/heroes.js';
import { buildStandardDeck, canUseCardAs, legalTargets } from '../src/data/cards.js';
import { buildStandardDeck as fullDeck } from '../src/data/cards.js';
import { resolveCardUse, validResponse, makeVirtual } from '../src/core/card-use.js';
import { runTurn } from '../src/core/turn.js';
import { applyDamage } from '../src/core/damage.js';
import { handleDying } from '../src/core/dying.js';
import { doJudge } from '../src/core/judge.js';
import { resolveSlash } from '../src/packs/standard/cards/basic.js';

// 牌堆辅助：从整副牌里取一张（不占用对局牌堆）
const ALL = buildStandardDeck(['standard', 'junzheng']);
const grab = (name, suit, rank) => {
  const c = ALL.find(x => x.name === name && (!suit || x.suit === suit) && (rank == null || x.rank === rank));
  assert.ok(c, `牌堆里没有 ${name} ${suit || ''}`);
  return { ...c, id: 100000 + Math.floor(Math.random() * 899999) };
};

function mk(heroA, heroB, ctrlA = new Controller(), ctrlB = new Controller(), decks) {
  const logs = [];
  const g = new Game({
    heroes: [HEROES[heroA], HEROES[heroB]], controllers: [ctrlA, ctrlB],
    logger: m => logs.push(m), ...(decks ? { decks } : {}),
  });
  return { g, logs };
}

test('军争牌堆：52 张，与标准版合计 160 张', () => {
  assert.strictEqual(buildStandardDeck(['junzheng']).length, 52);
  assert.strictEqual(buildStandardDeck(['standard', 'junzheng']).length, 160);
});

test('火杀/雷杀：牌类是【杀】，可当【杀】响应决斗且保留属性', () => {
  const { g } = mk('zhangfei', 'lvbu');
  const [zf, lb] = g.players;
  const hs = grab('huosha');
  zf.hand = [hs];
  assert.ok(canUseCardAs(zf, hs, 'sha', g), '火杀是【杀】');
  assert.ok(legalTargets(g, zf, hs).length > 0);
  const v = validResponse(zf, { card: hs }, 'sha', g);
  assert.strictEqual(v.name, 'huosha', '决斗中打出火杀保留属性');
});

test('酒：下一张【杀】伤害 +1，每回合限一次，濒死时可当【桃】自救', async () => {
  const { g } = mk('zhangfei', 'lvbu');
  const [zf, lb] = g.players;
  lb.hand = [];
  zf.hand = [grab('jiu'), grab('sha'), grab('jiu')];
  await resolveCardUse(g, zf, { card: zf.hand[0] });
  assert.strictEqual(zf.flags.shaBonus, 1);
  await resolveCardUse(g, zf, { card: zf.hand[0], targets: [lb] });
  assert.strictEqual(lb.hp, 2, '酒杀造成 2 点伤害');
  assert.strictEqual(zf.flags.shaBonus, 0);
  // 第二次使用被拒绝（每回合限一次）
  const jiu2 = zf.hand[0];
  const before = zf.hand.length;
  await resolveCardUse(g, zf, { card: jiu2 });
  assert.strictEqual(zf.hand.length, before, '本回合不能再使用【酒】');
  // 濒死自救
  zf.hand = [grab('jiu')];
  zf.hp = 0;
  const s = new (class extends Controller {
    async askPeach(p) { return p.hand[0]; }
  })();
  zf.controller = s;
  await handleDying(g, zf);
  assert.ok(zf.hp >= 1, '濒死时用【酒】回复体力');
});

test('他人濒死时不能用【酒】相救', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb, zf] = g.players;
  lb.hp = 0;
  zf.hand = [grab('jiu')]; // 只有酒，没有桃
  let asked = false;
  zf.controller = new (class extends Controller {
    async askPeach() { asked = true; return null; }
  })();
  await handleDying(g, lb);
  assert.ok(!asked, '不应该向只有【酒】的其他角色询问');
  assert.ok(lb.dead, '无人求救则阵亡');
});

test('铁索连环：横置/重置，属性伤害传导后双方重置，普通伤害不传导', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb, zf] = g.players;
  // 1v1 只有一名对手，用同一方的克隆场景直接设置三人不便，改用双人对传导的最小验证：
  // 铁索把两人都横置后，雷杀传导回自己（官方 1v1 语义允许）
  const ts = grab('tiesuo');
  lb.hand = [ts, grab('leisha')];
  await resolveCardUse(g, lb, { card: ts, targets: [lb, zf] });
  assert.ok(lb.chained && zf.chained, '一至两名目标被横置');
  await resolveSlash(g, lb, zf, makeVirtual(grab('leisha'), 'leisha'));
  assert.ok(!zf.chained && !lb.chained, '受到属性伤害后双方连环状态重置');
  assert.strictEqual(zf.hp, 3, '雷杀 1 点');
  assert.strictEqual(lb.hp, 3, '伤害传导 1 点');
  // 普通杀不传导
  lb.chained = zf.chained = true;
  lb.hand = [grab('sha')];
  await resolveSlash(g, lb, zf, lb.hand[0]);
  assert.ok(zf.chained && lb.chained, '普通【杀】不重置连环状态');
});

test('藤甲：普通【杀】与南蛮入侵无效，火焰伤害 +1，青釭剑无视', async () => {
  const { g } = mk('caocao', 'lvbu');
  const [cc, lb] = g.players;
  lb.equip.armor = grab('tengjia');
  cc.hand = [grab('sha')];
  await resolveSlash(g, cc, lb, cc.hand[0]);
  assert.strictEqual(lb.hp, 4, '普通【杀】对藤甲无效');
  cc.hand = [grab('huosha')];
  await resolveSlash(g, cc, lb, cc.hand[0]);
  assert.strictEqual(lb.hp, 2, '火杀 1 点 + 藤甲火焰 +1');
  // 青釭剑无视藤甲
  cc.equip.weapon = grab('qinggang');
  cc.hand = [grab('sha')];
  await resolveSlash(g, cc, lb, cc.hand[0]);
  assert.strictEqual(lb.hp, 1, '青釭剑后普通【杀】生效且不再有火焰加成');
});

test('白银狮子：大于 1 点的伤害减为 1，失去装备回复 1 点体力', async () => {
  const { g } = mk('simayi', 'lvbu');
  const [sm, lb] = g.players;
  sm.equip.armor = grab('baiyin');
  await applyDamage(g, lb, sm, 3, grab('leisha'), 'thunder');
  assert.strictEqual(sm.hp, 2, '3 点雷电伤害只扣 1 点');
  sm.hp = 1;
  sm.clearEquip('armor');
  g.deck.discard([]);
  await g.flushLoseTriggers();
  assert.strictEqual(sm.hp, 2, '失去白银狮子回复 1 点体力');
});

test('古锭刀：目标没有手牌时【杀】伤害 +1', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb, zf] = g.players;
  lb.equip.weapon = grab('gudingdao');
  zf.hand = [];
  await resolveSlash(g, lb, zf, grab('sha'));
  assert.strictEqual(zf.hp, 2);
  zf.hand = [grab('shan')];
  await resolveSlash(g, lb, zf, grab('sha'));
  assert.strictEqual(zf.hp, 1, '有手牌时不加成');
});

test('朱雀羽扇：普通【杀】当火杀，藤甲目标受到 2 点火焰伤害', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb, zf] = g.players;
  lb.equip.weapon = grab('zhuque');
  zf.equip.armor = grab('tengjia');
  const logs = [];
  g.logFn = m => logs.push(m);
  const shaReal = grab('sha');
  lb.hand = [shaReal];
  await resolveCardUse(g, lb, { card: makeVirtual(shaReal, 'huosha'), targets: [zf] });
  assert.strictEqual(zf.hp, 2, '1 点火焰伤害 + 藤甲 +1');
  assert.ok(logs.some(l => l.includes('火焰伤害')), '造成的是火焰伤害');
});

test('兵粮寸断：判定非梅花跳过摸牌阶段，突袭等摸牌阶段技能不再询问', async () => {
  const top = grab('shandian'); // 黑桃 A，非梅花
  const { g } = mk('zhangliao', 'lvbu');
  const [zl, lb] = g.players;
  const bl = grab('bingliang');
  lb.hand = [bl];
  await resolveCardUse(g, lb, { card: bl, targets: [zl] });
  assert.ok(zl.judgeZone.some(c => (c.delayedAs || c.name) === 'bingliang'));
  g.deck.putOnTop([top]);
  zl.hand = [];
  let drawPhaseAsked = false;
  zl.controller = new (class extends Controller {
    async askSkillInvoke(id) { if (id === 'tuxi') drawPhaseAsked = true; return false; }
  })();
  await runTurn(g, zl);
  assert.strictEqual(zl.hand.length, 0, '跳过摸牌阶段');
  assert.ok(!drawPhaseAsked, '跳过摸牌阶段时摸牌阶段技能不询问');
});

test('火攻：展示手牌后弃同花色手牌造成火焰伤害', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb, zf] = g.players;
  const shown = grab('sha', '♠');
  const spade = grab('sha', '♠', 7);
  zf.hand = [shown];
  lb.hand = [grab('huogong'), spade];
  lb.controller = new (class extends Controller {
    async askChooseCards(p, opts) {
      if (opts.info?.stage === 'discard') return [spade];
      return null;
    }
  })();
  const hg = lb.hand[0];
  await resolveCardUse(g, lb, { card: hg, targets: [zf] });
  assert.strictEqual(zf.hp, 3, '造成 1 点火焰伤害');
  assert.strictEqual(lb.hand.length, 0, '同花色手牌已弃置');
});

test('铁索连环重铸：置入弃牌堆并摸一张牌', async () => {
  const { g } = mk('lvbu', 'zhangfei');
  const [lb] = g.players;
  const ts = grab('tiesuo');
  lb.hand = [ts];
  await resolveCardUse(g, lb, { card: ts, recast: true });
  assert.strictEqual(lb.hand.length, 1);
  assert.ok(!lb.hand.some(c => c.id === ts.id), '铁索连环已重铸');
  assert.ok(g.deck.discardPile.some(c => c.id === ts.id));
});

test('骅骝：作为 +1 马加入军争牌堆', () => {
  assert.ok(ALL.some(c => c.name === 'ma+1' && c.suit === '♦' && c.rank === 13), '♦K 骅骝');
});

test('AI 对局（含军争牌堆）：牌数守恒 160 张，无缺失决策函数', async () => {
  const { AIController } = await import('../src/ai/ai-controller.js');
  const { HERO_LIST } = await import('../src/data/heroes.js');
  const { MISSING_AI } = await import('../src/core/registry.js');
  MISSING_AI.clear();
  for (let i = 0; i < 30; i++) {
    const hs = [...HERO_LIST].sort(() => Math.random() - 0.5).slice(0, i % 2 ? 5 : 2);
    const g = new Game({ heroes: hs, controllers: hs.map(() => new AIController()), decks: ['standard', 'junzheng'] });
    await g.run();
    const total = g.deck.cards.length + g.deck.discardPile.length + g.pendingDiscard.length
      + g.players.reduce((s, p) => s + p.allCards().length, 0);
    assert.strictEqual(total, 160, `牌数不守恒：${hs.map(h => h.id).join(',')}`);
  }
  assert.deepStrictEqual([...MISSING_AI], []);
});
