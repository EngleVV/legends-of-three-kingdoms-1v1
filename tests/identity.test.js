// 5 人身份局：座次距离、主公先行、阵亡处理与奖惩、胜负、群体结算、主公技、AI 不读隐藏身份
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { Controller } from '../src/controller.js';
import { HEROES } from '../src/data/heroes.js';
import { distance, legalTargets, canJiedaoVictim } from '../src/data/cards.js';
import { makeVirtual, resolveCardUse, resolveSlash, useSkill } from '../src/core/card-use.js';
import { applyDamage } from '../src/core/damage.js';
import { runTurn, resolveJudgeZone } from '../src/core/turn.js';
import { checkWinner, killPlayer, lordCandidates, LORD_HEROES } from '../src/core/identity.js';
import { relationOf } from '../src/ai/perception.js';
import { choosePlay } from '../src/ai/strategy.js';

class Script extends Controller {
  constructor(o = {}) { super(); Object.assign(this, o); }
}
const ROLES = ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'];
function mk(ids, { roles = ROLES, ctrls = null } = {}) {
  return new Game({
    heroes: ids.map(id => HEROES[id]),
    controllers: ctrls || ids.map(() => new Script()),
    mode: 'identity', roles,
  });
}
const draw = (g, pred) => {
  const i = g.deck.cards.findIndex(typeof pred === 'string' ? c => c.name === pred : pred);
  if (i < 0) throw new Error('牌堆里没有该牌');
  return g.deck.cards.splice(i, 1)[0];
};
const IDS = ['liubei', 'guanyu', 'zhangfei', 'caocao', 'sunquan'];

test('座次距离：5 人局相邻为 1、隔一人为 2；马与阵亡者会改变距离', () => {
  const g = mk(IDS);
  const [a, b, c, d, e] = g.players;
  assert.strictEqual(distance(a, b, g), 1);
  assert.strictEqual(distance(a, c, g), 2);
  assert.strictEqual(distance(a, d, g), 2);
  assert.strictEqual(distance(a, e, g), 1);
  c.equip['horse+'] = draw(g, 'ma+1');
  assert.strictEqual(distance(a, c, g), 3, '+1 马');
  a.equip['horse-'] = draw(g, 'ma-1');
  assert.strictEqual(distance(a, c, g), 2, '-1 马抵消');
  b.dead = true;
  assert.strictEqual(distance(a, c, g), 1, '中间角色阵亡后距离缩短');
});

test('主公：明置身份、体力上限 +1、先行；起手各 4 张', async () => {
  const g = mk(IDS, { roles: ['rebel', 'lord', 'loyalist', 'rebel', 'renegade'] });
  const lord = g.players[1];
  assert.ok(lord.roleRevealed && !g.players[0].roleRevealed);
  assert.strictEqual(lord.maxHp, 5);
  assert.strictEqual(lord.hp, 5);
  const first = [];
  const orig = g.log.bind(g);
  g.log = m => { if (m.startsWith('────')) first.push(m); orig(m); };
  g.turnCount = 500; // 只跑一个回合
  await g.run();
  assert.match(first[0], /刘备|关羽/);
  assert.ok(first[0].includes(lord.name), '主公先行');
});

test('阵亡：弃置全部牌、亮明身份；杀死反贼者摸三张', async () => {
  const g = mk(IDS);
  g.registerHeroHooks();
  const [lord, , rebel] = g.players;
  rebel.hp = 1;
  rebel.hand = [draw(g, 'shan')];
  rebel.equip.weapon = draw(g, 'qinglong');
  rebel.judgeZone = [draw(g, 'le')];
  lord.hand = [];
  await applyDamage(g, lord, rebel, 1, makeVirtual(draw(g, 'sha'), 'sha'));
  assert.ok(rebel.dead && rebel.roleRevealed);
  assert.strictEqual(rebel.allCards().length, 0);
  assert.strictEqual(lord.hand.length, 3, '杀反贼摸 3 张');
});

test('阵亡：主公杀死忠臣须弃置所有手牌与装备', async () => {
  const g = mk(IDS);
  g.registerHeroHooks();
  const [lord, loyal] = g.players;
  loyal.hp = 1; loyal.hand = [];
  lord.hand = [draw(g, 'tao'), draw(g, 'shan')];
  lord.equip.armor = draw(g, 'bagua');
  await applyDamage(g, lord, loyal, 1, makeVirtual(draw(g, 'sha'), 'sha'));
  assert.ok(loyal.dead);
  assert.strictEqual(lord.hand.length, 0);
  assert.strictEqual(lord.equip.armor, null);
});

