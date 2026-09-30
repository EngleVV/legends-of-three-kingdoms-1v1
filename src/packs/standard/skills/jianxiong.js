import { defineSkill } from '../../../core/registry.js';
import { realsOf } from '../../../core/util.js';
import { cardLabel } from '../../../data/cards.js';

export default defineSkill({
  id: 'jianxiong', name: '奸雄', desc: '你受到伤害后，可以获得对你造成伤害的牌。',
  triggers: {
    damaged: {
      can: (ctx, owner) => ctx.target === owner && !!ctx.card,
      info: ctx => ({ card: ctx.card }),
      run(ctx, owner, game) {
        // 伤害牌可能是虚拟牌：丈八蛇矛的【杀】由两张实体牌合成，应一并获得（放入实体牌而非虚拟牌）
        const got = realsOf(ctx.card).filter(c => game.takePending(c));
        if (got.length) {
          owner.hand.push(...got);
          game.skillLog(owner, 'jianxiong', `，获得 ${got.map(cardLabel).join('、')}`);
        } else {
          game.log(`${owner.name} 无法获得该牌`);
        }
      },
    },
  },
  ai: { invoke: () => true },
  prompt: { invoke: (info, h) => ['是否发动【奸雄】？', `获得对你造成伤害的 ${info.card ? h.cards(info.card) : '牌'}`] },
});
