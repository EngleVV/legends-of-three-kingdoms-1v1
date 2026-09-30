import { defineSkill } from '../../../core/registry.js';
import { discardFor } from '../../../core/card-use.js';
import { ownCards } from '../../../ai/util.js';

// 弃多余的闪/杀（保留 1 闪 1 杀），保留桃和无懈
function pick(p) {
  const kept = { shan: 0, sha: 0 };
  return p.hand.filter(c => {
    if (c.name === 'tao' || c.name === 'wuxie') return false;
    if (c.name in kept && kept[c.name] < 1) { kept[c.name]++; return false; }
    return true;
  });
}

export default defineSkill({
  id: 'zhiheng', name: '制衡', desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
  active: {
    // 官方「弃置任意张牌」不限手牌，装备区的牌同样可以弃置
    cards: { min: 1, max: Infinity, zone: 'any' },
    targets: { min: 0, max: 0 },
    limit: { phase: 1 },
    usable: (g, p) => ownCards(p).length > 0,
    run(game, player, { cards }) {
      const label = discardFor(game, player, cards);
      game.skillLog(player, 'zhiheng', `，弃置 ${label}`);
      game.drawCards(player, cards.length);
    },
  },
  ai: {
    order: 120,
    play(game, p) {
      const cards = pick(p);
      return cards.length >= 2 ? { skillId: 'zhiheng', cards } : null;
    },
  },
  prompt: {
    active: (n) => (n ? `【制衡】已选 ${n} 张，点击「确定」弃置并摸等量的牌` : '【制衡】请选择任意张牌（含装备区）弃置，然后摸等量的牌'),
  },
});