test('胜负：主公阵亡时只剩内奸则内奸胜，否则反贼胜；反贼与内奸全灭则主公方胜', () => {
  let g = mk(IDS);
  g.players.forEach(p => { if (p.role !== 'renegade') p.dead = true; });
  assert.strictEqual(checkWinner(g).side, 'renegade');
  g = mk(IDS);
  g.players[0].dead = true;
  assert.strictEqual(checkWinner(g).side, 'rebel');
  g = mk(IDS);
  g.players[0].dead = true; g.players[2].dead = true; g.players[3].dead = true;
  assert.strictEqual(checkWinner(g).side, 'rebel', '反贼全灭但主公死于内奸前仍是反贼胜（场上不止内奸）');
  g = mk(IDS);
  for (const i of [2, 3, 4]) g.players[i].dead = true;
  const r = checkWinner(g);
  assert.strictEqual(r.side, 'lord');
  assert.deepStrictEqual(r.winners.map(p => p.role).sort(), ['lord', 'loyalist']);
});

test('killPlayer 分出胜负后立即结束，不再发奖励', () => {
  const g = mk(IDS);
  g.players[3].dead = true; g.players[4].dead = true;
  killPlayer(g, g.players[2], g.players[0]);
  assert.ok(g.over && g.winnerSide === 'lord');
  assert.strictEqual(g.players[0].hand.length, 0, '游戏已结束，不再摸三张');
});

test('南蛮入侵：依次结算其他角色，跳过阵亡者，自己不受影响', async () => {
  const g = mk(IDS);
  g.registerHeroHooks();
  const [a, ...rest] = g.players;
  const nm = draw(g, 'nanman');
  a.hand = [nm];
  for (const p of rest) p.hand = [];
  rest[1].dead = true;
  const hit = [];
  const orig = g.log.bind(g);
  g.log = m => { const x = /^(\S+) 受到/.exec(m); if (x) hit.push(x[1]); orig(m); };
  await resolveCardUse(g, a, { card: nm, targets: [] });
  assert.deepStrictEqual(hit, [rest[0].name, rest[2].name, rest[3].name]);
  assert.strictEqual(a.hp, a.maxHp);
});

test('闪电：判定未中时移至下一名存活且判定区无闪电的角色', async () => {
  const g = mk(IDS);
  const [a, b, c] = g.players;
  const sd = draw(g, 'shandian');
  const sd2 = draw(g, 'shandian');
  for (const p of g.players) p.hand = [];
  a.judgeZone = [sd];
  b.dead = true;
  c.judgeZone = [sd2];
  const safe = draw(g, c => c.suit === '♥');
  g.deck.putOnTop([safe]);
  await resolveJudgeZone(g, a);
  assert.ok(g.players[3].judgeZone.some(x => x.id === sd.id), '跳过阵亡的 b 和已有闪电的 c');
});

test('借刀杀人：两个目标，第二目标须在持武器者攻击范围内且不是其本人', async () => {
  const g = mk(IDS, { ctrls: [new Script(), new Script(), new Script(), new AIController(), new Script()] });
  g.registerHeroHooks();
  const [a, , , d, e] = g.players;
  d.equip.weapon = draw(g, 'qinglong'); // 攻击范围 3
  d.hand = [draw(g, 'sha')];
  e.hand = [];
  assert.ok(!canJiedaoVictim(g, a, d, d), '不能让其杀自己');
  assert.ok(canJiedaoVictim(g, a, d, e));
  const jd = draw(g, 'jiedao');
  a.hand = [jd];
  await resolveCardUse(g, a, { card: jd, targets: [d] });
  assert.ok(a.hand.some(c => c.id === jd.id), '缺少第二目标应被拒绝');
  await resolveCardUse(g, a, { card: jd, targets: [d], victim: e });
  assert.strictEqual(e.hp, e.maxHp - 1, '孙权受到关羽…的杀');
});

test('合法目标：【杀】只能指定攻击范围内的角色', () => {
  const g = mk(IDS);
  const [a] = g.players;
  const sha = draw(g, 'sha');
  a.hand = [sha];
  a.flags = { shaUsed: 0 };
  const ts = legalTargets(g, a, sha).map(p => p.seat).sort();
  assert.deepStrictEqual(ts, [1, 4], '无武器时只能杀相邻两人');
});

test('激将：主公刘备需要【杀】时可令蜀势力角色代出；出牌阶段也可发动', async () => {
  const give = new Script({ async askRespondCard(p, req) { return p.hand.find(c => c.name === 'sha'); } });
  const g = mk(IDS, { ctrls: [new Script({ async askSkillInvoke(p, id) { return id === 'jijiang'; } }), give, new Script(), new Script(), new Script()] });
  g.registerHeroHooks();
  const [lb, gy, , cc] = g.players;
  const nm = draw(g, 'nanman');
  cc.hand = [nm];
  lb.hand = [];
  gy.hand = [draw(g, 'sha')];
  g.currentTurnSeat = 3;
  await resolveCardUse(g, cc, { card: nm, targets: [] });
  assert.strictEqual(lb.hp, lb.maxHp, '关羽代出【杀】，主公不掉血');
  assert.strictEqual(gy.hand.length, 0);
  // 出牌阶段激将
  gy.hand = [draw(g, 'sha')];
  lb.flags = { shaUsed: 0 };
  const target = g.players[1 + 3]; // 孙权与刘备相邻
  target.hand = [];
  const before = target.hp;
  await useSkill(g, lb, { skillId: 'jijiang', targets: [target] });
  assert.strictEqual(target.hp, before - 1);
  assert.strictEqual(lb.flags.shaUsed, 1, '计入主公本回合【杀】次数');
});

