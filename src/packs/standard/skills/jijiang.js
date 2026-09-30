import { defineSkill } from '../../../core/registry.js';
import { canTarget, shaLeftOf } from '../../../data/cards.js';
import { resolveSlash } from '../cards/basic.js';
import { bestEnemy } from '../../../ai/util.js';
import { askHelpers, helpersOf, helperTrigger, helperAI, helperPrompt } from './_lord.js';

// 状态：phase 作用域 { failed }——本阶段无人响应后不再可用
export default defineSkill({
  id: 'jijiang', name: '激将', lord: true,
  desc: '主公技，当你需要使用或打出一张【杀】时，你可以令其他蜀势力角色打出一张【杀】（视为由你使用或打出）。',
  triggers: { needResponse: helperTrigger('jijiang', 'sha', '蜀') },
  // 出牌阶段发动：令蜀势力角色代出一张【杀】，视为由主公对目标使用（计入次数）
  active: {
    cards: { min: 0, max: 0 },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat && canTarget(g, p, t, 'sha') },
    usable: (g, p) => helpersOf(g, p, '蜀').length > 0 && shaLeftOf(p, g) > 0 && !p.st('phase', 'jijiang').failed
      && g.others(p).some(t => canTarget(g, p, t, 'sha')),
    async run(game, player, { targets }) {
      const target = targets[0];
      const v = await askHelpers(game, player, 'jijiang', 'sha', '蜀');
      if (!v) { player.st('phase', 'jijiang').failed = true; return; }
      game.lastAction = { player, card: v, targets: [target] };
      player.flags.shaUsed = (player.flags.shaUsed || 0) + 1;
      await resolveSlash(game, player, target, v);
    },
  },
  ai: {
    ...helperAI('sha'),
    order: 62,
    play(game, p) {
      const t = bestEnemy(game, p, game.others(p).filter(o => canTarget(game, p, o, 'sha')));
      return t ? { skillId: 'jijiang', targets: [t] } : null;
    },
  },
  prompt: {
    ...helperPrompt('jijiang', 'sha', '蜀'),
    target: (picked, h) => (picked.length
      ? `【激将】令蜀势力角色代你对 ${h.names(picked)} 使用【杀】，点击「确定」`
      : '【激将】请选择【杀】的目标'),
  },
});
