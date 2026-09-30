import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'kurou', name: '苦肉', desc: '出牌阶段，你可以失去 1 点体力，然后摸两张牌。',
  active: {
    cards: { min: 0, max: 0 },
    targets: { min: 0, max: 0 },
    usable: (g, p) => p.hp > 0,
    async run(game, player) {
      game.skillLog(player, 'kurou');
      await game.loseHp(player, 1);
      if (player.alive && !game.over) game.drawCards(player, 2);
    },
  },
  ai: {
    order: 112,
    // 体力充裕时换牌（有【桃】时可多用一次）
    play(game, p) {
      const hasTao = p.hand.some(c => c.name === 'tao');
      return p.hp > 2 || (p.hp === 2 && hasTao) ? { skillId: 'kurou' } : null;
    },
  },
  prompt: { active: () => '【苦肉】失去 1 点体力，然后摸两张牌，点击「确定」' },
});
