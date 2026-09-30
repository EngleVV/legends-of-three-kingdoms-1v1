// 濒死求桃：从当前回合玩家开始轮流询问，出桃 +1 血，直到 >0 或无人再出
import { handCardOf } from './util.js';
import { canUseCardAs, cardLabel, canRespondWith, equipCardOf, conversionOf } from '../data/cards.js';
import { killPlayer } from './identity.js';
import { hasLordSkill, hasSkill, skillName } from '../data/heroes.js';

export async function handleDying(game, target, killer = null) {
  let guard = 0;
  while (target.hp <= 0 && !game.over && guard++ < 50) {
    let saved = false;
    // 询问顺序：从当前回合角色开始，按座位顺序
    for (const p of game.seatOrder()) {
      if (target.hp > 0) break;
      // 打不出【桃】（含急救：回合外红色牌当【桃】）时直接跳过，避免弹出无意义的询问
      if (!p.alive || !canRespondWith(p, 'tao', game)) continue;
      const r = await game.ask(p, 'askPeach', { dying: target });
      const picked = handCardOf(p, r) || equipCardOf(p, r?.card || r);
      // 必须是【桃】或经合法转化（急救）当【桃】，不允许用其他牌冒充
      const card = picked && canUseCardAs(p, picked, 'tao', game) ? picked : null;
      if (card) {
        p.removeCards([card]);
        game.discardCards([card]);
        const via = conversionOf(p, card, 'tao', game)?.skill;
        // 救援（孙权主公技）：其他吴势力角色对其使用【桃】时额外回复 1 点
        const jiuyuan = p !== target && hasLordSkill(target, 'jiuyuan') && p.hero.kingdom === '吴';
        target.hp += jiuyuan ? 2 : 1;
        const used = via ? `${cardLabel(card)} 当【桃】（${skillName(via)}）` : cardLabel(card);
        game.log(`${p.name} 对 ${p === target ? '自己' : target.name} 使用 ${used}${jiuyuan ? '（【救援】额外回复 1 点）' : ''}，${target.name} 回复至 ${target.hp} 血`);
        if (game.recordRelation) game.recordRelation(p, target, 'help');
        saved = true;
      }
    }
    if (!saved) break;
  }
  if (target.hp <= 0) killPlayer(game, target, killer);
}
