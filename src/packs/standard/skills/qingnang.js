import { defineSkill, skillTargetCandidates } from '../../../core/registry.js';
import { discardFor } from '../../../core/card-use.js';
import { isFriend, relationOf, lowest, value } from '../../../ai/util.js';

const wounded = t => t.hp < t.maxHp;

export default defineSkill({
  id: 'qingnang', name: '青囊', desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力。',
  active: {
    cards: { min: 1, max: 1, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => wounded(t) },
    limit: { phase: 1 },
    usable: (g, p) => p.hand.length > 0,
    run(game, player, { cards, targets }) {
      const t = targets[0];
      const label = discardFor(game, player, cards);
      game.skillLog(player, 'qingnang', `，弃置 ${label}，令 ${t === player ? '自己' : t.name} 回复 1 点体力`);
      if (t !== player) { game.pointAt(player, [t]); game.recordRelation(player, t, 'help', 2); }
      game.heal(t, 1);
    },
  },
  ai: {
    order: 100,
    // 回复自己或友方
    play(game, p) {
      const low = lowest(p.hand, 1);
      const cands = skillTargetCandidates(game, p, 'qingnang');
      const t = cands.find(x => x === p) || cands.filter(x => isFriend(game, p, x) && relationOf(game, p, x) >= 1)
        .sort((a, b) => a.hp - b.hp)[0];
      return t && low[0] && value(low[0]) < 9 ? { skillId: 'qingnang', cards: low, targets: [t] } : null;
    },
  },
  prompt: {
    active: () => '【青囊】请选择一张手牌弃置，再选择一名已受伤的角色',
    target: (picked, h) => (picked.length ? `【青囊】令 ${h.names(picked)} 回复 1 点体力，点击「确定」` : '【青囊】请选择一名已受伤的角色（可以是自己）'),
  },
});
