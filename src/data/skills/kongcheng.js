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
        const cname = ctx.card.name === 'sha' ? '杀' : '决斗';
        game.log(`【空城】生效，${owner.name} 不能成为【${cname}】的目标`);
        return { blocked: true };
      },
    },
  ],
};
