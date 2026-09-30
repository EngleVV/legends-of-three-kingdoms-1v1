import { defineSkill } from '../../../core/registry.js';
import { cardLabel } from '../../../data/cards.js';
import { isFriend, relationOf } from '../../../ai/util.js';

export default defineSkill({
  id: 'yiji', name: '遗计', desc: '你每受到 1 点伤害，可以观看牌堆顶的两张牌，然后将其分配给任意角色。',
  triggers: {
    damaged: {
      optional: false, // 每点伤害分别询问
      can: (ctx, owner) => ctx.target === owner,
      async run(ctx, owner, game) {
        for (let i = 0; i < ctx.amount && owner.alive && !game.over; i++) {
          if (!await game.invoke(owner, 'yiji')) return;
          const cards = [game.drawOne(), game.drawOne()].filter(Boolean);
          game.skillLog(owner, 'yiji', `，观看牌堆顶的 ${cards.length} 张牌`);
          // 逐张分配：每张牌选择交给哪名角色（可以是自己）
          for (const c of cards) {
            const candidates = game.alivePlayers();
            const pick = await game.ask(owner, 'askChoosePlayers', {
              reason: 'yiji', candidates, min: 1, max: 1, optional: false, info: { card: c },
            });
            const to = candidates.includes(pick?.[0]) ? pick[0] : owner;
            to.hand.push(c);
            if (to === owner) game.log(`${owner.name} 将一张牌留给自己`);
            else {
              game.log(`${owner.name} 将 ${cardLabel(c)} 交给 ${to.name}`);
              game.lastGive = { ids: [c.id], to: to.seat };
              game.recordRelation(owner, to, 'help', 0.5);
            }
          }
          game.notify();
        }
      },
    },
  },
  ai: {
    invoke: () => true,
    // 自己手牌多于友方两张以上时分给友方，否则留给自己
    choosePlayers: (game, p, opts) => {
      const pal = opts.candidates.filter(t => t !== p && isFriend(game, p, t) && relationOf(game, p, t) >= 1)
        .sort((a, b) => a.hand.length - b.hand.length)[0];
      return [pal && p.hand.length >= pal.hand.length + 2 ? pal : p];
    },
  },
  prompt: {
    choosePlayers: (opts, h, picked) => [`【遗计】将 ${opts.info?.card ? h.label(opts.info.card) : '这张牌'} 交给一名角色${picked.length ? `：${h.names(picked)}` : ''}`, '可以交给自己'],
  },
});
