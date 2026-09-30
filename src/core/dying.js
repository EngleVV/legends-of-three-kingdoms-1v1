// 濒死求桃：从当前回合玩家开始轮流询问，出桃 +1 血，直到 >0 或无人再出
import { handCardOf } from './util.js';
import { canUseCardAs, cardLabel } from '../data/cards.js';
import { killPlayer } from './identity.js';

export async function handleDying(game, target, killer = null) {
  let guard = 0;
  while (target.hp <= 0 && !game.over && guard++ < 50) {
    let saved = false;
    // 询问顺序：从当前回合角色开始，按座位顺序
    for (const p of game.seatOrder()) {
      if (target.hp > 0) break;
      // 手里没有【桃】时直接跳过，避免弹出无意义的询问
      if (!p.hand.some(c => c.name === 'tao')) continue;
      const r = await game.ask(p, 'askPeach', { dying: target });
      const picked = handCardOf(p, r);
      // 必须真的是【桃】：【桃】没有任何转化来源，不允许用其他牌冒充
      const card = canUseCardAs(p, picked, 'tao') ? picked : null;
      if (card) {
        p.removeFromHand([card]);
        game.discardCards([card]);
        target.hp += 1;
        game.log(`${p.name} 对 ${p === target ? '自己' : target.name} 使用 ${cardLabel(card)}，${target.name} 回复至 ${target.hp} 血`);
        saved = true;
      }
    }
    if (!saved) break;
  }
  if (target.hp <= 0) killPlayer(game, target, killer);
}
