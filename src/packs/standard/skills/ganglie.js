import { defineSkill, skillDesc } from '../../../core/registry.js';
import { cardLabel, judgeEffective } from '../../../data/cards.js';
import { doJudge } from '../../../core/judge.js';
import { applyDamage } from '../../../core/damage.js';
import { isFriend, lowest } from '../../../ai/util.js';

export default defineSkill({
  id: 'ganglie', name: '刚烈',
  desc: '你受到伤害后，可以进行一次判定，若结果不为红桃，则伤害来源选择一项：弃置两张手牌，或受到你造成的 1 点伤害。',
  judge: { name: '刚烈', effective: c => c.suit !== '♥', good: true, desc: '非红桃：伤害来源弃两张手牌或受到 1 点伤害' },
  triggers: {
    damaged: {
      can: (ctx, owner) => ctx.target === owner && !!ctx.source && ctx.source.alive,
      info: ctx => ({ source: ctx.source }),
      async run(ctx, owner, game) {
        const src = ctx.source;
        game.skillLog(owner, 'ganglie');
        game.pointAt(owner, [src]);
        const jc = await doJudge(game, owner, '刚烈');
        if (!judgeEffective('刚烈', jc)) {
          game.log(`【刚烈】判定为 ${cardLabel(jc)}（红桃），无效果`);
          return;
        }
        if (!src.alive || game.over) return;
        // 伤害来源选择：弃置两张手牌（选牌）或受到伤害（取消）
        if (src.hand.length >= 2) {
          const give = await game.ask(src, 'askChooseCards', {
            count: 2, from: 'self', reason: 'ganglie', optional: true, info: { source: owner },
          });
          const cards = (give || []).filter(c => src.hand.some(h => h.id === c?.id));
          if (cards.length === 2 && cards[0].id !== cards[1].id) {
            src.removeFromHand(cards);
            game.discardCards(cards);
            game.log(`${src.name} 弃置 ${cards.map(cardLabel).join('、')}`);
            return;
          }
        }
        game.recordRelation(owner, src, 'harm');
        await applyDamage(game, owner, src, 1, null, 'normal', '刚烈');
      },
    },
  },
  ai: {
    invoke: (game, p, info) => game.mode !== 'identity' || !isFriend(game, p, info.source),
    // 伤害来源：残血或手牌多时弃两张，否则选择受到伤害
    chooseCards: (game, p) => (p.hp <= 1 || p.hand.length >= 4 ? lowest(p.hand, 2) : null),
  },
  prompt: {
    invoke: (info, h) => [`是否对 ${h.who(info.source)} 发动【刚烈】？`, skillDesc('ganglie')],
    chooseCards: (opts, h, n) => [`${h.who(opts.info?.source)} 发动了【刚烈】，请弃置两张手牌，否则受到其造成的 1 点伤害（已选 ${n}/2）`, '', '受到伤害'],
  },
});
