// 无懈可击响应链
// effect: { card, source, target, name, isNullify, apply: async ()=>{} }
// 奇数次无懈 → 效果无效；偶数次 → 生效
import { handCardOf } from './util.js';
import { canUseCardAs, cardLabel } from '../data/cards.js';

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
      // 写明抵消的是谁对谁的哪张锦囊
      const what = effect.isNullify
        ? `${effect.source.name} 的【无懈可击】`
        : `${effect.source ? `${effect.source.name} 对 ` : ''}${effect.target.name} 的【${effect.name}】`;
      game.log(`${p.name} 使用 ${cardLabel(card)}，抵消 ${what}`);
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
