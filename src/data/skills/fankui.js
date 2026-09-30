// 司马懿·反馈：受到伤害后，可获得伤害来源的一张牌
// 「角色的牌」指手牌与装备区的牌，不含判定区（手牌不可见故随机取一张）
import { hasCard, cardLabel } from '../cards.js';

export default {
  id: 'fankui',
  hero: 'simayi',
  hooks: [
    {
      trigger: 'damaged',
      canTrigger: (ctx, game, owner) =>
        ctx.target === owner && ctx.source && ctx.source.alive && hasCard(ctx.source),
      handler: async (ctx, game, owner) => {
        const invoke = await game.ask(owner, 'askSkillInvoke', 'fankui', { source: ctx.source });
        if (!invoke) return null;
        game.log(`${owner.name} 发动【反馈】`);
        game.pointAt(owner, [ctx.source]);
        const pick = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'target-area', reason: 'fankui', noJudge: true, info: { target: ctx.source },
        });
        if (!pick || pick.length !== 1) return null;
        const zone = pick[0];
        // 只接受手牌或装备栏位，拒绝判定区
        if (zone !== 'hand' && !ctx.source.equip[zone]) return null;
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
