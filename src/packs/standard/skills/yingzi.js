import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'yingzi', name: '英姿', desc: '摸牌阶段，你可以多摸一张牌。',
  triggers: {
    drawPhase: {
      can: (ctx, owner) => ctx.player === owner && !ctx.done,
      run(ctx, owner, game) {
        ctx.count += 1;
        game.skillLog(owner, 'yingzi', '，多摸一张牌');
      },
    },
  },
  ai: { invoke: () => true },
});
