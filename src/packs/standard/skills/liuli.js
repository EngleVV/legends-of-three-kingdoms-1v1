import { defineSkill } from '../../../core/registry.js';
import { cardLabel, inAttackRange, blockerOf } from '../../../data/cards.js';
import { bestEnemy, lowest, ownCards } from '../../../ai/util.js';

// 新目标：大乔攻击范围内、不是此【杀】的使用者；不能成为【杀】目标的角色（空城）除外
const candidatesOf = (ctx, owner, game) => game.others(owner).filter(p => p.seat !== ctx.source.seat
  && inAttackRange(owner, p, game) && !blockerOf(game, ctx.source, p, 'sha'));

export default defineSkill({
  id: 'liuli', name: '流离',
  desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的一名其他角色（不能是此【杀】的使用者）。',
  triggers: {
    becomingTarget: {
      optional: false, // 选择新目标时可以放弃
      can: (ctx, owner, game) => ctx.target === owner && ownCards(owner).length > 0 && candidatesOf(ctx, owner, game).length > 0,
      async run(ctx, owner, game) {
        const candidates = candidatesOf(ctx, owner, game);
        const pick = await game.ask(owner, 'askChoosePlayers', {
          reason: 'liuli', candidates, min: 1, max: 1, optional: true, info: { source: ctx.source, card: ctx.card },
        });
        const to = pick?.[0];
        if (!to || !candidates.includes(to)) return;
        const give = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'self', reason: 'liuli', optional: false, includeEquip: true, info: { to },
        });
        const own = ownCards(owner);
        const c = own.find(x => x.id === give?.[0]?.id) || owner.hand[0] || own[0];
        owner.removeCards([c]);
        game.discardCards([c]);
        game.skillLog(owner, 'liuli', `，弃置 ${cardLabel(c)}，将【杀】转移给 ${to.name}`);
        game.pointAt(ctx.source, [to]);
        game.recordRelation(owner, to, 'harm');
        ctx.target = to;
      },
    },
  },
  ai: {
    choosePlayers: (game, p, opts) => {
      const t = bestEnemy(game, p, opts.candidates);
      return t ? [t] : null;
    },
    chooseCards: (game, p) => lowest(ownCards(p), 1),
  },
  prompt: {
    choosePlayers: (opts, h, picked) => [picked.length
      ? `【流离】将【杀】转移给 ${h.names(picked)}，点击「确定」后弃置一张牌`
      : `${h.who(opts.info?.source)} 对你使用了【杀】，是否发动【流离】？`, '选择你攻击范围内的一名其他角色（不能是使用者）', '不发动'],
    chooseCards: (opts, h) => [`【流离】请弃置一张牌（含装备区），将【杀】转移给 ${h.who(opts.info?.to)}`, ''],
  },
});
