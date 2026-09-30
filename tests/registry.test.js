// 注册表完整性：新增武将/技能/卡牌/扩展包时，这里会第一时间发现遗漏
//   - 武将引用的技能都已登记；时机名、修正点名都合法
//   - 需要引擎询问「是否发动」的效果都有 AI 决策；主动技能都有出牌决策
//   - 牌堆每张牌都有定义；AI 对局中没有遇到缺失的决策函数
import { test } from 'node:test';
import assert from 'node:assert';
import '../src/packs/index.js';
import {
  PACKS, HERO_LIST, EVENTS, MODIFIERS, MISSING_AI, allSkills, allCards, getSkill, getCard, judgeSpec,
} from '../src/core/registry.js';
import { buildStandardDeck } from '../src/data/cards.js';
import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { heroMatches } from '../src/ui/render.js';

const effects = () => [...allSkills(), ...allCards()];

test('武将：技能都已登记，主公技标记 lord，头像与扩展包已填写', () => {
  assert.ok(PACKS.length >= 1);
  for (const h of HERO_LIST) {
    for (const id of h.skills) {
      assert.ok(getSkill(id), `${h.name} 的技能 ${id} 未登记`);
      assert.ok(!getSkill(id).lord, `${h.name} 的 ${id} 是主公技，应放在 lordSkills`);
    }
    for (const id of h.lordSkills) assert.ok(getSkill(id)?.lord, `${h.name} 的主公技 ${id} 未登记或缺少 lord 标记`);
    assert.ok(h.pack && h.avatar, `${h.name} 缺少扩展包或头像路径`);
    assert.ok(['male', 'female'].includes(h.gender) && h.hp > 0 && h.kingdom, `${h.name} 基础信息不完整`);
  }
});

test('技能与卡牌：名称、描述齐全；时机与修正点名合法', () => {
  for (const e of effects()) {
    assert.ok(e.name, `${e.id} 缺少名称`);
    if (getSkill(e.id)) assert.ok(e.desc, `技能 ${e.id} 缺少描述`);
    for (const ev of Object.keys(e.triggers || {})) {
      assert.ok(EVENTS[ev], `${e.id} 挂在未知时机 ${ev}`);
      assert.strictEqual(typeof e.triggers[ev].run, 'function', `${e.id}.${ev} 缺少 run`);
    }
    for (const k of Object.keys(e.modifiers || {})) assert.ok(MODIFIERS[k], `${e.id} 使用未知修正点 ${k}`);
    for (const v of e.viewAs || []) assert.ok(getCard(v.as), `${e.id} 转化为未知牌 ${v.as}`);
    if (e.judge) assert.strictEqual(judgeSpec(e.judge.name)?.owner, e.id, `${e.id} 的判定未登记`);
  }
});

test('AI：可选发动的效果都有 invoke，主动技能都有 play，可使用的牌都有 play', () => {
  for (const e of effects()) {
    for (const [ev, t] of Object.entries(e.triggers || {})) {
      if (t.optional !== false && !t.locked) assert.ok(e.ai?.invoke, `${e.id}.${ev} 需要询问是否发动，但缺少 ai.invoke`);
    }
    if (e.active) assert.ok(e.ai?.play, `主动技能 ${e.id} 缺少 ai.play`);
  }
  for (const c of allCards()) {
    if (!c.respondOnly) assert.ok(c.ai?.play, `卡牌 ${c.id} 缺少 ai.play`);
    assert.strictEqual(typeof c.use === 'function' || c.respondOnly, true, `卡牌 ${c.id} 缺少 use`);
  }
});

test('牌堆：108 张，每张都有卡牌定义与正确的类别/栏位', () => {
  const deck = buildStandardDeck();
  assert.strictEqual(deck.length, 108);
  for (const c of deck) {
    const def = getCard(c.name);
    assert.strictEqual(c.type, def.type);
    if (def.type === 'equip') assert.ok(['weapon', 'armor', 'horse+', 'horse-'].includes(c.subType), `${c.name} 装备栏位错误`);
  }
});

test('AI 对局：1v1 与身份局均未遇到缺失的决策函数，且牌数守恒', async () => {
  MISSING_AI.clear();
  for (let i = 0; i < 60; i++) {
    const n = i % 2 ? 5 : 2;
    const hs = [...HERO_LIST].sort(() => Math.random() - 0.5).slice(0, n);
    const g = new Game({ heroes: hs, controllers: hs.map(() => new AIController()) });
    await g.run();
    const total = g.deck.cards.length + g.deck.discardPile.length + g.pendingDiscard.length
      + g.players.reduce((s, p) => s + p.allCards().length, 0);
    assert.strictEqual(total, 108, `牌数不守恒：${hs.map(h => h.id).join(',')}`);
  }
  assert.deepStrictEqual([...MISSING_AI], []);
});

test('选将筛选：按扩展包与武将名/技能名搜索', () => {
  const zhuge = HERO_LIST.find(h => h.id === 'zhugeliang');
  assert.ok(heroMatches(zhuge, { pack: 'standard', search: '' }));
  assert.ok(!heroMatches(zhuge, { pack: 'none', search: '' }));
  assert.ok(heroMatches(zhuge, { search: '诸葛' }));
  assert.ok(heroMatches(zhuge, { search: '观星' }), '按技能名搜索');
  assert.ok(!heroMatches(zhuge, { search: '曹' }));
  const lord = HERO_LIST.find(h => h.id === 'liubei');
  assert.ok(heroMatches(lord, { search: '激将' }), '主公技也可搜索');
});
