// 判定流程
import { cardLabel } from '../data/cards.js';

// 翻开一张判定牌，经过鬼才改判，返回最终判定牌（已置入弃牌堆）
export async function doJudge(game, player, reason) {
  game.flushPending();
  let card = game.drawOne();
  game.log(`${player.name} 进行判定（${reason}）：${cardLabel(card)}`);
  const ctx = { player, judgeCard: card, reason };
  const results = await game.emit('beforeJudge', ctx);
  const replace = results.find(r => r.card && r.card.id !== card.id);
  if (replace) {
    // 鬼才：打出的手牌成为新判定牌，原判定牌直接置入弃牌堆（不归改判者所有）
    replace.from.removeFromHand([replace.card]);
    game.discardCards([card]);
    card = replace.card;
    game.log(`${replace.from.name} 发动【鬼才】，改判为 ${cardLabel(card)}`);
  }
  game.discardCards([card]);
  return card;
}
