// 「角色的牌」指手牌与装备区的牌，不含判定区（手牌不可见故随机取一张）
import { defineSkill } from '../../../core/registry.js';
import { hasCard, cardLabel } from '../../../data/cards.js';
import { isFriend, pickArea } from '../../../ai/util.js';

export default defineSkill({
  id: 'fankui', name: '反馈', desc: '你受到伤害后，可以获得伤害来源的一张牌。',
  triggers: {
    damaged: {
      can: (ctx, owner) => ctx.target === owner && !!ctx.source && ctx.source.alive && hasCard(ctx.source),
      info: ctx => ({ source: ctx.source }),
      async run(ctx, owner, game) {
        const src = ctx.source;
        game.skillLog(owner, 'fankui');
        game.pointAt(owner, [src]);
        const pick = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'target-area', reason: 'fankui', noJudge: true, info: { target: src },
        });
        const zone = pick?.[0];
        // 只接受手牌或装备栏位，拒绝判定区
        if (!zone || (zone !== 'hand' && !src.equip[zone])) return;
        const c = game.takeCardFromArea(src, zone);
        if (!c) return;
        owner.hand.push(c);
        game.log(`${owner.name} 获得了 ${src.name} 的${zone === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
      },
    },
  },
  ai: {
    // 不拿友方的牌
    invoke: (game, p, info) => game.mode !== 'identity' || !isFriend(game, p, info.source),
    chooseCards: (game, p, opts) => pickArea(game, p, opts),
  },
  prompt: {
    invoke: (info, h) => ['是否发动【反馈】？', `获得 ${h.who(info.source)} 的一张牌（手牌或装备）`],
    zone: '获得',
  },
});
