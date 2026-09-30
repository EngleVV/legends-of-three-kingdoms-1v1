// 判定流程
import { cardLabel, judgeEffective } from '../data/cards.js';
import { hasSkill } from '../data/heroes.js';

// 翻开一张判定牌，经过鬼才改判，返回最终判定牌（已置入弃牌堆）
export async function doJudge(game, player, reason) {
  game.flushPending();
  let card = game.drawOne();
  game.log(`${player.name} 进行判定（${reason}）：${cardLabel(card)}`);
  // 官方：判定牌翻开后先置于处理区，生效后才进弃牌堆。
  // 登记到 lastAction 供 UI 处理区展示（含鬼才询问期间，改判者需要看到当前判定牌）
  const judge = { reason, result: null, replacedBy: null };
  game.lastAction = { player, card, targets: [], judge };
  game.notify();

  const ctx = { player, judgeCard: card, reason };
  const results = await game.emit('beforeJudge', ctx);
  const replace = results.find(r => r.card && r.card.id !== card.id);
  if (replace) {
    // 鬼才：打出的手牌成为新判定牌，原判定牌直接置入弃牌堆（不归改判者所有）
    replace.from.removeFromHand([replace.card]);
    game.discardCards([card]);
    card = replace.card;
    judge.replacedBy = replace.from.name;
    game.lastAction.card = card;
    game.log(`${replace.from.name} 发动【鬼才】，改判为 ${cardLabel(card)}`);
  }
  judge.result = judgeEffective(reason, card) ? '生效' : '未生效';
  game.discardCards([card]);
  // 天妒：自己的判定牌生效后可以获得此牌
  if (hasSkill(player, 'tiandu') && player.alive && !game.over
    && await game.ask(player, 'askSkillInvoke', 'tiandu', { card })) {
    const got = game.takeFromDiscard(card);
    if (got) {
      player.hand.push(got);
      game.log(`${player.name} 发动【天妒】，获得判定牌 ${cardLabel(got)}`);
    }
  }
  return card;
}
