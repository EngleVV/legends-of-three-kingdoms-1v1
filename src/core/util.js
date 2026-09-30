// 通用工具
import { cardLabel, CARD_NAME } from '../data/cards.js';
import { skillName } from './registry.js';

// 校验 controller 返回的响应牌确实在其手牌中，防止无效引用造成死循环
export function handCardOf(player, r) {
  if (!r) return null;
  const card = r.card || r;
  return player.hand.some(h => h.id === card.id) ? card : null;
}

// 取出虚拟牌（或实体牌）对应的全部实体牌（多张合成的牌返回全部；视为使用的牌返回空数组）
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
  const via = vcard.via ? `（${skillName(vcard.via)}）` : '';
  if (vcard.composite) return `${reals.map(cardLabel).join(' + ')} 当${as}${via}`;
  if (!reals.length) return `${as}${via}`;
  if (reals[0].name !== vcard.name) return `${cardLabel(reals[0])} 当${as}${via}`;
  return cardLabel(reals[0]);
}
