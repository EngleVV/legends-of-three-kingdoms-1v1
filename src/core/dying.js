// 濒死求桃：从当前回合角色开始轮流询问，出桃回复体力，直到体力 > 0 或无人再出
import { handCardOf } from './util.js';
import { canUseCardAs, cardLabel, canRespondWith, equipCardOf, conversionOf } from '../data/cards.js';
import { killPlayer } from './identity.js';
import { skillName } from './registry.js';

export async function handleDying(game, target, killer = null) {
  let guard = 0;
  while (target.hp <= 0 && !game.over && guard++ < 50) {
    let saved = false;
    for (const p of game.seatOrder()) {
      if (target.hp > 0) break;
      // 打不出【桃】（含急救等转化）时直接跳过，避免弹出无意义的询问
      if (!p.alive || !canRespondWith(p, 'tao', game)) continue;
      const r = await game.ask(p, 'askPeach', { dying: target });
      const picked = handCardOf(p, r) || equipCardOf(p, r?.card || r);
      // 必须是【桃】或经合法转化当【桃】，不允许用其他牌冒充
      const card = picked && canUseCardAs(p, picked, 'tao', game) ? picked : null;
      if (!card) continue;
      p.removeCards([card]);
      game.discardCards([card]);
      const via = conversionOf(p, card, 'tao', game)?.skill;
      // 对濒死角色使用【桃】时：技能可增加回复量（救援）
      const ctx = await game.trigger('peachUsed', { source: p, target, amount: 1, notes: [] });
      target.hp += ctx.amount;
      const used = via ? `${cardLabel(card)} 当【桃】（${skillName(via)}）` : cardLabel(card);
      const notes = ctx.notes.map(n => `（${n}）`).join('');
      game.log(`${p.name} 对 ${p === target ? '自己' : target.name} 使用 ${used}${notes}，${target.name} 回复至 ${target.hp} 血`);
      game.recordRelation(p, target, 'help');
      saved = true;
    }
    if (!saved) break;
  }
  if (target.hp <= 0) killPlayer(game, target, killer);
}
