// 无懈可击响应链
// effect: { card, source, target, name, isNullify, noNullify, apply: async ()=>{} }
// 奇数次无懈 → 效果无效；偶数次 → 生效
import { handCardOf } from './util.js';
import { canUseCardAs, cardLabel } from '../data/cards.js';

async function askNullifyChain(game, effect) {
  // 询问顺序：从当前回合角色开始，按座位顺序
  for (const p of game.seatOrder()) {
    if (game.over) return { nullified: false };
    // 打不出【无懈可击】时直接跳过，避免弹出无意义的询问
    if (!p.alive || !p.hand.some(c => canUseCardAs(p, c, 'wuxie', game))) continue;
    const r = await game.ask(p, 'askNullify', effect);
    const picked = handCardOf(p, r);
    const card = picked && canUseCardAs(p, picked, 'wuxie', game) ? picked : null;
    if (!card) continue;
    p.removeFromHand([card]);
    game.discardCards([card]);
    // 写明抵消的是谁对谁的哪张锦囊
    const what = effect.isNullify
      ? `${effect.source.name} 的【无懈可击】`
      : `${effect.source ? `${effect.source.name} 对 ` : ''}${effect.target.name} 的【${effect.name}】`;
    game.log(`${p.name} 使用 ${cardLabel(card)}，抵消 ${what}`);
    // 使用【无懈可击】也是「使用一张非延时锦囊」（集智）
    await game.trigger('cardUsed', { player: p, card, targets: [] });
    // 无懈本身也可被无懈；若该无懈又被无懈 → 原效果生效
    const counter = await askNullifyChain(game, {
      ...effect, card, source: p, isNullify: true, apply: async () => {},
    });
    return { nullified: !counter.nullified };
  }
  return { nullified: false };
}

// 对外入口：effect.apply 内执行实际效果；被无懈则跳过
export async function resolveTrick(game, effect) {
  const r = effect.noNullify ? { nullified: false } : await askNullifyChain(game, effect);
  if (!r.nullified) await effect.apply();
  else game.log(`【${effect.name}】被抵消，无效果`);
}
