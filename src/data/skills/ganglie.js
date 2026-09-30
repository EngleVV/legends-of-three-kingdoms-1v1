// 夏侯惇·刚烈：受到伤害后可判定，非红桃则伤害来源选择：弃置两张手牌，或受到你造成的 1 点伤害
import { cardLabel, judgeEffective } from '../cards.js';
import { doJudge } from '../../core/judge.js';
import { applyDamage } from '../../core/damage.js';

export default {
  id: 'ganglie',
  hooks: [{
    trigger: 'damaged',
    canTrigger: (ctx, game, owner) => ctx.target === owner && !!ctx.source && ctx.source.alive && !game.over,
    handler: async (ctx, game, owner) => {
      const src = ctx.source;
      if (!await game.ask(owner, 'askSkillInvoke', 'ganglie', { source: src })) return null;
      game.log(`${owner.name} 发动【刚烈】`);
      game.pointAt(owner, [src]);
      const jc = await doJudge(game, owner, '刚烈');
      if (!judgeEffective('刚烈', jc)) {
        game.log(`【刚烈】判定为 ${cardLabel(jc)}（红桃），无效果`);
        return null;
      }
      if (!src.alive || game.over) return null;
      if (src.hand.length >= 2) {
        const give = await game.ask(src, 'askChooseCards', {
          count: 2, from: 'self', reason: 'ganglie', optional: true, info: { source: owner },
        });
        const cards = (give || []).filter(c => src.hand.some(h => h.id === c?.id));
        if (cards.length === 2 && cards[0].id !== cards[1].id) {
          src.removeFromHand(cards);
          game.discardCards(cards);
          game.log(`${src.name} 弃置 ${cards.map(cardLabel).join('、')}`);
          return null;
        }
      }
      game.recordRelation(owner, src, 'harm');
      await applyDamage(game, owner, src, 1, null, 'normal', '刚烈');
      return null;
    },
  }],
};
