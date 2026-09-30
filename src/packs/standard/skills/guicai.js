import { defineSkill, judgeSpec } from '../../../core/registry.js';
import { replaceJudgeCard } from '../../../core/judge.js';
import { isFriend, isEnemy } from '../../../ai/util.js';

export default defineSkill({
  id: 'guicai', name: '鬼才', desc: '在任意角色的判定牌生效前，你可以打出一张手牌代替之。',
  triggers: {
    beforeJudge: {
      optional: false, // 在选牌时可以放弃，无需先询问是否发动
      can: (ctx, owner) => owner.hand.length > 0,
      async run(ctx, owner, game) {
        const pick = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'self', reason: 'guicai', optional: true,
          info: { judgeCard: ctx.card, reason: ctx.reason, player: ctx.player },
        });
        const card = pick?.[0];
        if (card && owner.hand.some(h => h.id === card.id)) replaceJudgeCard(game, ctx, owner, card, 'guicai');
      },
    },
  },
  ai: {
    // 判定者是自己或友方时求有利结果，是敌人时求不利结果，未知则不插手
    chooseCards(game, p, opts) {
      const { judgeCard, reason, player: judger } = opts.info;
      const spec = judgeSpec(reason);
      if (!spec) return null;
      const good = c => (spec.good ? spec.effective(c) : !spec.effective(c));
      const mine = !judger || judger === p || isFriend(game, p, judger);
      if (!mine && !isEnemy(game, p, judger)) return null;
      const want = mine ? good : (c => !good(c));
      if (want(judgeCard)) return null; // 当前结果已合意，不必消耗手牌
      // 保守：除闪电（3 点伤害，值得押注）外，留一张手牌
      if (p.hand.length < (reason === '闪电' ? 1 : 2)) return null;
      const c = p.hand.find(x => want(x) && x.name !== 'tao' && x.name !== 'wuxie');
      return c ? [c] : null;
    },
  },
  prompt: {
    chooseCards: (opts, h) => {
      const { judgeCard, reason, player } = opts.info;
      return [`${h.who(player)}的【${reason}】判定牌为 ${h.label(judgeCard)}，是否发动【鬼才】打出一张手牌替换之？`,
        judgeSpec(reason)?.desc || '', '不发动'];
    },
  },
});
