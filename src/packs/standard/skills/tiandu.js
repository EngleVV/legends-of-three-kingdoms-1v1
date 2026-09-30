import { defineSkill } from '../../../core/registry.js';
import { cardLabel } from '../../../data/cards.js';

export default defineSkill({
  id: 'tiandu', name: '天妒', desc: '你的判定牌生效后，你可以获得此牌。',
  triggers: {
    afterJudge: {
      can: (ctx, owner, game) => ctx.player === owner && game.deck.discardPile.some(c => c.id === ctx.card.id),
      info: ctx => ({ card: ctx.card }),
      run(ctx, owner, game) {
        const got = game.takeFromDiscard(ctx.card);
        if (!got) return;
        owner.hand.push(got);
        game.skillLog(owner, 'tiandu', `，获得判定牌 ${cardLabel(got)}`);
      },
    },
  },
  ai: { invoke: () => true },
  prompt: { invoke: (info, h) => [`是否发动【天妒】获得判定牌 ${info.card ? h.label(info.card) : ''}？`, ''] },
});
