// 伤害与濒死结算
import { handleDying } from './dying.js';
import { useLabel } from './util.js';

export async function applyDamage(game, source, target, amount, card = null, nature = 'normal') {
  if (game.over || amount <= 0) return;
  target.hp -= amount;
  const src = source ? `${source.name} 造成的 ` : '';
  game.log(`${target.name} 受到 ${src}${amount} 点${nature === 'thunder' ? '雷电' : ''}伤害（${card ? useLabel(card) : '无来源牌'}），剩 ${target.hp} 血`);
  await game.emit('damaged', { source, target, amount, card, nature });
  if (target.hp <= 0 && !game.over) {
    await handleDying(game, target);
  }
}
