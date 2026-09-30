import { defineSkill } from '../../../core/registry.js';
import { cardLabel } from '../../../data/cards.js';

// 观星：好牌留在牌堆顶（自己下一步就摸），废牌沉底
const worth = c => ({ tao: 9, wuzhong: 8, sha: 7, shan: 6 }[c.name] ?? (c.type === 'equip' ? 6 : 5));

export default defineSkill({
  id: 'guanxing', name: '观星',
  desc: '准备阶段，你可以观看牌堆顶的 X 张牌（X 为存活角色数且至多为 5），然后将其以任意顺序置于牌堆顶或牌堆底。',
  triggers: {
    phaseStart: {
      optional: false, // 排列时可以原样放回，等同于不发动
      can: (ctx, owner) => ctx.player === owner && ctx.phase === 'prepare',
      async run(ctx, owner, game) {
        const n = Math.min(5, game.alivePlayers().length);
        const cards = [];
        for (let i = 0; i < n; i++) {
          const c = game.drawOne();
          if (c) cards.push(c);
        }
        if (!cards.length) return;
        const r = await game.ask(owner, 'askArrange', { reason: 'guanxing', cards });
        // 只认本次亮出的牌；未被分配的一律沉底，避免控制器返回残缺数据造成丢牌
        const pick = key => (r?.[key] || []).filter(c => cards.some(x => x.id === c.id));
        const top = pick('top');
        const bottom = pick('bottom').filter(c => !top.some(x => x.id === c.id));
        const rest = cards.filter(c => !top.some(x => x.id === c.id) && !bottom.some(x => x.id === c.id));
        const toBottom = [...bottom, ...rest];
        if (top.length) game.deck.putOnTop(top);
        if (toBottom.length) game.deck.putOnBottom(toBottom);
        const label = cs => cs.map(cardLabel).join('、');
        game.skillLog(owner, 'guanxing', `${top.length ? `，置于牌堆顶：${label(top)}` : ''}${toBottom.length ? `，置于牌堆底：${label(toBottom)}` : ''}`);
      },
    },
  },
  ai: {
    // 摸牌阶段摸 2 张：留最多 2 张好牌在顶，其余（价值 <= 5 的废牌）沉底
    arrange(game, p, opts) {
      const sorted = [...opts.cards].sort((a, b) => worth(b) - worth(a));
      const top = sorted.filter((c, i) => i < 2 && worth(c) > 5);
      return { top, bottom: sorted.filter(c => !top.includes(c)) };
    },
  },
  prompt: {
    arrange: (opts) => [`【观星】观看牌堆顶 ${opts.cards.length} 张牌，将其以任意顺序置于牌堆顶或牌堆底`, '拖动牌调整顺序与位置，或点击在两行之间切换'],
    rows: { top: '牌堆顶', bottom: '牌堆底' },
  },
});
