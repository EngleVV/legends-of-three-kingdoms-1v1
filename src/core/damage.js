// 伤害结算：造成伤害时（来源方修正）→ 受到伤害时（目标方修正）→ 扣减体力 → 濒死 → 受到伤害后 → 铁索连环传导
import { handleDying } from './dying.js';
import { useLabel } from './util.js';

const NATURE_CN = { fire: '火焰', thunder: '雷电' };

// skill：没有伤害牌、由技能造成的伤害（刚烈/反间），战报写明技能名
// opts.conducted：铁索连环传导的伤害（不再触发造成伤害时的来源方修正，也不再继续传导）
export async function applyDamage(game, source, target, amount, card = null, nature = 'normal', skill = null, opts = {}) {
  if (game.over || amount <= 0 || !target.alive) return;
  let caused = amount;
  if (!opts.conducted) {
    // 造成伤害时：可改变伤害值（酒、裸衣、古锭刀）或防止伤害（寒冰剑）；麒麟弓等在此时弃置目标的牌
    const pre = await game.trigger('beforeDamage', { source, target, amount, card, nature, prevented: false });
    if (pre.prevented || game.over || !target.alive) return;
    caused = pre.amount;
    if (caused <= 0) return;
  }
  // 受到伤害时：目标方的防具修正（藤甲火焰伤害 +1、白银狮子至多 1 点）
  const rec = await game.trigger('receiveDamage', { source, target, amount: caused, card, nature, prevented: false });
  if (rec.prevented || game.over || !target.alive) return;
  amount = rec.amount;
  if (amount <= 0) return;

  target.hp -= amount;
  const src = source ? `${source.name} 造成的 ` : '';
  game.log(`${target.name} 受到 ${src}${amount} 点${NATURE_CN[nature] || ''}伤害（${card ? useLabel(card) : skill ? `【${skill}】` : '无来源牌'}），剩 ${target.hp} 血`);
  // 铁索连环：处于连环状态的角色受到属性伤害后重置，并将伤害传导给其他处于连环状态的角色
  const conduct = nature !== 'normal' && target.chained && !opts.conducted;
  if (nature !== 'normal' && target.chained) {
    target.chained = false;
    game.log(`${target.name} 的连环状态被重置`);
  }
  // 官方顺序：扣减体力 → 濒死求桃 → 仍存活才进入「受到伤害后」时机（奸雄/反馈）。
  // 因此反馈/奸雄获得的牌不能用于本次濒死自救；阵亡则不再触发。
  if (target.hp <= 0) await handleDying(game, target, source);
  if (!game.over && target.alive) await game.trigger('damaged', { source, target, amount, card, nature });

  // 传导：从当前回合角色开始依次结算，伤害值为传导前造成的伤害值（不含目标自身防具的修正）
  if (!conduct) return;
  for (const p of game.seatOrder()) {
    if (game.over) return;
    if (!p.alive || !p.chained || p === target) continue;
    game.log(`【铁索连环】伤害传导至 ${p.name}`);
    await applyDamage(game, source, p, caused, card, nature, skill, { conducted: true });
  }
}
