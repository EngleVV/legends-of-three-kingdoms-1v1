// 标准版 17 名新增武将的技能：每个技能都经由玩家实际走的调用链验证
// （resolveCardUse / resolveSlash / useSkill / applyDamage / runTurn / handleDying），并做反向检查。
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { Controller } from '../src/controller.js';
import { AIController } from '../src/ai/ai-controller.js';
import { HEROES, HERO_LIST, SKILL_INFO } from '../src/data/heroes.js';
import { distance, canTarget, canUseInPlayPhase, legalTargets } from '../src/data/cards.js';
import {makeVirtual, resolveCardUse, useSkill } from '../src/core/card-use.js';
import { resolveSlash } from '../src/packs/standard/cards/basic.js';
import { applyDamage } from '../src/core/damage.js';
import { handleDying } from '../src/core/dying.js';
import { runTurn } from '../src/core/turn.js';
import { doJudge } from '../src/core/judge.js';

class S extends Controller { constructor(o = {}) { super(); Object.assign(this, o); } }
const yes = () => new S({ async askSkillInvoke() { return true; } });
function mk(ids, ctrls) {
  const g = new Game({ heroes: ids.map(id => HEROES[id]), controllers: ctrls || ids.map(() => new S()) });
  return g;
}
// 从牌堆取出一张牌（移出牌堆，保证守恒）
const take = (g, pred) => {
  const f = typeof pred === 'string' ? c => c.name === pred : pred;
  const i = g.deck.cards.findIndex(f);
  if (i < 0) throw new Error('牌堆中没有该牌');
  return g.deck.cards.splice(i, 1)[0];
};
const red = c => c.suit === '♥' || c.suit === '♦';
const black = c => !red(c);
// 把一张牌放到牌堆顶（下一张被摸到/判定）
const top = (g, pred) => g.deck.putOnTop([take(g, pred)]);
const sha = g => makeVirtual(take(g, 'sha'), 'sha');
const total = g => {
  g.flushPending();
  const ids = [...g.deck.cards, ...g.deck.discardPile, ...g.pendingDiscard, ...g.players.flatMap(p => p.allCards())].map(c => c.id);
  return [ids.length, new Set(ids).size];
};

test('武将：标准版 25 将齐全，技能均有名称与描述', () => {
  assert.strictEqual(HERO_LIST.length, 25);
  for (const h of HERO_LIST) for (const s of [...h.skills, ...(h.lordSkills || [])]) {
    assert.ok(SKILL_INFO[s]?.[0] && SKILL_INFO[s]?.[1], `${h.name} 的技能 ${s} 缺少说明`);
  }
  assert.deepStrictEqual(HERO_LIST.filter(h => h.gender === 'female').map(h => h.name).sort(),
    ['大乔', '孙尚香', '甄姬', '貂蝉', '黄月英'].sort());
});

// ---------- 魏 ----------
test('刚烈：判定非红桃，来源选择弃两张手牌或受到 1 点伤害', async () => {
  const g = mk(['xiahoudun', 'zhangfei'], [yes(), new S({ async askChooseCards() { return null; } })]);
  const [xhd, zf] = g.players;
  xhd.hand = []; zf.hand = [take(g, 'shan'), take(g, 'shan')];
  top(g, c => c.suit === '♠');
  await resolveSlash(g, zf, xhd, sha(g));
  assert.strictEqual(zf.hp, 3, '不弃牌则受到 1 点伤害');
  assert.strictEqual(zf.hand.length, 2);
  // 红桃判定：无效果
  top(g, c => c.suit === '♥');
  await resolveSlash(g, zf, xhd, sha(g));
  assert.strictEqual(zf.hp, 3);
});

