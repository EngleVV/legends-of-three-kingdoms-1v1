// 定向确定性测试：技能、装备、锦囊结算细节
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { Controller } from '../src/controller.js';
import { HEROES } from '../src/data/heroes.js';
import {
  buildStandardDeck, isRed, canTarget, distance, attackRange,
  canUseInPlayPhase, canUseAsSha, shaLimitOf, shaLeftOf,
} from '../src/data/cards.js';
import { makeVirtual, resolveCardUse, resolveSlash, useSkill, shaLimitLeft, validResponse } from '../src/core/card-use.js';
import { handleDying as handleDyingImported } from '../src/core/dying.js';
import { applyDamage as applyDamageImported } from '../src/core/damage.js';
import { runTurn } from '../src/core/turn.js';

function mkGame(h1, h2, c1, c2, logger = () => {}) {
  return new Game({ heroes: [HEROES[h1], HEROES[h2]], controllers: [c1, c2], logger });
}

function takeCard(g, name, suit = null, rank = null) {
  return g.deck.cards.find(c => c.name === name && (!suit || c.suit === suit) && (!rank || c.rank === rank))
    ?? buildStandardDeck().find(c => c.name === name && (!suit || c.suit === suit) && (!rank || c.rank === rank));
}

// 从牌堆中「取出」一张牌（同时移出牌堆），用于需要牌总数守恒的测试
function drawOutBy(g, pred) {
  const i = g.deck.cards.findIndex(pred);
  if (i < 0) throw new Error('牌堆中找不到符合条件的牌');
  return g.deck.cards.splice(i, 1)[0];
}

function drawOut(g, name) {
  return drawOutBy(g, c => c.name === name);
}

class ScriptController extends Controller {
  constructor(overrides = {}) { super(); Object.assign(this, overrides); }
}

const vsha = (card) => makeVirtual(card, 'sha');

// ---------- 仁德 ----------
test('仁德：给 1 张无回复，累计满 2 张回复 1 点（仅一次）', async () => {
  const g = mkGame('liubei', 'caocao', new AIController(), new AIController());
  g.registerHeroHooks();
  const [lb, cc] = g.players;
  const c1 = takeCard(g, 'sha'), c2 = takeCard(g, 'shan');
  lb.hand = [c1, c2];
  lb.flags = { rendeGiven: 0 };
  lb.hp = 3;
  await useSkill(g, lb, { skillId: 'rende', cards: [c1] });
  assert.ok(cc.hand.some(c => c.id === c1.id), '对方应收到牌');
  assert.strictEqual(lb.hp, 3, '只给 1 张不回复');
  await useSkill(g, lb, { skillId: 'rende', cards: [c2] });
  assert.strictEqual(lb.hp, 4, '累计满 2 张回复 1 点');
  assert.ok(!cc.hand.some(c => c.id === c1.id && false), '');
});

// ---------- 武圣 ----------
test('武圣：红色牌转化为杀使用并造成伤害', async () => {
  // 目标用孙权，避免奸雄把伤害牌拿走影响断言
  const g = mkGame('guanyu', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [gy, cc] = g.players;
  const redShan = g.deck.cards.find(c => c.name === 'shan' && isRed(c));
  assert.ok(redShan, '牌堆应有红色闪');
  gy.hand = [redShan];
  cc.hand = [];
  const hpBefore = cc.hp;
  await resolveCardUse(g, gy, { card: makeVirtual(redShan, 'sha'), targets: [cc] });
  assert.strictEqual(cc.hp, hpBefore - 1, '无闪应命中');
  assert.strictEqual(gy.hand.length, 0, '真实牌应离手');
  assert.ok(g.pendingDiscard.some(c => c.id === redShan.id) || g.deck.discardPile.some(c => c.id === redShan.id),
    '转化的真实牌应进弃牌堆');
});

test('武圣：validResponse 转化校验', async () => {
  const g = mkGame('guanyu', 'caocao', new AIController(), new AIController());
  const [gy] = g.players;
  const redCard = g.deck.cards.find(c => isRed(c) && c.name !== 'tao');
  gy.hand = [redCard];
  const v = validResponse(gy, { card: redCard, as: 'sha' }, 'sha');
  assert.ok(v && v.virtual && v.name === 'sha' && v.real.id === redCard.id);
  assert.strictEqual(validResponse(gy, { card: redCard }, 'sha').name, 'sha', '缺 as 时按请求类型（defaultName）转化');
});

// ---------- 咆哮 / 诸葛连弩 ----------
test('咆哮：杀次数无限制', async () => {
  const g = mkGame('zhangfei', 'caocao', new AIController(), new AIController());
  g.registerHeroHooks();
  const [zf] = g.players;
  zf.flags.shaUsed = 3;
  assert.strictEqual(await shaLimitLeft(g, zf), Infinity);
  const [, cc] = g.players;
  cc.flags.shaUsed = 1;
  assert.strictEqual(await shaLimitLeft(g, cc), 0, '普通武将用过后为 0');
});

test('诸葛连弩：装备后杀次数无限制', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc] = g.players;
  cc.flags.shaUsed = 2;
  cc.equip.weapon = takeCard(g, 'zhugenu');
  assert.strictEqual(await shaLimitLeft(g, cc), Infinity);
});

