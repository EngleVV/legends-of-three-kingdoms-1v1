import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'keji', name: '克己', desc: '若你于出牌阶段内没有使用或打出过【杀】，你可以跳过此回合的弃牌阶段。',
  triggers: {
    beforePhase: {
      can: (ctx, owner) => ctx.player === owner && ctx.phase === 'discard' && ctx.excess > 0
        && !owner.flags.shaUsed && !owner.flags.shaPlayed,
      run(ctx, owner, game) {
        game.skillLog(owner, 'keji', '，跳过弃牌阶段');
        ctx.skip = true;
      },
    },
  },
  ai: { invoke: () => true },
});