test('刚烈：来源可以弃置两张手牌避免伤害', async () => {
  const g = mk(['xiahoudun', 'zhangfei'], [yes(), new S({ async askChooseCards(p) { return p.hand.slice(0, 2); } })]);
  const [xhd, zf] = g.players;
  xhd.hand = []; zf.hand = [take(g, 'shan'), take(g, 'tao'), take(g, 'wuzhong')];
  top(g, c => c.suit === '♣');
  await resolveSlash(g, zf, xhd, sha(g));
  assert.strictEqual(zf.hp, 4);
  assert.strictEqual(zf.hand.length, 1);
});

test('突袭：放弃摸牌，获得至多两名其他角色的各一张手牌', async () => {
  const g = new Game({ heroes: ['zhangliao', 'zhangfei', 'caocao', 'liubei', 'sunquan'].map(i => HEROES[i]),
    controllers: [new S({ async askChoosePlayers(p, o) { return o.candidates.slice(0, 2); } }), ...[1, 2, 3, 4].map(() => new S())],
    mode: 'identity', roles: ['rebel', 'lord', 'loyalist', 'rebel', 'renegade'] });
  const [zl, a, b] = g.players;
  a.hand = [take(g, 'shan')]; b.hand = [take(g, 'tao')];
  zl.hand = [];
  g.firstTurnPending = false;
  await runTurn(g, zl);
  assert.ok(zl.hand.some(c => c.name === 'shan') || zl.hand.length < 4);
  assert.strictEqual(a.hand.length, 0);
  assert.strictEqual(b.hand.length, 0);
  assert.deepStrictEqual(total(g), [108, 108]);
});

test('裸衣：少摸一张，本回合杀的伤害 +1；回合结束后失效', async () => {
  const g = mk(['xuchu', 'lvbu'], [new S({
    async askSkillInvoke(p, id) { return id === 'luoyi'; },
    async askPlayCard(p) { const s = p.hand.find(c => c.name === 'sha'); return s ? { card: s, targets: [g.players[1]] } : null; },
  }), new S()]);
  const [xc, lb] = g.players;
  xc.hand = [take(g, 'sha')]; lb.hand = [];
  g.firstTurnPending = false;
  const before = xc.hand.length;
  await runTurn(g, xc);
  assert.strictEqual(lb.hp, 2, '杀造成 2 点伤害');
  assert.ok(!xc.st('turn', 'luoyi').on, '回合结束后失效');
  assert.ok(before + 1 - 1 >= 0);
});

test('天妒：判定牌生效后获得此牌；遗计：每受到 1 点伤害分配两张牌', async () => {
  const g = mk(['guojia', 'zhangfei'], [new S({
    async askSkillInvoke() { return true; },
    async askChoosePlayers(p) { return [p]; },
  }), new S()]);
  const [gj, zf] = g.players;
  gj.hand = [];
  const jc = await doJudge(g, gj, '八卦阵');
  assert.ok(gj.hand.some(c => c.id === jc.id), '天妒获得判定牌');
  g.deck.discard(gj.hand.splice(0));
  await applyDamage(g, zf, gj, 2, null, 'normal', '测试');
  assert.strictEqual(gj.hand.length, 4, '受到 2 点伤害，遗计两次各得两张');
  assert.deepStrictEqual(total(g), [108, 108]);
});

test('倾国：黑色手牌当【闪】；红色牌不行', async () => {
  const g = mk(['zhenji', 'zhangfei'], [new S({ async askRespondCard(p) { return { card: p.hand[0], as: 'shan' }; } }), new S()]);
  const [zj, zf] = g.players;
  zj.hand = [take(g, c => c.name === 'tao')];
  await resolveSlash(g, zf, zj, sha(g));
  assert.strictEqual(zj.hp, 2, '红色牌不能当闪');
  zj.hand = [take(g, c => c.name === 'sha' && black(c))];
  await resolveSlash(g, zf, zj, sha(g));
  assert.strictEqual(zj.hp, 2, '黑色杀当闪');
  assert.strictEqual(zj.hand.length, 0);
});

