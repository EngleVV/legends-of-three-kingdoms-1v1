// 诸葛亮·观星：准备阶段，观看牌堆顶 X 张牌（X=存活角色数，至多 5），
// 然后以任意顺序置于牌堆顶或牌堆底。
export default {
  id: 'guanxing',
  hero: 'zhugeliang',
  hooks: [
    {
      trigger: 'phaseStart',
      canTrigger: (ctx, game, owner) => ctx.phase === 'prepare' && ctx.player === owner,
      handler: async (ctx, game, owner) => {
        const n = Math.min(5, game.players.filter(p => p.alive).length);
        const cards = [];
        for (let i = 0; i < n; i++) {
          const c = game.drawOne();
          if (c) cards.push(c);
        }
        if (!cards.length) return null;

        const r = await game.ask(owner, 'askGuanxing', cards);
        // 只认本次亮出的牌；未被分配的一律沉底，避免控制器返回残缺数据造成丢牌
        const pick = key => (r?.[key] || []).filter(c => cards.some(x => x.id === c.id));
        const top = pick('top');
        const bottom = pick('bottom').filter(c => !top.some(x => x.id === c.id));
        const rest = cards.filter(c =>
          !top.some(x => x.id === c.id) && !bottom.some(x => x.id === c.id));
        const toBottom = [...bottom, ...rest];

        if (top.length) game.deck.putOnTop(top);
        if (toBottom.length) game.deck.putOnBottom(toBottom);
        game.log(`${owner.name} 发动【观星】（${top.length} 张置于牌堆顶，${toBottom.length} 张置于牌堆底）`);
        return null;
      },
    },
  ],
};
