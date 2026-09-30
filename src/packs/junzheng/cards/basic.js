// 军争篇基本牌：火【杀】、雷【杀】、酒
import { defineCard } from '../../../core/registry.js';
import { sha } from '../../standard/cards/basic.js';
import { canUseInPlayPhase, legalTargets, conversionNames } from '../../../data/cards.js';
import { enemyFor, ownCards, isShaCard } from '../../../ai/util.js';

// 属性【杀】：牌类为【杀】（次数、距离、响应、技能都按【杀】处理），造成对应属性的伤害
const natureSha = (id, name, nature, desc) => defineCard({
  ...sha, id, name, kind: 'sha', nature, desc,
  ai: { ...sha.ai, order: 59 },
});

export const huosha = natureSha('huosha', '火杀', 'fire', '出牌阶段，对攻击范围内的一名角色使用，造成 1 点火焰伤害。');
export const leisha = natureSha('leisha', '雷杀', 'thunder', '出牌阶段，对攻击范围内的一名角色使用，造成 1 点雷电伤害。');

// 手里是否有能打到敌人的【杀】（含转化）：决定要不要先喝【酒】
function canSlashSomeone(game, p) {
  return ownCards(p).some(c => [c.name, ...conversionNames(p, c, game)].some(name =>
    isShaCard({ name }) && canUseInPlayPhase(game, p, c, name)
    && enemyFor(game, p, { card: c, real: c, name })));
}

export const jiu = defineCard({
  id: 'jiu', name: '酒', type: 'basic', rescue: 'self',
  desc: '出牌阶段，对自己使用，本回合你使用的下一张【杀】的伤害 +1（每回合限一次）；你处于濒死状态时，对自己使用，回复 1 点体力。',
  usable: (game, p) => !p.st('turn', 'jiu').used,
  use(game, { player, reals }) {
    player.st('turn', 'jiu').used = true;
    player.flags.shaBonus = (player.flags.shaBonus || 0) + 1;
    game.discardCards(reals);
    game.log(`${player.name} 本回合使用的下一张【杀】伤害 +1`);
  },
  ai: {
    value: 6, order: 58,
    play: (game, p, use) => (!p.flags.shaBonus && canSlashSomeone(game, p) ? { card: use.card, targets: [] } : null),
  },
  prompt: { use: () => '是否使用【酒】？本回合你使用的下一张【杀】伤害 +1' },
});

export default [huosha, leisha, jiu];