test('护驾：主公曹操需要【闪】时可令魏势力角色代出；非主公无此技能', async () => {
  const ids = ['caocao', 'simayi', 'zhangfei', 'guanyu', 'sunquan'];
  const g = mk(ids, { ctrls: [
    new Script({ async askSkillInvoke(p, id) { return id === 'hujia'; } }),
    new Script({ async askRespondCard(p) { return p.hand.find(c => c.name === 'shan'); } }),
    new Script(), new Script(), new Script()] });
  g.registerHeroHooks();
  const [cc, sy, zf] = g.players;
  cc.hand = []; sy.hand = [draw(g, 'shan')];
  await resolveSlash(g, zf, cc, makeVirtual(draw(g, 'sha'), 'sha'));
  assert.strictEqual(cc.hp, cc.maxHp, '司马懿代出【闪】');

  const g2 = mk(ids, { roles: ['loyalist', 'lord', 'rebel', 'rebel', 'renegade'] });
  let asked = false;
  g2.players[0].controller.askSkillInvoke = async (p, id) => { if (id === 'hujia') asked = true; return true; };
  g2.players[0].hand = [];
  await resolveSlash(g2, g2.players[2], g2.players[0], makeVirtual(draw(g2, 'sha'), 'sha'));
  assert.ok(!asked, '曹操不是主公时没有护驾');
});

test('救援：其他吴势力角色对濒死主公孙权使用【桃】额外回复 1 点', async () => {
  // 标准版 8 将中只有孙权是吴势力，这里临时构造一名吴势力角色验证规则
  const wu = { ...HEROES.guanyu, id: 'wu-test', name: '吴将', kingdom: '吴' };
  const g = new Game({
    heroes: [HEROES.sunquan, wu, HEROES.zhangfei, HEROES.caocao, HEROES.lvbu],
    controllers: [new Script(), new Script({ async askPeach(p) { return p.hand.find(c => c.name === 'tao'); } }),
      new Script(), new Script(), new Script()],
    mode: 'identity', roles: ROLES,
  });
  const [sq, w] = g.players;
  w.hand = [draw(g, 'tao')];
  sq.hand = [];
  sq.hp = 1;
  await applyDamage(g, g.players[2], sq, 1, makeVirtual(draw(g, 'sha'), 'sha'));
  assert.strictEqual(sq.hp, 2, '0 → 2');
});

test('选将：主公候选包含曹操、刘备、孙权 + 2 名其他武将', () => {
  const ids = Object.keys(HEROES);
  const c = lordCandidates(ids);
  assert.strictEqual(c.length, 5);
  for (const id of LORD_HEROES) assert.ok(c.includes(id));
  assert.strictEqual(new Set(c).size, 5);
});

test('AI 不读隐藏身份：交换两名未亮身份角色的身份，AI 的友敌判断与出牌完全一致', () => {
  const build = roles => {
    const g = mk(IDS, { roles, ctrls: IDS.map(() => new AIController()) });
    g.loyalty = [0, 1.5, -2, 0, 0.8];
    const viewer = g.players[4];
    viewer.hand = [draw(g, 'sha'), draw(g, 'juedou')];
    viewer.flags = { shaUsed: 0 };
    return { g, viewer };
  };
  // 观察者（4 号，内奸）视角：1 号与 2 号的真实身份互换
  const A = build(['lord', 'loyalist', 'rebel', 'rebel', 'renegade']);
  const B = build(['lord', 'rebel', 'loyalist', 'rebel', 'renegade']);
  const rel = x => x.g.players.map(p => relationOf(x.g, x.viewer, p));
  assert.deepStrictEqual(rel(A), rel(B));
  const act = x => { const a = choosePlay(x.g, x.viewer); return a && [a.card?.name, a.targets?.map(t => t.seat)]; };
  assert.deepStrictEqual(act(A), act(B));
});

test('AI 对局：100 局身份局均分出胜负，牌总数守恒，各阵营都能获胜', async () => {
  const pool = Object.keys(HEROES);
  const sides = {};
  for (let i = 0; i < 100; i++) {
    const ids = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    const g = new Game({ heroes: ids.map(id => HEROES[id]), controllers: ids.map(() => new AIController()) });
    await g.run();
    assert.ok(g.over, `第 ${i} 局未结束`);
    g.flushPending();
    const all = [...g.deck.cards, ...g.deck.discardPile, ...g.pendingDiscard, ...g.players.flatMap(p => p.allCards())];
    assert.strictEqual(new Set(all.map(c => c.id)).size, 108);
    assert.strictEqual(all.length, 108);
    sides[g.winnerSide] = (sides[g.winnerSide] || 0) + 1;
  }
  for (const s of ['lord', 'rebel']) assert.ok(sides[s] > 0, `${s} 方应能获胜：${JSON.stringify(sides)}`);
});