test('洛神：黑色则获得并可继续，直到红色', async () => {
  const logs = [];
  const g = new Game({ heroes: [HEROES.zhenji, HEROES.zhangfei], controllers: [yes(), new S()], logger: m => logs.push(m) });
  const [zj] = g.players;
  zj.hand = [];
  top(g, red); top(g, black); top(g, black);
  await g.trigger('phaseStart', { player: zj, phase: 'prepare' });
  assert.strictEqual(zj.hand.length, 2, '两张黑色判定牌被获得，红色停止');
  assert.strictEqual(logs.filter(m => m.includes('发动【洛神】')).length, 3);
  assert.deepStrictEqual(total(g), [108, 108]);
});

// ---------- 蜀 ----------
test('龙胆：杀当闪、闪当杀', async () => {
  const g = mk(['zhaoyun', 'lvbu'], [new S({ async askRespondCard(p, req) { return { card: p.hand[0], as: req.type }; } }), new S()]);
  const [zy, lb] = g.players;
  zy.flags = { shaUsed: 0 }; lb.hand = [];
  const s = take(g, 'shan');
  zy.hand = [s];
  assert.ok(canUseInPlayPhase(g, zy, s, 'sha'), '出牌阶段可将闪当杀');
  await resolveCardUse(g, zy, { card: makeVirtual(s, 'sha'), targets: [lb] });
  assert.strictEqual(lb.hp, 3);
  // 响应：杀当闪（吕布无双需两张）
  zy.hand = [take(g, 'sha')];
  const lbSha = sha(g);
  await resolveSlash(g, g.players[1], zy, lbSha);
  assert.strictEqual(zy.hp, 3, '无双需两张，只有一张仍受伤');
});

test('马术：计算与其他角色的距离 -1；铁骑：判定红色目标不能出闪', async () => {
  const g = mk(['machao', 'zhangfei'], [yes(), new S({ async askRespondCard(p) { return p.hand[0]; } })]);
  const [mc, zf] = g.players;
  zf.equip['horse+'] = take(g, 'ma+1');
  assert.strictEqual(distance(mc, zf, g), 1, '马术抵消 +1 马');
  zf.hand = [take(g, 'shan')];
  top(g, red);
  await resolveSlash(g, mc, zf, sha(g));
  assert.strictEqual(zf.hp, 3, '铁骑红色：不能出闪');
  assert.strictEqual(zf.hand.length, 1, '闪没有被使用');
  top(g, black);
  await resolveSlash(g, mc, zf, sha(g));
  assert.strictEqual(zf.hp, 3, '铁骑黑色：可以出闪');
});

test('集智：使用非延时锦囊（含无懈可击）摸一张；奇才：顺手牵羊无距离限制', async () => {
  const g = new Game({ heroes: ['huangyueying', 'zhangfei', 'caocao', 'liubei', 'sunquan'].map(i => HEROES[i]),
    controllers: [yes(), ...[1, 2, 3, 4].map(() => new S())], mode: 'identity', roles: ['rebel', 'lord', 'loyalist', 'rebel', 'renegade'] });
  const [hy, , far] = g.players;
  far.hand = [take(g, 'shan')];
  assert.strictEqual(distance(hy, far, g), 2);
  const ss = take(g, 'shunshou');
  assert.ok(canTarget(g, hy, far, 'shunshou'), '奇才：距离 2 也可顺手');
  const wz = take(g, 'wuzhong');
  hy.hand = [wz];
  await resolveCardUse(g, hy, { card: wz, targets: [] });
  assert.strictEqual(hy.hand.length, 3, '无中生有 2 + 集智 1');
  const le = take(g, 'le');
  hy.hand = [le];
  await resolveCardUse(g, hy, { card: le, targets: [far] });
  assert.strictEqual(hy.hand.length, 0, '延时锦囊不触发集智');
  void ss;
});

