import { defineSkill } from '../../../core/registry.js';
import { cardLabel } from '../../../data/cards.js';
import { applyDamage } from '../../../core/damage.js';
import { bestEnemy } from '../../../ai/util.js';

const SUITS = [['♠', '黑桃'], ['♥', '红桃'], ['♣', '梅花'], ['♦', '方片']];

export default defineSkill({
  id: 'fanjian', name: '反间',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其获得你的一张手牌并展示之，若此牌的花色与其所选的不同，你对其造成 1 点伤害。',
  active: {
    cards: { min: 0, max: 0 },
    targets: { min: 1, max: 1, ok: (g, p, t) => t.seat !== p.seat },
    limit: { phase: 1 },
    usable: (g, p) => p.hand.length > 0,
    async run(game, player, { targets }) {
      const t = targets[0];
      game.skillLog(player, 'fanjian', `，目标 ${t.name}`);
      game.pointAt(player, [t]);
      game.recordRelation(player, t, 'harm');
      const options = SUITS.map(([id, label]) => ({ id, label }));
      const r = await game.ask(t, 'askChooseOption', { reason: 'fanjian', options, info: { source: player } });
      const chosen = SUITS.find(([id]) => id === r) || SUITS[0];
      game.log(`${t.name} 选择了 ${chosen[1]}`);
      const c = game.takeCardFromArea(player, 'hand');
      if (!c) return;
      t.hand.push(c);
      game.lastGive = { ids: [c.id], to: t.seat };
      game.lastAction = { player, card: c, targets: [t] };
      game.log(`${t.name} 获得并展示了 ${cardLabel(c)}`);
      if (c.suit !== chosen[0]) {
        game.log('花色不同，【反间】生效');
        await applyDamage(game, player, t, 1, null, 'normal', '反间');
      } else {
        game.log('花色相同，【反间】无效');
      }
    },
  },
  ai: {
    order: 110,
    // 1/4 概率猜中花色，期望收益为正
    play(game, p) {
      const t = bestEnemy(game, p, game.others(p));
      return t ? { skillId: 'fanjian', targets: [t] } : null;
    },
    chooseOption: (game, p, opts) => opts.options[Math.floor(Math.random() * opts.options.length)].id,
  },
  prompt: {
    target: (picked, h) => (picked.length ? `【反间】对 ${h.names(picked)} 发动，点击「确定」` : '【反间】请选择一名其他角色'),
    chooseOption: (opts, h) => [`${h.who(opts.info?.source)} 对你发动了【反间】，请选择一种花色`, '你将获得其一张手牌并展示，花色不同则受到 1 点伤害'],
  },
});
