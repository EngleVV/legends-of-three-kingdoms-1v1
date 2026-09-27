// 伤害与濒死结算
import { handleDying } from './dying.js';
import { cardLabel } from '../data/cards.js';

export async function applyDamage(game, source, target, amount, card = null, nature = 'normal') {
  if (game.over || amount <= 0) return;
  target.hp -= amount;
  const src = source ? `${source.name} 对 ` : '';
  game.log(`${src}${target.name} 受到 ${amount} 点${nature === 'thunder' ? '雷电' : ''}伤害（${card ? cardLabel(card) : '无来源牌'}），剩 ${target.hp} 血`);
  await game.emit('damaged', { source, target, amount, card, nature });
  if (target.hp <= 0 && !game.over) {
    await handleDying(game, target);
  }
}