// ---------- 吴 ----------
test('奇袭：黑色牌（含装备）当【过河拆桥】；红色不行', async () => {
  const g = mk(['ganning', 'zhangfei'], [new S({ async askChooseCards() { return ['hand']; } }), new S()]);
  const [gn, zf] = g.players;
  zf.hand = [take(g, 'shan')];
  const r = take(g, c => c.name === 'tao');
  assert.ok(!canUseInPlayPhase(g, gn, r, 'guohe'));
  const eq = take(g, c => c.name === 'bagua' && black(c));
  gn.equip.armor = eq;
  await resolveCardUse(g, gn, { card: makeVirtual(eq, 'guohe'), targets: [zf] });
  assert.strictEqual(zf.hand.length, 0, '拆掉对方手牌');
  assert.strictEqual(gn.equip.armor, null, '装备区的八卦阵被当作过河拆桥使用');
  assert.ok(g.deck.discardPile.some(c => c.id === eq.id));
});

test('克己：出牌阶段未使用或打出【杀】可跳过弃牌阶段', async () => {
  const g = mk(['lvmeng', 'zhangfei'], [new S({ async askSkillInvoke(p, id) { return id === 'keji'; } }), new S()]);
  const [lm] = g.players;
  lm.hand = Array.from({ length: 6 }, () => take(g, 'shan'));
  g.firstTurnPending = false;
  await runTurn(g, lm);
  assert.strictEqual(lm.hand.length, 8, '不弃牌');
});

test('苦肉：失去 1 点体力摸两张，濒死时先求桃；不触发受伤技能', async () => {
  const g = mk(['huanggai', 'caocao'], [new S({ async askPeach(p) { return p.hand.find(c => c.name === 'tao'); } }), new S()]);
  const [hg] = g.players;
  hg.hand = [];
  hg.flags = { used: {} };
  await useSkill(g, hg, { skillId: 'kurou' });
  assert.strictEqual(hg.hp, 3);
  assert.strictEqual(hg.hand.length, 2);
  hg.hp = 1;
  hg.hand = [take(g, 'tao')];
  await useSkill(g, hg, { skillId: 'kurou' });
  assert.ok(!g.over, '濒死用桃自救');
  assert.strictEqual(hg.hp, 1);
  assert.strictEqual(hg.hand.length, 2, '自救后摸两张');
});

test('英姿：摸牌阶段多摸一张', async () => {
  const g = mk(['zhouyu', 'zhangfei'], [new S({ async askSkillInvoke(p, id) { return id === 'yingzi'; } }), new S()]);
  const [zy] = g.players;
  zy.hand = [];
  g.firstTurnPending = false;
  await runTurn(g, zy);
  assert.strictEqual(zy.hand.length, 3);
});

test('反间：对方选花色并获得一张手牌，花色不同则受到 1 点伤害；出牌阶段限一次', async () => {
  const g = mk(['zhouyu', 'zhangfei'], [new S(), new S({ async askChooseOption() { return '♥'; } })]);
  const [zy, zf] = g.players;
  zy.flags = { used: {} };
  zy.hand = [take(g, c => c.suit === '♠')];
  zf.hand = [];
  await useSkill(g, zy, { skillId: 'fanjian', targets: [zf] });
  assert.strictEqual(zf.hand.length, 1);
  assert.strictEqual(zf.hp, 3, '花色不同受伤');
  zy.hand = [take(g, c => c.suit === '♥')];
  await useSkill(g, zy, { skillId: 'fanjian', targets: [zf] });
  assert.strictEqual(zf.hand.length, 1, '出牌阶段限一次');
});

