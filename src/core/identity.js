// 身份局：发身份、选将候选、阵亡处理（弃牌/亮身份/奖惩）与胜负判定。
// 1v1 也走这里的 killPlayer / checkWinner，只是规则分支不同。
import { shuffle } from './deck.js';
import { cardLabel } from '../data/cards.js';

export const ROLE_NAME = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' };
export const SIDE_NAME = { lord: '主公与忠臣', rebel: '反贼', renegade: '内奸' };

// 官方身份配置（本项目先实现 5 人局）
const ROLE_SETS = {
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'],
};

export function rolesFor(n) {
  const set = ROLE_SETS[n];
  if (!set) throw new Error(`暂不支持 ${n} 人身份局`);
  return [...set];
}

// 随机发身份：返回按座位排列的身份数组（主公所在座位即 1 号位，由主公先行）
export function dealRoles(n) {
  return shuffle(rolesFor(n));
}

// 选将候选（官方）：主公从「曹操、刘备、孙权 + 随机 2 名」中选；其余角色各随机 3 名，武将不重复。
// 武将不够分时优先保证人类玩家拿满 choiceN 名，AI 从剩余里随机分配。
export const LORD_HEROES = ['caocao', 'liubei', 'sunquan'];

export function lordCandidates(heroIds, extra = 2) {
  const rest = shuffle(heroIds.filter(id => !LORD_HEROES.includes(id)));
  return [...LORD_HEROES.filter(id => heroIds.includes(id)), ...rest.slice(0, extra)];
}

// 主公选定后，为人类玩家（非主公时）挑 choiceN 名候选
export function heroChoices(heroIds, taken, choiceN = 3) {
  return shuffle(heroIds.filter(id => !taken.includes(id))).slice(0, choiceN);
}

// 为其余 AI 角色随机分配未被占用的武将
export function assignRest(heroIds, taken, count) {
  return shuffle(heroIds.filter(id => !taken.includes(id))).slice(0, count);
}

// ---------- 胜负 ----------
// 返回 null（未分胜负）或 { side, winners }
export function checkWinner(game) {
  const alive = game.players.filter(p => p.alive);
  if (game.mode === '1v1') {
    return alive.length === 1 ? { side: null, winners: alive } : null;
  }
  const lord = game.players.find(p => p.role === 'lord');
  const byRole = r => game.players.filter(p => p.role === r);
  if (!lord.alive) {
    // 主公阵亡：若场上只剩内奸则内奸胜，否则反贼胜（反贼即使已全部阵亡也算胜）
    if (alive.length === 1 && alive[0].role === 'renegade') return { side: 'renegade', winners: alive };
    return { side: 'rebel', winners: byRole('rebel') };
  }
  if (!alive.some(p => p.role === 'rebel' || p.role === 'renegade')) {
    return { side: 'lord', winners: [...byRole('lord'), ...byRole('loyalist')] };
  }
  return null;
}

function endGame(game, result) {
  game.over = true;
  game.winnerSide = result.side;
  game.winners = result.winners;
  // 1v1 沿用单一胜者；身份局取一名存活的获胜者（可能为空：如反贼已全部阵亡仍获胜）
  game.winner = result.winners.find(p => p.alive) || result.winners[0] || null;
  for (const p of game.players) p.roleRevealed = true;
}

// ---------- 阵亡 ----------
// killer：造成致命伤害的角色（可能为空，如闪电）
export function killPlayer(game, victim, killer = null) {
  if (victim.dead) return;
  victim.dead = true;
  victim.roleRevealed = true;
  const role = victim.role ? `，身份：${ROLE_NAME[victim.role]}` : '';
  game.log(`☠ ${victim.name} 阵亡${role}`);

  // 弃置其区域内的全部牌
  const cards = victim.allCards();
  victim.hand = [];
  victim.judgeZone = [];
  for (const k of Object.keys(victim.equip)) victim.equip[k] = null; // 阵亡者技能不再触发，不记失去
  if (cards.length) game.discardCards(cards);

  const result = checkWinner(game);
  if (result) { endGame(game, result); return; }

  if (game.mode !== 'identity' || !killer || !killer.alive || killer === victim) return;
  if (victim.role === 'rebel') {
    game.log(`${killer.name} 杀死反贼，摸三张牌`);
    game.drawCards(killer, 3);
  } else if (victim.role === 'loyalist' && killer.role === 'lord') {
    const lose = [...killer.hand, ...Object.values(killer.equip).filter(Boolean)];
    game.log(`主公 ${killer.name} 杀死忠臣，弃置所有手牌与装备${lose.length ? `：${lose.map(cardLabel).join('、')}` : ''}`);
    killer.removeCards(lose);
    if (lose.length) game.discardCards(lose);
  }
}
