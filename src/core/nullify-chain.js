// 无懈可击响应链
// effect: { card, source, target, name, isNullify, apply: async ()=>{} }
// 奇数次无懈 → 效果无效；偶数次 → 生效
import { handCardOf } from './util.js';
import { canUseCardAs } from '../data/cards.js';

async function askNullifyChain(game, effect) {
  // 询问顺序：从当前回合角色开始，按座位顺序
  for (const p of game.seatOrder()) {
    if (game.over) return { nullified: false };
    // 手里没有【无懈可击】时直接跳过，避免弹出无意义的询问
    if (!p.hand.some(c => c.name === 'wuxie')) continue;
    const r = await game.ask(p, 'askNullify', effect);
    const picked = handCardOf(p, r);
    // 必须真的是【无懈可击】：【无懈可击】没有任何转化来源，不允许用其他牌冒充
    const card = canUseCardAs(p, picked, 'wuxie') ? picked : null;
    if (card) {
      p.removeFromHand([card]);
      game.discardCards([card]);
      game.log(`${p.name} 使用【无懈可击】${effect.isNullify ? '抵消前面的无懈可击' : `抵消【${effect.name}】`}`);
      // 无懈本身也可被无懈；若该无懈又被无懈 → 原效果生效
      const counter = await askNullifyChain(game, {
        ...effect,
        card,
        source: p,
        isNullify: true,
        apply: async () => {},
      });
      return { nullified: !counter.nullified };
    }
  }
  return { nullified: false };
}

// 对外入口：effect.apply 内执行实际效果；被无懈则跳过
export async function resolveTrick(game, effect) {
  const r = await askNullifyChain(game, effect);
  if (!r.nullified) {
    await effect.apply();
  } else {
    game.log(`【${effect.name}】被抵消，无效果`);
  }
}