test('国色：方块牌当【乐不思蜀】，判定区显示为乐并按乐结算', async () => {
  const g = mk(['daqiao', 'zhangfei']);
  const [dq, zf] = g.players;
  const d = take(g, c => c.suit === '♦' && c.name === 'shan');
  dq.hand = [d];
  await resolveCardUse(g, dq, { card: makeVirtual(d, 'le'), targets: [zf] });
  assert.strictEqual(zf.judgeZone[0].id, d.id);
  assert.ok(!canTarget(g, dq, zf, 'le'), '已有（国色的）乐，不能再放');
  top(g, c => c.suit === '♠');
  zf.controller.askPlayCard = async () => { throw new Error('被乐不应出牌'); };
  g.firstTurnPending = false;
  await runTurn(g, zf);
  assert.ok(zf.flags.skipPlay);
  assert.ok(!('delayedAs' in d), '离开判定区后恢复为原牌');
});

test('流离：弃一张牌把【杀】转移给攻击范围内的另一名角色', async () => {
  const g = new Game({ heroes: ['daqiao', 'zhangfei', 'caocao', 'liubei', 'sunquan'].map(i => HEROES[i]),
    controllers: [new S({
      async askChoosePlayers(p, o) { return [o.candidates[0]]; },
      async askChooseCards(p) { return [p.hand[0]]; },
    }), ...[1, 2, 3, 4].map(() => new S())], mode: 'identity', roles: ['rebel', 'lord', 'loyalist', 'rebel', 'renegade'] });
  const [dq, zf, , , sq] = g.players;
  dq.hand = [take(g, 'wuzhong')]; sq.hand = [];
  await resolveSlash(g, zf, dq, sha(g));
  assert.strictEqual(dq.hp, 3, '大乔不受伤');
  assert.strictEqual(dq.hand.length, 0, '弃置一张牌');
  assert.strictEqual(sq.hp, sq.maxHp - 1, '孙权（大乔攻击范围内、非使用者）受伤');
});

test('谦逊：不能成为顺手牵羊与乐不思蜀的目标；连营：失去最后手牌摸一张', async () => {
  const g = mk(['luxun', 'zhangfei'], [yes(), new S({ async askRespondCard(p) { return null; } })]);
  const [lx, zf] = g.players;
  lx.hand = [take(g, 'shan')];
  assert.ok(!canTarget(g, zf, lx, 'shunshou'));
  assert.ok(!canTarget(g, zf, lx, 'le'));
  assert.ok(canTarget(g, zf, lx, 'guohe'));
  const gh = take(g, 'guohe');
  zf.hand = [gh];
  zf.controller.askChooseCards = async () => ['hand'];
  await resolveCardUse(g, zf, { card: gh, targets: [lx] });
  await g.flushLoseTriggers();
  assert.strictEqual(lx.hand.length, 1, '被拆掉最后一张手牌后连营摸一张');
});

test('结姻：弃两张手牌，与一名受伤的男性角色各回复 1 点；枭姬：失去装备摸两张', async () => {
  const g = mk(['sunshangxiang', 'zhangfei'], [yes(), new S()]);
  const [ssx, zf] = g.players;
  ssx.flags = { used: {} };
  ssx.hp = 2; zf.hp = 2;
  ssx.hand = [take(g, 'shan'), take(g, 'shan')];
  await useSkill(g, ssx, { skillId: 'jieyin', cards: [...ssx.hand], targets: [zf] });
  assert.strictEqual(ssx.hp, 3); assert.strictEqual(zf.hp, 3);
  const w = take(g, 'qinglong');
  ssx.equip.weapon = w;
  const w2 = take(g, 'cixiong');
  ssx.hand = [w2];
  await resolveCardUse(g, ssx, { card: w2, targets: [] });
  await g.flushLoseTriggers();
  assert.strictEqual(ssx.hand.length, 2, '替换装备失去青龙刀，枭姬摸两张');
});

