import { defineSkill } from '../../../core/registry.js';
import { cardLabel, judgeEffective, isRed } from '../../../data/cards.js';
import { doJudge } from '../../../core/judge.js';

export default defineSkill({
  id: 'luoshen', name: '洛神',
  desc: '准备阶段，你可以进行一次判定，若结果为黑色，你获得此牌，然后你可以重复此流程，直到出现红色的判定结果。',
  judge: { name: '洛神', effective: c => !isRed(c), good: true, desc: '黑色：获得判定牌并可继续' },
  triggers: {
    phaseStart: {
      optional: false, // 每次判定前分别询问
      can: (ctx, owner) => ctx.player === owner && ctx.phase === 'prepare',
      async run(ctx, owner, game) {
        for (let guard = 0; guard < 30 && owner.alive && !game.over; guard++) {
          if (!await game.invoke(owner, 'luoshen')) return;
          game.skillLog(owner, 'luoshen');
          const jc = await doJudge(game, owner, '洛神');
          if (!judgeEffective('洛神', jc)) {
            game.log(`【洛神】判定为 ${cardLabel(jc)}（红色），结束`);
            return;
          }
          const got = game.takeFromDiscard(jc);
          if (got) {
            owner.hand.push(got);
            game.log(`${owner.name} 获得 ${cardLabel(got)}`);
          }
        }
      },
    },
  },
  ai: { invoke: () => true },
});
