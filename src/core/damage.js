// 伤害与濒死结算
import { handleDying } from './dying.js';
import { useLabel } from './util.js';

export async function applyDamage(game, source, target, amount, card = null, nature = 'normal') {
  if (game.over || amount <= 0) return;
  target.hp -= amount;
  const src = source ? `${source.name} 造成的 ` : '';
  game.log(`${target.name} 受到 ${src}${amount} 点${nature === 'thunder' ? '雷电' : ''}伤害（${card ? useLabel(card) : '无来源牌'}），剩 ${target.hp} 血`);
  // 官方顺序：扣减体力 → 濒死求桃 → 仍存活才进入「受到伤害后」时机（奸雄/反馈）。
  // 因此反馈/奸雄获得的牌不能用于本次濒死自救；阵亡则不再触发。
  if (target.hp <= 0) await handleDying(game, target);
  if (game.over) return;
  await game.emit('damaged', { source, target, amount, card, nature });
}
