import { defineSkill } from '../../../core/registry.js';
import { isEnemy } from '../../../ai/util.js';

export default defineSkill({
  id: 'tuxi', name: '突袭', desc: '摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色的各一张手牌。',
  triggers: {
    drawPhase: {
      optional: false, // 选择角色时可以放弃
      can: (ctx, owner, game) => ctx.player === owner && !ctx.done && game.others(owner).some(o => o.hand.length),
      async run(ctx, owner, game) {
        const candidates = game.others(owner).filter(o => o.hand.length > 0);
        const pick = await game.ask(owner, 'askChoosePlayers', {
          reason: 'tuxi', candidates, min: 1, max: 2, optional: true,
        });
        const chosen = (pick || []).filter(t => candidates.includes(t)).slice(0, 2);
        if (!chosen.length) return;
        game.skillLog(owner, 'tuxi', `，放弃摸牌，获得 ${chosen.map(t => t.name).join('、')} 的各一张手牌`);
        game.pointAt(owner, chosen);
        for (const t of chosen) {
          const c = game.takeCardFromArea(t, 'hand');
          if (c) owner.hand.push(c);
          game.recordRelation(owner, t, 'harm');
        }
        ctx.done = true;
        ctx.count = 0;
      },
    },
  },
  ai: {
    // 两名敌人才划算（否则不如正常摸两张）
    choosePlayers: (game, p, opts) => {
      const foes = opts.candidates.filter(t => isEnemy(game, p, t)).sort((a, b) => b.hand.length - a.hand.length);
      return foes.length >= 2 ? foes.slice(0, opts.max) : null;
    },
  },
  prompt: {
    choosePlayers: (opts, h, picked) => [picked.length
      ? `【突袭】获得 ${h.names(picked)} 的各一张手牌，点击「确定」`
      : `【突袭】放弃摸牌，改为获得至多 ${opts.max} 名其他角色的各一张手牌？`, '点击武将选择（再次点击取消），点「不发动」正常摸牌'],
  },
});
