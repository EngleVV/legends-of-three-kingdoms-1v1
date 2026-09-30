// 提示栏文案：官方口吻「谁对你用了什么 → 你需要打出什么」，以及非自己操作时的等待提示
import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { Controller } from '../src/controller.js';
import { HEROES } from '../src/data/heroes.js';
import { bannerHtml, waitingText } from '../src/ui/render.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function setup(h1 = 'caocao', h2 = 'lvbu') {
  const g = new Game({ heroes: [HEROES[h1], HEROES[h2]], controllers: [new Controller(), new Controller()] });
  return { g, me: g.players[0], opp: g.players[1] };
}
const pend = (mode, opts = {}, extra = {}) => ({ pending: { mode, opts, selected: [], skillId: null, asSha: false, ...extra } });
const card = name => ({ id: 1, name, suit: '♠', rank: 7, type: 'basic' });

test('响应【杀】：写明使用者与所需牌，无双提示第几张', () => {
  const { g, opp } = setup();
  const s = text(bannerHtml(g, pend('respond', { req: { type: 'shan', reason: 'sha', info: { source: opp, nth: 1, need: 2 } } })));
  assert.match(s, /吕布 对你使用了【杀】，请打出一张【闪】/);
  assert.match(s, /无双：共需 2 张，这是第 1 张/);
  assert.match(s, /不出/);
});

test('南蛮/万箭/决斗/借刀：写明来源与后果', () => {
  const { g, me, opp } = setup();
  const r = (type, reason, info) => text(bannerHtml(g, pend('respond', { req: { type, reason, info } })));
  assert.match(r('sha', 'nanman', { source: opp }), /吕布 使用了【南蛮入侵】，请打出一张【杀】，否则受到 1 点伤害/);
  assert.match(r('shan', 'wanjian', { source: opp }), /吕布 使用了【万箭齐发】，请打出一张【闪】/);
  assert.match(r('sha', 'juedou', { vs: opp, source: opp, nth: 1, need: 2 }), /你与 吕布 决斗中.*第 1 张/);
  assert.match(r('sha', 'jiedao', { source: opp, victim: opp }), /借刀杀人.*请对 吕布 使用一张【杀】/);
});

test('濒死：写明还需几个【桃】', () => {
  const { g, me } = setup();
  me.hp = -1;
  assert.match(text(bannerHtml(g, pend('peach', { info: { dying: me } }))), /你处于濒死状态，还需 2 个【桃】/);
});

test('无懈可击：写明哪张锦囊将对谁生效', () => {
  const { g, me, opp } = setup();
  const s = text(bannerHtml(g, pend('nullify', { effect: { source: opp, target: me, name: '过河拆桥' } })));
  assert.match(s, /吕布 使用的【过河拆桥】即将对 你 生效，是否使用【无懈可击】/);
  const s2 = text(bannerHtml(g, pend('nullify', { effect: { source: opp, target: me, name: '乐不思蜀', isNullify: true } })));
  assert.match(s2, /吕布 使用了【无懈可击】，【乐不思蜀】即将失效/);
});

test('出牌阶段：未选牌 / 选中需目标的牌 / 选中无需目标的牌 / 弃牌阶段', () => {
  const { g, me } = setup();
  g.currentTurnSeat = 0; g.currentPhase = 'play';
  me.flags = { shaUsed: 0 }; me.hand = [card('sha')];
  assert.match(text(bannerHtml(g, pend('play'))), /出牌阶段，请选择一张卡牌/);
  assert.match(text(bannerHtml(g, pend('play', {}, { selected: [me.hand[0]] }))), /请选择【杀】的目标/);
  me.hp = 2;
  const tao = { ...card('tao'), suit: '♥' };
  me.hand = [tao];
  assert.match(text(bannerHtml(g, pend('play', {}, { selected: [tao] }))), /是否使用【桃】回复 1 点体力/);
  me.hand = [card('shan')];
  me.hp = me.maxHp;
  assert.match(text(bannerHtml(g, pend('play'))), /没有可以使用的牌，请点击「结束出牌」/);
  assert.match(text(bannerHtml(g, pend('pick-hand', { opts: { count: 2, reason: 'discard-phase' } }))), /弃牌阶段，请弃置 2 张手牌（已选 0\/2）/);
});

test('等待提示：写明对方正在做什么', () => {
  const { g, opp } = setup();
  g.asking = { player: opp, method: 'askRespondCard', args: [{ type: 'shan' }] };
  assert.strictEqual(waitingText(g), '吕布 思考中：打出【闪】…');
  g.asking = { player: opp, method: 'askNullify', args: [] };
  assert.match(waitingText(g), /是否使用【无懈可击】/);
  g.asking = null; g.currentTurnSeat = 1; g.currentPhase = 'draw';
  assert.match(waitingText(g), /吕布的回合 · 摸牌阶段/);
});
