// 曹操·奸雄：受到伤害后，可获得对自己造成伤害的牌
import { realsOf } from '../../core/util.js';
import { cardLabel } from '../cards.js';

export default {
  id: 'jianxiong',
  hero: 'caocao',
  hooks: [
    {
      trigger: 'damaged',
      canTrigger: (ctx, game, owner) => !!ctx.card && ctx.target === owner && !game.over,
      handler: async (ctx, game, owner) => {
        const invoke = await game.ask(owner, 'askSkillInvoke', 'jianxiong', { card: ctx.card });
        if (!invoke) return null;
        // 伤害牌可能是虚拟牌：丈八蛇矛的【杀】由两张实体牌合成，应一并获得；
        // 且必须放入实体牌而非虚拟牌，否则手牌里会混入虚拟牌。
        const got = realsOf(ctx.card).filter(c => game.takePending(c));
        if (got.length) {
          owner.hand.push(...got);
          game.log(`${owner.name} 发动【奸雄】，获得 ${got.map(cardLabel).join('、')}`);
        } else {
          game.log(`${owner.name} 无法获得该牌`);
        }
        return null;
      },
    },
  ],
};
