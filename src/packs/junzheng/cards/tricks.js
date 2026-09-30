// 军争篇锦囊：火攻、铁索连环、兵粮寸断
import { defineCard } from '../../../core/registry.js';
import { resolveTrick } from '../../../core/nullify-chain.js';
import { applyDamage } from '../../../core/damage.js';
import { doJudge } from '../../../core/judge.js';
import { cardLabel, judgeEffective, judgeName, legalTargets } from '../../../data/cards.js';
import { enemyFor, isEnemy, byThreat, lowest, value } from '../../../ai/util.js';

const SUIT_CN = { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方片' };

// ---------- 火攻 ----------
export const huogong = defineCard({
  id: 'huogong', name: '火攻', type: 'trick', harmful: true, harm: 1,
  desc: '出牌阶段，对一名有手牌的角色使用：其展示一张手牌，然后你可以弃置一张与之花色相同的手牌，对其造成 1 点火焰伤害。',
  target: { self: true, ok: (game, from, to) => to.hand.length > 0 },
  async use(game, { player, card, reals, targets }) {
    const t = targets[0];
    // 挂起：造成伤害后奸雄可获得此牌
    game.discardCards(reals, { pending: true });
    await resolveTrick(game, {
      card: reals[0] || card, source: player, target: t, name: '火攻',
      apply: async () => {
        if (!t.hand.length) return;
        const pick = await game.ask(t, 'askChooseCards', {
          count: 1, from: 'self', reason: 'huogong', info: { source: player, stage: 'show' },
        });
        const shown = t.hand.find(c => c.id === pick?.[0]?.id) || t.hand[Math.floor(Math.random() * t.hand.length)];
        game.log(`${t.name} 展示了 ${cardLabel(shown)}`);
        if (game.lastAction) game.lastAction.spent = [shown];
        game.notify();
        if (!player.alive || game.over) return;
        const cands = player.hand.filter(c => c.suit === shown.suit && c.id !== shown.id);
        if (!cands.length) { game.log(`${player.name} 没有${SUIT_CN[shown.suit]}手牌，【火攻】无效果`); return; }
        const d = await game.ask(player, 'askChooseCards', {
          count: 1, from: 'self', reason: 'huogong', optional: true, suit: shown.suit, exclude: [shown.id],
          info: { target: t, shown, stage: 'discard' },
        });
        const c = cands.find(x => x.id === d?.[0]?.id);
        if (!c) { game.log(`${player.name} 不弃置手牌，【火攻】无效果`); return; }
        player.removeFromHand([c]);
        game.discardCards([c]);
        game.log(`${player.name} 弃置 ${cardLabel(c)}`);
        await applyDamage(game, player, t, 1, card, 'fire');
      },
    });
  },
  ai: {
    order: 56, nullify: 'lowHp',
    // 手牌多时才有较大概率凑出同花色
    play: (game, p, use) => {
      if (p.hand.length < 4) return null;
      const t = legalTargets(game, p, use.real, use.name).filter(x => x !== p && isEnemy(game, p, x)).sort(byThreat(game, p))[0];
      return t ? { card: use.card, targets: [t] } : null;
    },
    chooseCards: (game, p, opts) => {
      if (opts.info?.stage === 'show') return lowest(p.hand, 1);
      const t = opts.info?.target;
      if (!t || t === p || !isEnemy(game, p, t)) return null;
      const c = lowest(p.hand.filter(x => x.suit === opts.suit && !(opts.exclude || []).includes(x.id)), 1)[0];
      return c && value(c) < 8 ? [c] : null;
    },
  },
  prompt: {
    chooseCards: (opts, h) => (opts.info?.stage === 'show'
      ? [`${h.who(opts.info.source)} 对你使用了【火攻】，请展示一张手牌`, '对方弃置一张同花色手牌即可对你造成 1 点火焰伤害']
      : [`【火攻】${h.who(opts.info?.target)} 展示了 ${h.label(opts.info?.shown)}，是否弃置一张${SUIT_CN[opts.suit]}手牌对其造成 1 点火焰伤害？`, '', '不弃置']),
  },
});

// ---------- 铁索连环 ----------
export const tiesuo = defineCard({
  id: 'tiesuo', name: '铁索连环', type: 'trick', recast: true,
  desc: '出牌阶段，选择一至两名角色，分别横置或重置之；或将此牌重铸（置入弃牌堆并摸一张牌）。处于连环状态的角色受到属性伤害后，伤害传导给其他处于连环状态的角色。',
  target: { self: true, min: 1, max: 2 },
  async use(game, { player, card, reals, targets }) {
    game.discardCards(reals);
    const order = game.seatOrder(player).filter(p => targets.some(t => t.seat === p.seat));
    for (const t of order) {
      if (game.over) break;
      if (!t.alive) continue;
      await resolveTrick(game, {
        card: reals[0] || card, source: player, target: t, name: '铁索连环',
        apply: async () => {
          t.chained = !t.chained;
          game.log(`${t.name} ${t.chained ? '被横置（进入连环状态）' : '被重置（解除连环状态）'}`);
        },
      });
    }
  },
  ai: {
    order: 150, value: 3,
    // 自己被连环时先解开；能同时连上两名敌人时连上；否则重铸换牌
    play: (game, p, use) => {
      if (p.chained) return { card: use.card, targets: [p] };
      const foes = game.others(p).filter(o => isEnemy(game, p, o) && !o.chained).sort(byThreat(game, p));
      if (foes.length >= 2) return { card: use.card, targets: foes.slice(0, 2) };
      return use.card === use.real ? { card: use.real, recast: true } : null;
    },
  },
  prompt: {
    firstTarget: '【铁索连环】请选择一至两名角色（横置或重置），或点击「重铸」',
    use: () => '【铁索连环】请选择目标，或点击「重铸」',
  },
});

// ---------- 兵粮寸断 ----------
const hasDelayed = (p, name) => p.judgeZone.some(c => judgeName(c) === name);

export const bingliang = defineCard({
  id: 'bingliang', name: '兵粮寸断', type: 'delayed', harmful: true, harm: 1,
  desc: '出牌阶段，对距离为 1 的一名其他角色使用，将此牌置于其判定区。判定阶段进行判定：若结果不为梅花，其跳过摸牌阶段。',
  target: { distance: 1, ok: (game, from, to) => !hasDelayed(to, 'bingliang') },
  judge: { name: '兵粮寸断', effective: c => c.suit !== '♣', good: false, desc: '非梅花：跳过摸牌阶段' },
  use(game, { targets, reals }) {
    if (reals[0].name !== 'bingliang') reals[0].delayedAs = 'bingliang';
    targets[0].judgeZone.push(reals[0]);
  },
  async judgePhase(game, player, jc) {
    await resolveTrick(game, {
      card: jc, source: null, target: player, name: '兵粮寸断',
      apply: async () => {
        const j = await doJudge(game, player, '兵粮寸断');
        if (judgeEffective('兵粮寸断', j)) {
          player.flags.skipDraw = true;
          game.log(`【兵粮寸断】判定为 ${cardLabel(j)}（非梅花），生效，${player.name} 跳过摸牌阶段`);
        } else {
          game.log(`【兵粮寸断】判定为 ${cardLabel(j)}（梅花），失效`);
        }
      },
    });
    return false;
  },
  ai: {
    order: 21, nullify: 'always',
    play: (game, p, use) => {
      const t = enemyFor(game, p, use);
      return t ? { card: use.card, targets: [t] } : null;
    },
  },
});

export default [huogong, tiesuo, bingliang];
