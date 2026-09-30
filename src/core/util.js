// 通用工具
import { cardLabel, CARD_NAME } from '../data/cards.js';
import { skillName } from '../data/heroes.js';
// 校验 controller 返回的响应牌确实在其手牌中，防止无效引用造成死循环
export function handCardOf(player, r) {
  if (!r) return null;
  const card = r.card || r;
  return player.hand.some(h => h.id === card.id) ? card : null;
}

// 取出虚拟牌（或实体牌）对应的全部实体牌。
// 虚拟牌可由多张实体牌合成（丈八蛇矛：两张手牌当【杀】）。
export function realsOf(vcard) {
  if (!vcard) return [];
  if (vcard.reals) return vcard.reals;
  return vcard.real ? [vcard.real] : [vcard];
}

// 战报用：描述一次使用/打出的牌，写明实体牌花色点数与转化方式
// 如「黑桃7【杀】」「红桃K【桃】当【杀】（武圣）」「梅花3【闪】 + 方片9【桃】当【杀】（丈八蛇矛）」
export function useLabel(vcard) {
  const reals = realsOf(vcard);
  const as = `【${CARD_NAME[vcard.name] || vcard.name}】`;
  if (vcard.composite) return `${reals.map(cardLabel).join(' + ')} 当${as}（丈八蛇矛）`;
  if (reals[0] && reals[0].name !== vcard.name) {
    return `${cardLabel(reals[0])} 当${as}${vcard.via ? `（${skillName(vcard.via)}）` : ''}`;
  }
  return cardLabel(reals[0] || vcard);
}