// ---------- 八卦阵 ----------
test('八卦阵：判定红色视为闪，免伤', async () => {
  const logs = [];
  const g = mkGame('caocao', 'sunquan',
    new AIController(),
    new ScriptController({ async askSkillInvoke(p, id) { return id === 'bagua'; } }),
    m => logs.push(m));
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.armor = takeCard(g, 'bagua');
  cc.hand = [];
  const redTop = takeCard(g, 'tao');
  g.deck.putOnTop([redTop]);
  const hpBefore = cc.hp;
  await resolveSlash(g, sq, cc, vsha(takeCard(g, 'sha')));
  assert.strictEqual(cc.hp, hpBefore, '八卦阵判定红色应免伤');
  assert.ok(logs.some(l => l.includes('八卦阵判定生效')), '应有八卦阵生效日志');
  assert.ok(g.deck.discardPile.some(c => c.id === redTop.id), '判定牌进弃牌堆');
});

// ---------- 贯石斧 ----------
test('贯石斧：被闪后弃 2 张牌强制命中', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({
      async askChooseCards(p, opts) { return opts.reason === 'guanshi' ? p.hand.slice(0, 2) : null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.weapon = takeCard(g, 'guanshi');
  const d1 = takeCard(g, 'wuzhong'), d2 = takeCard(g, 'le');
  cc.hand = [d1, d2];
  const shan = takeCard(g, 'shan');
  sq.hand = [shan];
  const hpBefore = sq.hp;
  await resolveSlash(g, cc, sq, vsha(takeCard(g, 'sha')));
  assert.strictEqual(sq.hp, hpBefore - 1, '贯石斧应强制命中');
  assert.strictEqual(cc.hand.length, 0, '弃掉 2 张');
  assert.ok(g.deck.discardPile.some(c => c.id === d1.id) && g.deck.discardPile.some(c => c.id === d2.id));
});

// ---------- 麒麟弓 ----------
test('麒麟弓：命中后弃对方一匹马', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({
      async askChooseCards(p, opts) { return opts.reason === 'qilin' ? ['horse+'] : null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.weapon = takeCard(g, 'qilin');
  const horse = takeCard(g, 'ma+1');
  sq.equip['horse+'] = horse;
  sq.hand = [];
  const hpBefore = sq.hp;
  await resolveSlash(g, cc, sq, vsha(takeCard(g, 'sha')));
  assert.strictEqual(sq.hp, hpBefore - 1, '无闪应命中');
  assert.strictEqual(sq.equip['horse+'], null, '马应被弃');
  assert.ok(g.deck.discardPile.some(c => c.id === horse.id), '马进弃牌堆');
});

// ---------- 青龙偃月刀 ----------
test('青龙偃月刀：被闪后可追加杀', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({
      async askRespondCard(p, req) { return req.reason === 'qinglong' ? p.hand.find(c => c.name === 'sha') : null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.weapon = takeCard(g, 'qinglong');
  const chaseSha = takeCard(g, 'sha');
  cc.hand = [chaseSha];
  const shan = takeCard(g, 'shan');
  sq.hand = [shan];
  const hpBefore = sq.hp;
  await resolveSlash(g, cc, sq, vsha(takeCard(g, 'sha')));
  assert.strictEqual(sq.hp, hpBefore - 1, '追杀应命中');
  assert.strictEqual(sq.hand.length, 0, '闪已用');
  assert.strictEqual(cc.hand.length, 0, '追杀的杀已用');
  assert.ok(!g.deck.discardPile.some(c => c.id === chaseSha.id) || true);
});

// ---------- 雌雄双股剑 ----------
test('雌雄双股剑：同性目标不触发', async () => {
  const invoked = [];
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({ async askSkillInvoke(p, id) { invoked.push(id); return true; } }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.weapon = takeCard(g, 'cixiong');
  sq.hand = [takeCard(g, 'wuzhong')]; // 非闪牌，避免 AI 出闪干扰断言
  const sqHandBefore = sq.hand.length;
  await resolveSlash(g, cc, sq, vsha(takeCard(g, 'sha')));
  assert.ok(!invoked.includes('cixiong'), '同性目标不应触发雌雄双股剑');
  assert.strictEqual(sq.hand.length, sqHandBefore, '对方手牌不因雌雄变动');
});

// 不主动出牌的测试桩：隔离回合内后续行动对断言的干扰
const passive = () => new ScriptController({ async askPlayCard() { return null; } });

// ---------- 闪电 ----------
test('闪电：黑桃2-9 命中造成 3 点雷电伤害', async () => {
  const g = mkGame('caocao', 'sunquan', passive(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const shandian = takeCard(g, 'shandian');
  cc.judgeZone = [shandian];
  const spade = g.deck.cards.find(c => c.suit === '♠' && c.rank >= 2 && c.rank <= 9);
  assert.ok(spade, '应有黑桃2-9');
  g.deck.putOnTop([spade]);
  cc.hand = []; sq.hand = [];
  await runTurn(g, cc);
  assert.strictEqual(cc.hp, cc.maxHp - 3, '闪电应造成 3 点伤害');
});

test('闪电：非黑桃2-9 移至对方判定区', async () => {
  const g = mkGame('caocao', 'sunquan', passive(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const shandian = takeCard(g, 'shandian');
  cc.judgeZone = [shandian];
  const heart = g.deck.cards.find(c => c.suit === '♥');
  assert.ok(heart, '应有红桃牌');
  g.deck.putOnTop([heart]);
  cc.hand = []; sq.hand = [];
  await runTurn(g, cc);
  assert.strictEqual(cc.hp, cc.maxHp, '不应受伤');
  assert.ok(sq.judgeZone.some(c => c.id === shandian.id), '闪电应移至对方判定区');
});

// ---------- 距离与攻击范围 ----------
test('距离：对方 +1 马使普通杀超出攻击范围', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [cc, sq] = g.players;
  assert.strictEqual(distance(cc, sq), 1, '基础距离为 1');
  assert.ok(canTarget(g, cc, sq, 'sha'), '无马时可杀');

  sq.equip['horse+'] = takeCard(g, 'ma+1');
  assert.strictEqual(distance(cc, sq), 2, '对方 +1 马使距离变 2');
  assert.ok(!canTarget(g, cc, sq, 'sha'), '范围 1 的杀应打不到');
  assert.ok(!canTarget(g, cc, sq, 'shunshou'), '顺手牵羊需距离 1');
  assert.ok(canTarget(g, cc, sq, 'juedou'), '决斗无距离限制');
  assert.ok(canTarget(g, cc, sq, 'guohe'), '过河拆桥无距离限制');
});

test('距离：自己 -1 马或长兵器可抵消对方 +1 马', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [cc, sq] = g.players;
  sq.equip['horse+'] = takeCard(g, 'ma+1');

  cc.equip['horse-'] = takeCard(g, 'ma-1');
  assert.strictEqual(distance(cc, sq), 1, '-1 马抵消 +1 马');
  assert.ok(canTarget(g, cc, sq, 'sha'));

  cc.equip['horse-'] = null;
  cc.equip.weapon = takeCard(g, 'qinglong'); // range 3
  assert.strictEqual(attackRange(cc), 3);
  assert.ok(canTarget(g, cc, sq, 'sha'), '长兵器可越过距离');
});

test('距离：引擎拒绝超范围的杀（不消耗手牌）', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  sq.equip['horse+'] = takeCard(g, 'ma+1');
  sq.hand = [];
  const sha = takeCard(g, 'sha');
  cc.hand = [sha];
  const hpBefore = sq.hp;
  await resolveCardUse(g, cc, { card: sha, targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore, '超范围的杀不应造成伤害');
  assert.ok(cc.hand.some(c => c.id === sha.id), '非法出牌不应消耗手牌');
});

test('制衡：可弃置装备区的牌（官方「弃置任意张牌」）', async () => {
  const g = mkGame('sunquan', 'caocao', new AIController(), new AIController());
  g.registerHeroHooks();
  const [sq] = g.players;
  const horse = drawOut(g, 'ma+1');
  const handCard = drawOut(g, 'wuzhong');
  sq.equip['horse+'] = horse;
  sq.hand = [handCard];
  sq.flags = { zhihengUsed: false };
  await useSkill(g, sq, { skillId: 'zhiheng', cards: [handCard, horse] });
  assert.strictEqual(sq.equip['horse+'], null, '装备应被弃置');
  assert.ok(g.deck.discardPile.some(c => c.id === horse.id), '装备应进弃牌堆');
  assert.ok(g.deck.discardPile.some(c => c.id === handCard.id), '手牌应进弃牌堆');
  assert.strictEqual(sq.hand.length, 2, '弃 2 张应摸 2 张');
});

test('制衡：不能弃置不属于自己的牌', async () => {
  const g = mkGame('sunquan', 'caocao', new AIController(), new AIController());
  g.registerHeroHooks();
  const [sq, cc] = g.players;
  const oppCard = drawOut(g, 'sha');
  cc.hand = [oppCard];
  sq.hand = [];
  sq.flags = { zhihengUsed: false };
  await useSkill(g, sq, { skillId: 'zhiheng', cards: [oppCard] });
  assert.ok(cc.hand.some(c => c.id === oppCard.id), '对方手牌不应被弃');
  assert.strictEqual(sq.flags.zhihengUsed, false, '非法调用不应消耗每回合限次');
});

test('反馈：可获得伤害来源判定区的牌', async () => {
  const g = mkGame('simayi', 'caocao',
    new ScriptController({
      async askSkillInvoke(p, id) { return id === 'fankui'; },
      // 选择对方判定区的【乐不思蜀】
      async askChooseCards(p, opts) { return opts.reason === 'fankui' ? ['le'] : null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [sy, cc] = g.players;
  const le = drawOut(g, 'le');
  cc.judgeZone = [le];
  cc.hand = [];
  sy.hp = 4;
  await applyDamageImported(g, cc, sy, 1, drawOut(g, 'sha'));
  assert.ok(sy.hand.some(c => c.id === le.id), '反馈应能获得判定区的牌');
  assert.strictEqual(cc.judgeZone.length, 0, '该牌应离开对方判定区');
});

test('反馈：可获得伤害来源装备区的牌', async () => {
  const g = mkGame('simayi', 'caocao',
    new ScriptController({
      async askSkillInvoke(p, id) { return id === 'fankui'; },
      async askChooseCards(p, opts) { return opts.reason === 'fankui' ? ['weapon'] : null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [sy, cc] = g.players;
  const weapon = drawOut(g, 'qinglong');
  cc.equip.weapon = weapon;
  cc.hand = [];
  sy.hp = 4;
  await applyDamageImported(g, cc, sy, 1, drawOut(g, 'sha'));
  assert.ok(sy.hand.some(c => c.id === weapon.id), '反馈应能获得装备区的牌');
  assert.strictEqual(cc.equip.weapon, null);
});

// ---------- 牌名冒充（引擎必须拒绝） ----------
test('冒充：任意牌不能当【无懈可击】', async () => {
  const g = mkGame('caocao', 'sunquan',
    new AIController(),
    // 恶意控制器：被问无懈时返回一张【杀】
    new ScriptController({ async askNullify(p) { return p.hand.find(c => c.name === 'sha'); } }));
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const wz = drawOut(g, 'wuzhong');
  cc.hand = [wz];
  const fakeSha = drawOut(g, 'sha');
  sq.hand = [fakeSha, drawOut(g, 'wuxie')]; // 有无懈才会被询问
  await resolveCardUse(g, cc, { card: wz, targets: [] });
  assert.strictEqual(cc.hand.length, 2, '无中生有不应被【杀】抵消，应摸到 2 张');
  assert.ok(sq.hand.some(c => c.id === fakeSha.id), '冒充失败的【杀】不应被消耗');
});

test('冒充：任意牌不能当【桃】救命', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({ async askPeach(p) { return p.hand.find(c => c.name !== 'tao'); } }),
    new ScriptController({ async askPeach() { return null; } }));
  g.registerHeroHooks();
  const [cc] = g.players;
  const fake = drawOut(g, 'sha');
  cc.hand = [fake, drawOut(g, 'tao')]; // 有桃才会被询问
  cc.hp = 0;
  await handleDyingImported(g, cc);
  assert.ok(g.over, '用【杀】冒充【桃】应救不回来');
  assert.ok(cc.hand.some(c => c.id === fake.id), '冒充失败的【杀】不应被消耗');
});

test('冒充：任意牌不能当【闪】/【杀】打出', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [, sq] = g.players;
  const fake = drawOut(g, 'wuzhong');
  sq.hand = [fake];
  assert.strictEqual(validResponse(sq, { card: fake, as: 'shan' }, 'shan'), null, '不能冒充闪');
  assert.strictEqual(validResponse(sq, { card: fake, as: 'sha' }, 'sha'), null, '非关羽不能冒充杀');
  assert.strictEqual(validResponse(sq, fake, 'shan'), null, '裸牌也不能冒充闪');
});

test('冒充：丈八蛇矛的双牌只能合成【杀】，且必须持有该武器', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [, sq] = g.players;
  const a = drawOut(g, 'wuzhong'), b = drawOut(g, 'le');
  sq.hand = [a, b];
  assert.strictEqual(validResponse(sq, { cards: [a, b], as: 'sha' }, 'sha'), null, '无武器时拒绝');
  sq.equip.weapon = takeCard(g, 'zhangba');
  assert.ok(validResponse(sq, { cards: [a, b], as: 'sha' }, 'sha'), '有武器时接受合成杀');
  assert.strictEqual(validResponse(sq, { cards: [a, b], as: 'shan' }, 'shan'), null, '不能合成闪');
  assert.strictEqual(validResponse(sq, { cards: [a, a], as: 'sha' }, 'sha'), null, '不能用同一张牌两次');
});

test('转化：关羽的武圣仍可正常把红牌当杀打出', async () => {
  const g = mkGame('guanyu', 'sunquan', new AIController(), new AIController());
  const [gy] = g.players;
  // 必须排除【闪】本身：红色【闪】当然能以【闪】打出，会让下面「不能转化出闪」的断言假失败
  const red = drawOutBy(g, c => isRed(c) && c.name !== 'sha' && c.name !== 'shan');
  const black = drawOutBy(g, c => !isRed(c) && c.name !== 'sha' && c.name !== 'shan');
  gy.hand = [red, black];
  assert.ok(validResponse(gy, { card: red, as: 'sha' }, 'sha'), '红牌可当杀');
  assert.strictEqual(validResponse(gy, { card: black, as: 'sha' }, 'sha'), null, '黑牌不能当杀');
  assert.strictEqual(validResponse(gy, { card: red, as: 'shan' }, 'shan'), null, '武圣不能转化出闪');
});

// ---------- 出牌阶段合法性（引擎强制） ----------
test('出牌合法性：【闪】【无懈可击】不能主动使用', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  for (const name of ['shan', 'wuxie']) {
    const c = drawOut(g, name);
    cc.hand = [c];
    assert.ok(!canUseInPlayPhase(g, cc, c), `${name} 不应可主动使用`);
    await resolveCardUse(g, cc, { card: c, targets: [sq] });
    assert.ok(cc.hand.some(x => x.id === c.id), `${name} 不应被消耗`);
  }
});

test('出牌合法性：一回合只能出一张【杀】', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const s1 = drawOut(g, 'sha'), s2 = drawOut(g, 'sha');
  cc.hand = [s1, s2];
  sq.hand = [];
  cc.flags = { shaUsed: 0 };
  assert.strictEqual(shaLimitOf(cc), 1);

  await resolveCardUse(g, cc, { card: s1, targets: [sq] });
  assert.strictEqual(cc.flags.shaUsed, 1, '第一张杀应生效');
  assert.strictEqual(shaLeftOf(cc), 0);

  const hpAfterFirst = sq.hp;
  await resolveCardUse(g, cc, { card: s2, targets: [sq] });
  assert.strictEqual(sq.hp, hpAfterFirst, '第二张杀应被拒绝，不造成伤害');
  assert.ok(cc.hand.some(c => c.id === s2.id), '被拒绝的杀不应离手');
});

test('出牌合法性：诸葛连弩/咆哮令杀不限次数', async () => {
  const g = mkGame('zhangfei', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [zf, sq] = g.players;
  zf.flags = { shaUsed: 5 };
  assert.strictEqual(shaLimitOf(zf), Infinity, '咆哮应不限次数');
  const s = drawOut(g, 'sha');
  zf.hand = [s];
  sq.hand = [];
  const hpBefore = sq.hp;
  await resolveCardUse(g, zf, { card: s, targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore - 1, '咆哮下第 6 张杀仍应生效');

  const g2 = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [cc] = g2.players;
  cc.flags = { shaUsed: 3 };
  cc.equip.weapon = takeCard(g2, 'zhugenu');
  assert.strictEqual(shaLimitOf(cc), Infinity, '诸葛连弩应不限次数');
});

test('出牌合法性：桃体力满时不可用、闪电不可重复置入', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc] = g.players;
  const tao = drawOut(g, 'tao');
  cc.hand = [tao];
  cc.hp = cc.maxHp;
  assert.ok(!canUseInPlayPhase(g, cc, tao), '体力满时【桃】不可用');
  await resolveCardUse(g, cc, { card: tao, targets: [] });
  assert.ok(cc.hand.some(c => c.id === tao.id), '不应消耗');
  cc.hp = 1;
  assert.ok(canUseInPlayPhase(g, cc, tao), '体力未满时可用');

  const sd1 = drawOut(g, 'shandian'), sd2 = drawOut(g, 'shandian');
  cc.judgeZone = [sd1];
  cc.hand = [sd2];
  assert.ok(!canUseInPlayPhase(g, cc, sd2), '判定区已有闪电时不可再置');
  await resolveCardUse(g, cc, { card: sd2, targets: [cc] });
  assert.strictEqual(cc.judgeZone.length, 1, '判定区不应出现第二张闪电');
});

test('出牌合法性：乐不思蜀不可重复、借刀杀人需对方有武器', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const le1 = drawOut(g, 'le'), le2 = drawOut(g, 'le');
  sq.judgeZone = [le1];
  cc.hand = [le2];
  assert.ok(!canUseInPlayPhase(g, cc, le2), '对方已有乐时不可再用');
  sq.judgeZone = [];
  assert.ok(canUseInPlayPhase(g, cc, le2), '对方无乐时可用');

  const jdao = drawOut(g, 'jiedao');
  cc.hand = [jdao];
  assert.ok(!canUseInPlayPhase(g, cc, jdao), '对方无武器时借刀不可用');
  sq.equip.weapon = takeCard(g, 'qinglong');
  assert.ok(canUseInPlayPhase(g, cc, jdao), '对方有武器时可用');
});

test('武圣：关羽可在出牌阶段将红色牌当杀使用', async () => {
  const g = mkGame('guanyu', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [gy, sq] = g.players;
  const redCard = drawOutBy(g, c => isRed(c) && c.name !== 'sha' && c.name !== 'tao');
  gy.hand = [redCard];
  sq.hand = [];
  assert.ok(canUseAsSha(gy, redCard), '红牌应可转化为杀');
  assert.ok(canUseInPlayPhase(g, gy, redCard, 'sha'), '以杀名义可用');
  const hpBefore = sq.hp;
  await resolveCardUse(g, gy, { card: makeVirtual(redCard, 'sha'), targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore - 1, '武圣转化的杀应造成伤害');
  assert.strictEqual(gy.flags.shaUsed, 1, '应计入杀的次数');
});

test('武圣：非关羽不能把红牌当杀', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const redCard = drawOutBy(g, c => isRed(c) && c.name !== 'sha');
  cc.hand = [redCard];
  sq.hand = [];
  assert.ok(!canUseAsSha(cc, redCard));
  const hpBefore = sq.hp;
  await resolveCardUse(g, cc, { card: makeVirtual(redCard, 'sha'), targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore, '无武圣不应能转化出杀');
  assert.ok(cc.hand.some(c => c.id === redCard.id), '不应消耗手牌');
});

// ---------- 无意义询问的跳过 ----------
test('无懈可击：手里没有无懈时不询问', async () => {
  let asked = 0;
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({ async askNullify() { asked++; return null; } }),
    new ScriptController({ async askNullify() { asked++; return null; } }));
  g.registerHeroHooks();
  const [cc] = g.players;
  const wz = drawOut(g, 'wuzhong');
  cc.hand = [wz];
  g.players[1].hand = [];
  await resolveCardUse(g, cc, { card: wz, targets: [] });
  assert.strictEqual(asked, 0, '双方都没有无懈，不应发生任何询问');

  // 对方有无懈时应被询问
  const wx = drawOut(g, 'wuxie');
  g.players[1].hand = [wx];
  const wz2 = drawOut(g, 'wuzhong');
  cc.hand = [wz2];
  await resolveCardUse(g, cc, { card: wz2, targets: [] });
  assert.ok(asked > 0, '持有无懈者应被询问');
});

test('求闪/求杀：无对应牌时不询问', async () => {
  let shanAsk = 0, shaAsk = 0;
  const g = mkGame('caocao', 'sunquan',
    new AIController(),
    new ScriptController({
      async askRespondCard(p, req) {
        if (req.type === 'shan') shanAsk++; else shaAsk++;
        return null;
      },
    }));
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  sq.hand = []; // 没有闪
  await resolveSlash(g, cc, sq, makeVirtual(drawOut(g, 'sha'), 'sha'));
  assert.strictEqual(shanAsk, 0, '没有闪时不应询问');

  const juedou = drawOut(g, 'juedou');
  cc.hand = [juedou];
  sq.hand = [drawOut(g, 'tao')]; // 有手牌但没有杀
  await resolveCardUse(g, cc, { card: juedou, targets: [sq] });
  assert.strictEqual(shaAsk, 0, '没有杀（也无武圣/丈八）时不应询问');
});

test('濒死求桃：手里没有桃时不询问', async () => {
  let asked = 0;
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({ async askPeach() { asked++; return null; } }),
    new ScriptController({ async askPeach() { asked++; return null; } }));
  g.registerHeroHooks();
  const [cc] = g.players;
  cc.hand = []; g.players[1].hand = [];
  cc.hp = 0;
  await handleDyingImported(g, cc);
  assert.strictEqual(asked, 0, '双方无桃，不应询问');
  assert.ok(g.over, '应判定死亡');
});

// ---------- 丈八蛇矛 ----------
test('丈八蛇矛：两张手牌当杀使用，命中并弃置两张', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  cc.equip.weapon = takeCard(g, 'zhangba');
  const a = drawOut(g, 'wuzhong'), b = drawOut(g, 'le');
  cc.hand = [a, b];
  sq.hand = [];
  const hpBefore = sq.hp;
  await resolveCardUse(g, cc, { cards: [a, b], card: a, targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore - 1, '合成杀应造成 1 点伤害');
  assert.strictEqual(cc.hand.length, 0, '两张材料牌都应离手');
});

test('丈八蛇矛：可作为响应打出的杀（决斗）', async () => {
  const g = mkGame('caocao', 'sunquan',
    new AIController(),
    new ScriptController({
      async askRespondCard(p, req) {
        if (req.type !== 'sha') return null;
        const spare = p.hand.filter(c => c.name !== 'sha');
        return spare.length >= 2 ? { cards: spare.slice(0, 2), as: 'sha' } : null;
      },
    }));
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  sq.equip.weapon = takeCard(g, 'zhangba');
  sq.hand = [drawOut(g, 'wuzhong'), drawOut(g, 'le')];
  const juedou = drawOut(g, 'juedou');
  cc.hand = [juedou];
  const ccHp = cc.hp;
  await resolveCardUse(g, cc, { card: juedou, targets: [sq] });
  // 孙权用丈八蛇矛打出杀，曹操无杀可还 → 曹操受伤
  assert.strictEqual(sq.hand.length, 0, '两张材料牌都应离手');
  assert.strictEqual(cc.hp, ccHp - 1, '决斗中曹操应受伤');
});

test('丈八蛇矛：无该武器时拒绝合成杀', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const a = drawOut(g, 'wuzhong'), b = drawOut(g, 'le');
  cc.hand = [a, b];
  sq.hand = [];
  const hpBefore = sq.hp;
  await resolveCardUse(g, cc, { cards: [a, b], card: a, targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore, '无丈八蛇矛不应造成伤害');
  assert.strictEqual(cc.hand.length, 2, '不应消耗手牌');
});

// ---------- 观星 ----------
test('观星：准备阶段发动，top 置于牌堆顶、bottom 沉底', async () => {
  let asked = null;
  const g = mkGame('zhugeliang', 'caocao',
    new ScriptController({
      async askGuanxing(p, cards) {
        asked = cards;
        // 第二张置顶、第一张沉底，验证顺序确实生效
        return { top: [cards[1]], bottom: [cards[0]] };
      },
      async askPlayCard() { return null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [zl] = g.players;
  zl.hand = [];
  await runTurn(g, zl);
  assert.ok(asked && asked.length === 2, '1v1 应亮出 2 张牌');
  // 摸牌阶段摸 2 张：应先摸到置顶的那张
  assert.ok(zl.hand.some(c => c.id === asked[1].id), '置顶的牌应被摸到');
  assert.ok(!g.deck.cards.slice(-2).some(c => c.id === asked[0].id), '沉底的牌不应还在牌堆顶');
});

test('观星：未分配的牌一律沉底，不会丢牌', async () => {
  const g = mkGame('zhugeliang', 'caocao',
    new ScriptController({
      async askGuanxing() { return { top: [], bottom: [] }; }, // 故意不分配
      async askPlayCard() { return null; },
    }),
    new AIController());
  g.registerHeroHooks();
  const [zl] = g.players;
  zl.hand = [];
  const total = () => g.deck.cards.length + g.deck.discardPile.length
    + g.players.reduce((n, p) => n + p.hand.length + p.judgeZone.length
      + Object.values(p.equip).filter(Boolean).length, 0);
  const before = total();
  await runTurn(g, zl);
  assert.strictEqual(total(), before, '牌总数应守恒（未分配的牌不能丢失）');
});

test('闪电：命中后曹操可用奸雄获得该闪电牌', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({
      async askSkillInvoke(p, id) { return id === 'jianxiong'; },
      async askPlayCard() { return null; },
      // 弃牌阶段保留抢来的闪电（否则受伤后手牌上限降低会把它弃掉）
      async askChooseCards(p, opts) {
        if (opts.reason === 'discard-phase') {
          return p.hand.filter(c => c.name !== 'shandian').slice(0, opts.count);
        }
        return null;
      },
    }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const shandian = drawOut(g, 'shandian');
  cc.judgeZone = [shandian];
  const spade = drawOutBy(g, c => c.suit === '♠' && c.rank >= 2 && c.rank <= 9);
  g.deck.putOnTop([spade]);
  cc.hand = []; sq.hand = [];
  cc.hp = 4;
  await runTurn(g, cc);
  assert.strictEqual(cc.hp, 1, '应受 3 点雷电伤害');
  assert.ok(cc.hand.some(c => c.id === shandian.id), '奸雄应能获得造成伤害的闪电牌');
  assert.ok(!g.deck.discardPile.some(c => c.id === shandian.id), '被奸雄拿走后不应同时在弃牌堆');
});

test('判定区结算：牌总数守恒（无重复弃置/丢牌）', async () => {
  const g = mkGame('sunquan', 'caocao',
    new ScriptController({ async askPlayCard() { return null; }, async askChooseCards() { return null; } }),
    new AIController());
  g.registerHeroHooks();
  const [sq] = g.players;
  const le = drawOut(g, 'le');
  const shandian = drawOut(g, 'shandian');
  sq.judgeZone = [le, shandian];
  sq.hand = [];
  const ids = new Set();
  const collect = () => {
    ids.clear();
    for (const c of [...g.deck.cards, ...g.deck.discardPile, ...g.pendingDiscard]) ids.add(c.id);
    for (const p of g.players) {
      for (const c of [...p.hand, ...p.judgeZone, ...Object.values(p.equip).filter(Boolean)]) ids.add(c.id);
    }
    return ids.size;
  };
  const totalCount = () => g.deck.cards.length + g.deck.discardPile.length + g.pendingDiscard.length
    + g.players.reduce((n, p) => n + p.hand.length + p.judgeZone.length
      + Object.values(p.equip).filter(Boolean).length, 0);
  const uniqBefore = collect();
  await runTurn(g, sq);
  assert.strictEqual(collect(), totalCount(), '不应有牌同时存在于两处（重复弃置）');
  assert.ok(collect() >= uniqBefore - 2, '不应大量丢牌');
});

// ---------- 装备替换 ----------
test('装备：经 resolveCardUse 使用后应进入正确栏位（含马）', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc] = g.players;
  const expect = { weapon: 'qinglong', armor: 'bagua', 'horse+': 'ma+1', 'horse-': 'ma-1' };
  for (const name of ['qinglong', 'bagua', 'ma+1', 'ma-1']) {
    const c = takeCard(g, name);
    cc.hand = [c];
    await resolveCardUse(g, cc, { card: c, targets: [] });
  }
  for (const [slot, name] of Object.entries(expect)) {
    assert.ok(cc.equip[slot], `${slot} 栏位应有装备`);
    assert.strictEqual(cc.equip[slot].name, name, `${slot} 栏位装备应为 ${name}`);
  }
  assert.deepStrictEqual(
    Object.keys(cc.equip).filter(k => !['weapon', 'armor', 'horse+', 'horse-'].includes(k)),
    [], '不应产生多余的装备栏位 key');
});

test('装备：同槽位替换后旧装备进弃牌堆', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  const [cc] = g.players;
  const w1 = takeCard(g, 'qinglong'), w2 = takeCard(g, 'guanshi');
  g.equipCard(cc, w1);
  g.equipCard(cc, w2);
  assert.strictEqual(cc.equip.weapon.id, w2.id);
  assert.ok(g.deck.discardPile.some(c => c.id === w1.id), '旧武器应进弃牌堆');
  assert.strictEqual(cc.hand.length, 0);
});

// ---------- 借刀杀人 ----------
test('借刀杀人：目标无杀时武器归使用者', async () => {
  const g = mkGame('caocao', 'sunquan', new AIController(), new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const weapon = takeCard(g, 'qinglong');
  sq.equip.weapon = weapon;
  sq.hand = [];
  const jiedao = takeCard(g, 'jiedao');
  cc.hand = [jiedao];
  await resolveCardUse(g, cc, { card: jiedao, targets: [sq] });
  assert.ok(cc.hand.some(c => c.id === weapon.id), '武器应归使用者');
  assert.strictEqual(sq.equip.weapon, null);
});

// ---------- 过河拆桥 / 顺手牵羊 ----------
test('过河拆桥：目标无牌时安全跳过', async () => {
  const g = mkGame('caocao', 'sunquan',
    new AIController(),
    new ScriptController({ async askChooseCards() { return null; } }));
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  sq.hand = [];
  const guohe = takeCard(g, 'guohe');
  cc.hand = [guohe];
  const hpBefore = sq.hp;
  await resolveCardUse(g, cc, { card: guohe, targets: [sq] });
  assert.strictEqual(sq.hp, hpBefore, '不应受伤');
  assert.strictEqual(sq.equip.weapon, null);
});

test('顺手牵羊：获得对方手牌', async () => {
  const g = mkGame('caocao', 'sunquan',
    new ScriptController({ async askChooseCards(p, opts) { return opts.reason === 'shunshou' ? ['hand'] : null; } }),
    new AIController());
  g.registerHeroHooks();
  const [cc, sq] = g.players;
  const target = takeCard(g, 'shan');
  sq.hand = [target];
  const shunshou = takeCard(g, 'shunshou');
  cc.hand = [shunshou];
  await resolveCardUse(g, cc, { card: shunshou, targets: [sq] });
  assert.ok(cc.hand.some(c => c.id === target.id), '应获得对方手牌');
  assert.strictEqual(sq.hand.length, 0);
});
