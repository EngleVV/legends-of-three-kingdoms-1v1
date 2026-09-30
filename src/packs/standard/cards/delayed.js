// 延时锦囊：使用时置入判定区；判定阶段按 judgePhase 结算（返回 true 表示该牌已被效果自行处置）
import { defineCard } from '../../../core/registry.js';
import { resolveTrick } from '../../../core/nullify-chain.js';
import { doJudge } from '../../../core/judge.js';
import { applyDamage } from '../../../core/damage.js';
import { cardLabel, judgeEffective, judgeName } from '../../../data/cards.js';
import { enemyFor } from '../../../ai/util.js';

const hasDelayed = (p, name) => p.judgeZone.some(c => judgeName(c) === name);

export const le = defineCard({
  id: 'le', name: '乐不思蜀', type: 'delayed', harmful: true, harm: 1,
  target: { ok: (game, from, to) => !hasDelayed(to, 'le') },
  judge: { name: '乐不思蜀', effective: c => c.suit !== '♥', good: false },
  use(game, { targets, reals }) {
    // 判定区放实体牌；转化而来（国色）时标记其生效牌名
    if (reals[0].name !== 'le') reals[0].delayedAs = 'le';
    targets[0].judgeZone.push(reals[0]);
  },
  async judgePhase(game, player, jc) {
    await resolveTrick(game, {
      card: jc, source: null, target: player, name: '乐不思蜀',
      apply: async () => {
        const j = await doJudge(game, player, '乐不思蜀');
        if (judgeEffective('乐不思蜀', j)) {
          player.flags.skipPlay = true;
          game.log(`【乐不思蜀】判定为 ${cardLabel(j)}（非红桃），生效，${player.name} 跳过出牌阶段`);
        } else {
          game.log(`【乐不思蜀】判定为 ${cardLabel(j)}（红桃），失效`);
        }
      },
    });
    return false;
  },
  ai: {
    order: 20, nullify: 'always',
    play: (game, p, use) => {
      const t = enemyFor(game, p, use);
      return t ? { card: use.card, targets: [t] } : null;
    },
  },
});

export const shandian = defineCard({
  id: 'shandian', name: '闪电', type: 'delayed', harmful: true,
  usable: (game, p) => !hasDelayed(p, 'shandian'),
  judge: { name: '闪电', effective: c => c.suit === '♠' && c.rank >= 2 && c.rank <= 9, good: false },
  use(game, { player, reals }) {
    player.judgeZone.push(reals[0]);
  },
  // 判定未中或被抵消：移至下家；下家已有【闪电】则继续顺延，都有则留在原处
  async judgePhase(game, player, jc) {
    let handled = false;
    const passOn = () => {
      handled = true;
      const next = game.others(player).find(p => !hasDelayed(p, 'shandian'));
      if (!next) {
        player.judgeZone.push(jc);
        game.log(`其他角色判定区均已有【闪电】，【闪电】留在 ${player.name} 的判定区`);
      } else {
        next.judgeZone.push(jc);
        game.log(`【闪电】移至 ${next.name} 的判定区`);
      }
    };
    let applied = false;
    await resolveTrick(game, {
      card: jc, source: null, target: player, name: '闪电',
      apply: async () => {
        applied = true;
        const j = await doJudge(game, player, '闪电');
        if (judgeEffective('闪电', j)) {
          game.log(`【闪电】判定为 ${cardLabel(j)}（黑桃2~9），命中！`);
          // 先挂起这张【闪电】，使奸雄能获得"造成伤害的牌"
          handled = true;
          game.discardCards([jc], { pending: true });
          await applyDamage(game, null, player, 3, jc, 'thunder');
          game.flushPending();
        } else {
          passOn();
        }
      },
    });
    if (!applied && !game.over && player.alive) passOn();
    return handled;
  },
  ai: {
    order: 100, nullify: 'always',
    play: (game, p, use) => (p.hp >= 3 ? { card: use.card, targets: [] } : null),
  },
  prompt: { use: () => '是否将【闪电】置入你的判定区？' },
});

export default [le, shandian];
