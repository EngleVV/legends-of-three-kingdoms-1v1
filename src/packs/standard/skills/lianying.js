import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'lianying', name: '连营', desc: '当你失去最后的手牌时，你可以摸一张牌。',
  triggers: {
    afterLoseCards: {
      can: (ctx, owner) => ctx.player === owner && ctx.lastHand,
      run(ctx, owner, game) {
        game.skillLog(owner, 'lianying');
        game.drawCards(owner, 1);
      },
    },
  },
  ai: { invoke: () => true },
});
