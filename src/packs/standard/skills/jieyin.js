import { defineSkill, isMale, skillTargetCandidates } from '../../../core/registry.js';
import { discardFor } from '../../../core/card-use.js';
import { isFriend, relationOf, lowest, value } from '../../../ai/util.js';

const wounded = t => t.hp < t.maxHp;

export default defineSkill({
  id: 'jieyin', name: '结姻', desc: '出牌阶段限一次，你可以弃置两张手牌并选择一名已受伤的男性角色，你与其各回复 1 点体力。',
  active: {
    cards: { min: 2, max: 2, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat && isMale(t) && wounded(t) },
    limit: { phase: 1 },
    usable: (g, p) => p.hand.length >= 2,
    run(game, player, { cards, targets }) {
      const t = targets[0];
      const label = discardFor(game, player, cards);
      game.skillLog(player, 'jieyin', `，弃置 ${label}，与 ${t.name} 各回复 1 点体力`);
      game.pointAt(player, [t]);
      game.recordRelation(player, t, 'help', 2);
      game.heal(player, 1);
      game.heal(t, 1);
    },
  },
  ai: {
    order: 101,
    // 自己受伤、或友方男性残血
    play(game, p) {
      const low = lowest(p.hand, 2);
      const cands = skillTargetCandidates(game, p, 'jieyin');
      const t = cands.filter(x => isFriend(game, p, x) && relationOf(game, p, x) >= 1).sort((a, b) => a.hp - b.hp)[0];
      if (t && low.length === 2 && (wounded(p) || t.hp <= 2) && value(low[1]) < 8) {
        return { skillId: 'jieyin', cards: low, targets: [t] };
      }
      return null;
    },
  },
  prompt: {
    active: (n) => `【结姻】请选择两张手牌弃置（已选 ${n}/2），再选择一名已受伤的男性角色`,
    target: (picked, h) => (picked.length ? `【结姻】你与 ${h.names(picked)} 各回复 1 点体力，点击「确定」` : '【结姻】请选择一名已受伤的男性角色'),
  },
});
