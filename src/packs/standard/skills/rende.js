import { defineSkill } from '../../../core/registry.js';
import { cardLabel } from '../../../data/cards.js';
import { friendsOf, relationOf, lowest } from '../../../ai/util.js';

// 状态：turn 作用域 { given 本回合已交出张数, healed 是否已回复 }
export default defineSkill({
  id: 'rende', name: '仁德', desc: '出牌阶段，你可以将任意张手牌交给其他角色，你以此法每回合给出第二张牌时，回复 1 点体力。',
  active: {
    cards: { min: 1, max: Infinity, zone: 'hand' },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat },
    usable: (g, p) => p.hand.length > 0,
    run(game, player, { cards, targets }) {
      const to = targets[0];
      const st = player.st('turn', 'rende');
      player.removeFromHand(cards);
      to.hand.push(...cards);
      st.given = (st.given || 0) + cards.length;
      game.pointAt(player, [to]);
      game.recordRelation(player, to, 'help');
      // 动画提示：这批牌是「交给」对方，UI 幽灵飞向对方而非弃牌堆
      game.lastGive = { ids: cards.map(c => c.id), to: to.seat };
      game.skillLog(player, 'rende', `，将 ${cards.map(cardLabel).join('、')} 交给 ${to.name}`);
      if (st.given >= 2 && !st.healed) {
        st.healed = true;
        game.heal(player, 1);
      }
    },
  },
  ai: {
    order: 130,
    // 身份局把多余手牌交给友方；1v1 残血时把两张闪交给对方换回 1 点体力
    play(game, p) {
      const st = p.st('turn', 'rende');
      if (game.mode === 'identity') {
        const pals = friendsOf(game, p).filter(o => o !== p && relationOf(game, p, o) >= 1)
          .sort((a, b) => a.hand.length - b.hand.length);
        const extra = p.hand.length - p.hp;
        const needHeal = p.hp < p.maxHp && !st.healed;
        if (pals[0] && (extra > 0 || needHeal)) {
          const n = Math.min(p.hand.length, Math.max(1, extra, needHeal ? 2 - (st.given || 0) : 0));
          return { skillId: 'rende', cards: lowest(p.hand, n), targets: [pals[0]] };
        }
      } else if (p.hp <= 1 && p.hand.length >= 2) {
        const gives = p.hand.filter(c => c.name === 'shan').slice(0, 2);
        if (gives.length === 2) return { skillId: 'rende', cards: gives, targets: [game.opponentOf(p)] };
      }
      return null;
    },
  },
  prompt: {
    hint: (me) => {
      const st = me.st('turn', 'rende');
      return st.healed ? '本回合已通过仁德回复过体力' : `本回合已交出 ${st.given || 0} 张，累计满 2 张回复 1 点体力`;
    },
    active: () => '【仁德】请选择任意张手牌，再选择交给哪名角色',
    target: (picked, h, n) => (picked.length
      ? `【仁德】将 ${n} 张手牌交给 ${h.names(picked)}，点击「确定」`
      : `【仁德】已选 ${n} 张，请选择交给哪名角色`),
  },
});
