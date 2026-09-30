// 判定流程
import { cardLabel, judgeEffective } from '../data/cards.js';
import { skillName } from './registry.js';

// 翻开一张判定牌，经过改判（beforeJudge：鬼才），生效后广播 afterJudge（天妒），返回最终判定牌（已置入弃牌堆）
export async function doJudge(game, player, reason) {
  game.flushPending();
  const card = game.drawOne();
  game.log(`${player.name} 进行判定（${reason}）：${cardLabel(card)}`);
  // 官方：判定牌翻开后先置于处理区，生效后才进弃牌堆。
  // 登记到 lastAction 供 UI 处理区展示（含改判询问期间，改判者需要看到当前判定牌）
  const judge = { reason, result: null, replacedBy: null };
  game.lastAction = { player, card, targets: [], judge };
  game.notify();

  const ctx = await game.trigger('beforeJudge', { player, reason, card, judge });
  const final = ctx.card;
  const effective = judgeEffective(reason, final);
  judge.result = effective ? '生效' : '未生效';
  game.discardCards([final]);
  await game.trigger('afterJudge', { player, reason, card: final, effective });
  return final;
}

// 改判：by 打出 card 代替当前判定牌，原判定牌置入弃牌堆（不归改判者所有）
export function replaceJudgeCard(game, ctx, by, card, skillId) {
  by.removeCards([card]);
  game.discardCards([ctx.card]);
  ctx.card = card;
  ctx.judge.replacedBy = by.name;
  ctx.judge.via = skillId;
  if (game.lastAction?.judge === ctx.judge) game.lastAction.card = card;
  game.log(`${by.name} 发动【${skillName(skillId)}】，改判为 ${cardLabel(card)}`);
}
