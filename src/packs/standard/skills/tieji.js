import { defineSkill } from '../../../core/registry.js';
import { doJudge } from '../../../core/judge.js';
import { judgeEffective, isRed } from '../../../data/cards.js';
import { isFriend } from '../../../ai/util.js';

export default defineSkill({
  id: 'tieji', name: '铁骑', desc: '当你使用【杀】指定一名角色为目标后，你可以进行一次判定，若结果为红色，该角色不能使用【闪】响应此【杀】。',
  judge: { name: '铁骑', effective: c => isRed(c), good: true, desc: '红色：目标不能使用【闪】' },
  triggers: {
    targetConfirmed: {
      can: (ctx, owner) => ctx.source === owner,
      info: ctx => ({ target: ctx.target }),
      async run(ctx, owner, game) {
        game.skillLog(owner, 'tieji');
        const jc = await doJudge(game, owner, '铁骑');
        ctx.noShan = judgeEffective('铁骑', jc);
        game.log(ctx.noShan ? `【铁骑】判定为红色，${ctx.target.name} 不能使用【闪】` : '【铁骑】判定为黑色，无效果');
      },
    },
  },
  ai: { invoke: (game, p, info) => game.mode !== 'identity' || !isFriend(game, p, info.target) },
  prompt: { invoke: (info, h) => [`是否对 ${h.who(info.target)} 发动【铁骑】？`, '判定为红色，其不能使用【闪】响应此【杀】'] },
});
