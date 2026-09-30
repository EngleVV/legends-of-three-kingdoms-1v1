import { defineSkill, isMale, skillTargetCandidates } from '../../../core/registry.js';
import { canTarget } from '../../../data/cards.js';
import { discardFor, makeViewAs } from '../../../core/card-use.js';
import { resolveJuedou } from '../cards/tricks.js';
import { isEnemy, isFriend, relationOf, byThreat, lowest, ownCards, value } from '../../../ai/util.js';

export default defineSkill({
  id: 'lijian', name: '离间',
  desc: '出牌阶段限一次，你可以弃置一张牌并选择两名男性角色，视为后选择的角色对先选择的角色使用一张【决斗】（此【决斗】不能被【无懈可击】响应）。',
  active: {
    cards: { min: 1, max: 1, zone: 'any' },
    targets: {
      min: 2, max: 2,
      ok: (g, p, t, picked) => {
        if (t.seat === p.seat || !isMale(t) || picked.some(x => x.seat === t.seat)) return false;
        // 第二个目标是【决斗】的使用者：先选的角色须能成为其【决斗】的目标（空城）
        if (picked.length === 1) return canTarget(g, t, picked[0], 'juedou');
        // 第一个目标须存在可对其使用【决斗】的另一名男性角色
        return g.others(p).some(u => u.seat !== t.seat && isMale(u) && canTarget(g, u, t, 'juedou'));
      },
    },
    limit: { phase: 1 },
    usable: (g, p) => ownCards(p).length > 0 && g.others(p).filter(isMale).length >= 2,
    async run(game, player, { cards, targets }) {
      const [victim, user] = targets;
      const label = discardFor(game, player, cards);
      game.skillLog(player, 'lijian', `，弃置 ${label}，视为 ${user.name} 对 ${victim.name} 使用【决斗】`);
      game.pointAt(player, [victim, user]);
      game.recordRelation(player, victim, 'harm');
      game.recordRelation(player, user, 'harm', 0.5);
      await resolveJuedou(game, user, victim, makeViewAs('juedou', 'lijian'), { noNullify: true });
    },
  },
  ai: {
    order: 111,
    // 让两名敌人（或敌人与未知者）决斗，先选的是受害者
    play(game, p) {
      const pool = lowest(ownCards(p), 1);
      const v = skillTargetCandidates(game, p, 'lijian').filter(x => isEnemy(game, p, x)).sort(byThreat(game, p))[0];
      const u = v && skillTargetCandidates(game, p, 'lijian', [v])
        .filter(x => !isFriend(game, p, x) || relationOf(game, p, x) < 1)
        .sort((a, b) => b.hand.length - a.hand.length)[0];
      return v && u && pool[0] && value(pool[0]) < 8 ? { skillId: 'lijian', cards: pool, targets: [v, u] } : null;
    },
  },
  prompt: {
    active: () => '【离间】请选择一张牌弃置，再依次选择两名男性角色',
    target: (picked, h) => {
      if (picked.length === 2) return `【离间】视为 ${h.who(picked[1])} 对 ${h.who(picked[0])} 使用【决斗】，点击「确定」`;
      if (picked.length === 1) return `【离间】请选择对 ${h.who(picked[0])} 使用【决斗】的角色`;
      return '【离间】请选择【决斗】的目标（第一名男性角色）';
    },
  },
});
