import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'biyue', name: '闭月', desc: '结束阶段，你可以摸一张牌。',
  triggers: {
    phaseStart: {
      can: (ctx, owner) => ctx.player === owner && ctx.phase === 'end',
      run(ctx, owner, game) {
        game.skillLog(owner, 'biyue');
        game.drawCards(owner, 1);
      },
    },
  },
  ai: { invoke: () => true },
});
