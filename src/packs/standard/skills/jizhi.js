import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'jizhi', name: '集智', desc: '当你使用一张非延时锦囊牌时，你可以摸一张牌。',
  triggers: {
    cardUsed: {
      can: (ctx, owner) => ctx.player === owner && ctx.card.type === 'trick',
      run(ctx, owner, game) {
        game.skillLog(owner, 'jizhi');
        game.drawCards(owner, 1);
      },
    },
  },
  ai: { invoke: () => true },
});
