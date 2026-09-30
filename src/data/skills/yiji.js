// 郭嘉·遗计：每受到 1 点伤害，可以观看牌堆顶的两张牌，然后将其分配给任意角色
import { cardLabel } from '../cards.js';

export default {
  id: 'yiji',
  hooks: [{
    trigger: 'damaged',
    canTrigger: (ctx, game, owner) => ctx.target === owner && owner.alive && !game.over,
    handler: async (ctx, game, owner) => {
      for (let i = 0; i < ctx.amount && owner.alive && !game.over; i++) {
        if (!await game.ask(owner, 'askSkillInvoke', 'yiji', {})) return null;
        const cards = [game.drawOne(), game.drawOne()].filter(Boolean);
        game.log(`${owner.name} 发动【遗计】，观看牌堆顶的 ${cards.length} 张牌`);
        // 逐张分配：每张牌选择交给哪名角色（可以是自己）
        for (const c of cards) {
          const candidates = game.alivePlayers();
          const pick = await game.ask(owner, 'askChoosePlayers', {
            reason: 'yiji', candidates, min: 1, max: 1, optional: false, info: { card: c },
          });
          const to = candidates.includes(pick?.[0]) ? pick[0] : owner;
          to.hand.push(c);
          if (to === owner) game.log(`${owner.name} 将一张牌留给自己`);
          else {
            game.log(`${owner.name} 将 ${cardLabel(c)} 交给 ${to.name}`);
            game.lastGive = { ids: [c.id], to: to.seat };
            game.recordRelation(owner, to, 'help', 0.5);
          }
        }
        game.notify();
      }
      return null;
    },
  }],
};
