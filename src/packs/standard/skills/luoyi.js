import { defineSkill } from '../../../core/registry.js';
import { canUseAsSha, inAttackRange } from '../../../data/cards.js';
import { isEnemy } from '../../../ai/util.js';

// 状态：turn 作用域 { on }——本回合【杀】/【决斗】造成的伤害 +1
export default defineSkill({
  id: 'luoyi', name: '裸衣', desc: '摸牌阶段，你可以少摸一张牌，若如此做，本回合你使用【杀】或【决斗】对目标造成的伤害 +1。',
  triggers: {
    drawPhase: {
      can: (ctx, owner) => ctx.player === owner && !ctx.done && ctx.count > 0,
      run(ctx, owner, game) {
        ctx.count -= 1;
        owner.st('turn', 'luoyi').on = true;
        game.skillLog(owner, 'luoyi', '，少摸一张牌，本回合【杀】/【决斗】伤害 +1');
      },
    },
    beforeDamage: {
      locked: true,
      can: (ctx, owner) => ctx.source === owner && !!owner.st('turn', 'luoyi').on && ['sha', 'juedou'].includes(ctx.card?.name),
      run(ctx) { ctx.amount += 1; },
    },
  },
  ai: {
    // 手里有【杀】或【决斗】且有敌人可打时发动
    invoke: (game, p) => {
      const hasAtk = p.hand.some(c => c.name === 'sha' || c.name === 'juedou' || canUseAsSha(p, c, game));
      return hasAtk && game.others(p).some(o => isEnemy(game, p, o) && inAttackRange(p, o, game));
    },
  },
});
