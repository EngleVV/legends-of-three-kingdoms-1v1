// 司马懿·反馈：受到伤害后，可获得伤害来源的一张牌
// 官方未限定手牌，装备区与判定区的牌同样可以获得（手牌不可见故随机取一张）
import { hasCardInArea, cardLabel } from '../cards.js';

export default {
  id: 'fankui',
  hero: 'simayi',
  hooks: [
    {
      trigger: 'damaged',
      canTrigger: (ctx, game, owner) =>
        ctx.target === owner && ctx.source && ctx.source.alive && hasCardInArea(ctx.source),
      handler: async (ctx, game, owner) => {
        const invoke = await game.ask(owner, 'askSkillInvoke', 'fankui', { source: ctx.source });
        if (!invoke) return null;
        game.log(`${owner.name} 发动【反馈】`);
        const pick = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'target-area', reason: 'fankui', info: { target: ctx.source },
        });
        if (!pick || pick.length !== 1) return null;
        const zone = pick[0];
        const c = game.takeCardFromArea(ctx.source, zone);
        if (c) {
          owner.hand.push(c);
          // 1v1 中获得方或失去方必为玩家本人，这张牌玩家本就可知，故写明
          game.log(`${owner.name} 获得了 ${ctx.source.name} 的${zone === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
        }
        return null;
      },
    },
  ],
};
