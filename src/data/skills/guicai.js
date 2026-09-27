// 司马懿·鬼才：当一名角色（含他人）的判定牌生效前，可用一张手牌替换之
export default {
  id: 'guicai',
  hero: 'simayi',
  hooks: [
    {
      trigger: 'beforeJudge',
      canTrigger: (ctx, game, owner) => owner.alive && owner.hand.length > 0 && !game.over,
      handler: async (ctx, game, owner) => {
        const card = await game.ask(owner, 'askChooseJudgeReplace', {
          judgeCard: ctx.judgeCard, reason: ctx.reason, player: ctx.player,
        });
        if (card && owner.hand.some(h => h.id === card.id)) {
          return { card };
        }
        return null;
      },
    },
  ],
};
