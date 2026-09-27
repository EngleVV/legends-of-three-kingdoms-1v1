// 诸葛亮·空城：没有手牌时，不能成为【杀】和【决斗】的目标
export default {
  id: 'kongcheng',
  hero: 'zhugeliang',
  hooks: [
    {
      trigger: 'becomeTarget',
      canTrigger: (ctx, game, owner) =>
        ctx.target === owner && owner.hand.length === 0 &&
        (ctx.card.name === 'sha' || ctx.card.name === 'juedou'),
      handler: async (ctx, game, owner) => {
        game.log(`【空城】${owner.name} 不能成为目标`);
        return { blocked: true };
      },
    },
  ],
};