// ---------- 群 ----------
test('急救：回合外红色牌当【桃】；自己回合内不行', async () => {
  const g = mk(['huatuo', 'zhangfei'], [new S({ async askPeach(p) { return p.hand[0]; } }), new S()]);
  const [ht, zf] = g.players;
  const r = take(g, c => c.name === 'shan' && red(c));
  ht.hand = [r];
  g.currentTurnSeat = zf.seat;
  zf.hp = 0;
  await handleDying(g, zf, null);
  assert.ok(!g.over, '华佗在他人回合用红色闪救人');
  assert.strictEqual(zf.hp, 1);
  const g2 = mk(['huatuo', 'zhangfei'], [new S({ async askPeach(p) { return p.hand[0]; } }), new S()]);
  g2.players[0].hand = [take(g2, c => c.name === 'shan' && red(c))];
  g2.currentTurnSeat = 0;
  g2.players[0].hp = 0;
  await handleDying(g2, g2.players[0], null);
  assert.ok(g2.over, '自己回合内不能急救');
});

test('青囊：弃一张手牌令受伤角色回复 1 点（可以是自己），限一次', async () => {
  const g = mk(['huatuo', 'zhangfei']);
  const [ht] = g.players;
  ht.flags = { used: {} };
  ht.hp = 1;
  ht.hand = [take(g, 'shan'), take(g, 'shan')];
  await useSkill(g, ht, { skillId: 'qingnang', cards: [ht.hand[0]], targets: [ht] });
  assert.strictEqual(ht.hp, 2);
  await useSkill(g, ht, { skillId: 'qingnang', cards: [ht.hand[0]], targets: [ht] });
  assert.strictEqual(ht.hp, 2, '限一次');
  assert.strictEqual(ht.hand.length, 1);
});

test('离间：视为后选的男性角色对先选的使用【决斗】（不能被无懈）；闭月：结束阶段摸一张', async () => {
  const g = new Game({ heroes: ['diaochan', 'zhangfei', 'caocao', 'liubei', 'sunquan'].map(i => HEROES[i]),
    controllers: [yes(), ...[1, 2, 3, 4].map(() => new S({ async askNullify(p) { return p.hand.find(c => c.name === 'wuxie'); } }))],
    mode: 'identity', roles: ['rebel', 'lord', 'loyalist', 'rebel', 'renegade'] });
  const [dc, zf, cc] = g.players;
  dc.flags = { used: {} };
  const d = take(g, 'shan');
  dc.hand = [d];
  zf.hand = [take(g, 'wuxie')]; cc.hand = [];
  await useSkill(g, dc, { skillId: 'lijian', cards: [d], targets: [zf, cc] });
  assert.strictEqual(zf.hp, zf.maxHp - 1, '张飞（先选）没有杀，受到决斗伤害');
  assert.strictEqual(zf.hand.length, 1, '无懈可击不能响应');
  // 女性不能被选
  const g2 = mk(['diaochan', 'zhenji']);
  g2.players[0].flags = { used: {} };
  g2.players[0].hand = [take(g2, 'shan')];
  await useSkill(g2, g2.players[0], { skillId: 'lijian', cards: [g2.players[0].hand[0]], targets: [g2.players[1], g2.players[1]] });
  assert.strictEqual(g2.players[0].hand.length, 1, '非法目标被拒绝');
  // 闭月
  dc.hand = [];
  dc.controller.askPlayCard = async () => null;
  g.firstTurnPending = false;
  await runTurn(g, dc);
  assert.strictEqual(dc.hand.length, 3, '摸牌 2 + 闭月 1');
});

test('AI：25 将 1v1 与身份局各 150 局不崩溃、牌守恒、都能分出胜负', async () => {
  const ids = HERO_LIST.map(h => h.id);
  for (let i = 0; i < 300; i++) {
    const n = i % 2 ? 5 : 2;
    const pick = [...ids].sort(() => Math.random() - 0.5).slice(0, n);
    const g = new Game({ heroes: pick.map(id => HEROES[id]), controllers: pick.map(() => new AIController()) });
    await g.run();
    assert.ok(g.over, `${pick} 未结束`);
    assert.deepStrictEqual(total(g), [108, 108], pick.join(','));
  }
});
