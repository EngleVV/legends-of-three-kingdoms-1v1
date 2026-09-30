// AI 的身份认知：只使用该 AI 合法可知的信息——
//   自己的身份、主公（明置）、已阵亡角色亮出的身份，以及 Game 记录的公开行为（loyalty）。
// 绝不读取其他存活角色的隐藏身份。
//
// relationOf 返回数值：> 0 友方，< 0 敌方，0 未知；绝对值越大越确定。

// 其他角色在公开信息下看起来的立场：+1 忠方、-1 反贼方、0 未知
function publicSide(game, other) {
  if (other.role === 'lord') return 2;
  if (other.roleRevealed) return { loyalist: 1, rebel: -1, renegade: 0 }[other.role] ?? 0;
  const v = game.loyalty?.[other.seat] ?? 0;
  if (v > 0.5) return Math.min(1, v / 2);
  if (v < -0.5) return Math.max(-1, v / 2);
  return 0;
}

// 已阵亡（亮明身份）的反贼数：内奸据此判断反贼是否已清完
function rebelsLeft(game) {
  const total = game.players.filter(p => p.roleRevealed && p.role === 'rebel').length;
  return 2 - total;
}

export function relationOf(game, viewer, other) {
  if (other === viewer) return 3;
  if (game.mode !== 'identity') return -1;
  const side = publicSide(game, other);
  switch (viewer.role) {
    case 'lord':
      return side;
    case 'loyalist':
      return other.role === 'lord' ? 3 : side;
    case 'rebel':
      return other.role === 'lord' ? -3 : -side;
    case 'renegade': {
      // 内奸：反贼未清前装忠、保护主公；反贼清完后与所有人为敌（主公最后打）
      if (rebelsLeft(game) > 0) return other.role === 'lord' ? 1 : side;
      return other.role === 'lord' ? (game.alivePlayers().length <= 2 ? -3 : -0.6) : -1;
    }
    default:
      return -1;
  }
}

export const isEnemy = (game, v, o) => relationOf(game, v, o) < -0.4;
export const isFriend = (game, v, o) => o === v || relationOf(game, v, o) > 0.4;

export function enemiesOf(game, p) {
  return game.others(p).filter(o => isEnemy(game, p, o));
}

export function friendsOf(game, p) {
  return game.others(p).filter(o => isFriend(game, p, o));
}

// 目标优先级：更确定的敌人、体力低、手牌少
export function byThreat(game, p) {
  return (a, b) => (relationOf(game, p, a) - relationOf(game, p, b))
    || (a.hp - b.hp) || (a.hand.length - b.hand.length);
}
