import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'xiaoji', name: '枭姬', desc: '当你失去装备区里的一张牌时，你可以摸两张牌。',
  triggers: {
    afterLoseCards: {
      optional: false, // 每失去一张装备分别询问
      can: (ctx, owner) => ctx.player === owner && ctx.equips > 0,
      async run(ctx, owner, game) {
        for (let i = 0; i < ctx.equips && owner.alive && !game.over; i++) {
          if (!await game.invoke(owner, 'xiaoji')) return;
          game.skillLog(owner, 'xiaoji');
          game.drawCards(owner, 2);
        }
      },
    },
  },
  ai: { invoke: () => true },
});
