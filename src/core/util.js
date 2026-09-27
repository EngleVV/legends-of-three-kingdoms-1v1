// 通用工具
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
