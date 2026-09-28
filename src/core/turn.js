// 回合流程：准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束
import { cardLabel } from '../data/cards.js';
import { resolveCardUse, useSkill } from './card-use.js';
import { doJudge } from './judge.js';
import { resolveTrick } from './nullify-chain.js';
import { applyDamage } from './damage.js';

// 判定区结算（后放置的先结算）
export async function resolveJudgeZone(game, player) {
  for (const jc of [...player.judgeZone].reverse()) {
    if (game.over) return;
    player.judgeZone = player.judgeZone.filter(c => c.id !== jc.id);
    // handled：该牌已被效果自行处置（移至他人判定区，或已挂起/弃置），无需再统一弃置
    let handled = false;

    if (jc.name === 'le') {
      await resolveTrick(game, {
        card: jc, source: game.opponentOf(player), target: player, name: '乐不思蜀',
        apply: async () => {
          const jcard = await doJudge(game, player, '乐不思蜀');
          if (jcard.suit === '♥') {
            game.log('【乐不思蜀】判定为红桃，失效');
          } else {
            player.flags.skipPlay = true;
            game.log(`【乐不思蜀】判定生效，${player.name} 跳过出牌阶段`);
          }
        },
      });
    } else if (jc.name === 'shandian') {
      // 【闪电】判定未中或被抵消：移至下家；下家已有【闪电】则顺延（1v1 即留在自己判定区）
      const passOn = () => {
        const opp = game.opponentOf(player);
        handled = true;
        if (opp.judgeZone.some(c => c.name === 'shandian')) {
          player.judgeZone.push(jc);
          game.log(`${opp.name} 判定区已有【闪电】，【闪电】留在 ${player.name} 的判定区`);
        } else {
          opp.judgeZone.push(jc);
          game.log(`【闪电】移至 ${opp.name} 的判定区`);
        }
      };
      let applied = false;
      await resolveTrick(game, {
        card: jc, source: null, target: player, name: '闪电',
        apply: async () => {
          applied = true;
          const jcard = await doJudge(game, player, '闪电');
          if (jcard.suit === '♠' && jcard.rank >= 2 && jcard.rank <= 9) {
            game.log('【闪电】命中！');
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
      if (!applied && !game.over) passOn();
    }

    // 被无懈抵消或已结算完毕的判定牌进弃牌堆
    if (!handled) game.discardCards([jc]);
  }
}

export async function runTurn(game, player) {
  if (game.over) return;
  game.currentTurnSeat = player.seat;
  player.resetTurnFlags();
  game.log(`──── ${player.name} 的回合 ────`);

  // 进入某阶段：记录当前阶段（供 UI 处理区显示）并广播时机
  const enterPhase = async (phase) => {
    game.currentPhase = phase;
    return game.emit('phaseStart', { player, phase });
  };

  // 准备
  await enterPhase('prepare');
  if (game.over) return;

  // 判定
  await enterPhase('judge');
  await resolveJudgeZone(game, player);
  if (game.over) return;

  // 摸牌（观星钩子在 phaseStart:draw 拦截）
  await enterPhase('draw');
  if (game.over) return;
  game.drawCards(player, 2);

  // 出牌
  await enterPhase('play');
  if (game.over || player.flags.skipPlay) {
    if (player.flags.skipPlay) game.log(`${player.name} 跳过出牌阶段`);
  } else {
    let guard = 0;
    while (!game.over && guard++ < 200) {
      const action = await game.ask(player, 'askPlayCard');
      if (!action) break;
      if (action.skillId) {
        await useSkill(game, player, action);
      } else {
        await resolveCardUse(game, player, action);
      }
    }
  }
  if (game.over) return;

  // 弃牌：手牌数 > 体力
  game.currentPhase = 'discard';
  const excess = player.hand.length - player.hp;
  if (excess > 0) {
    const cards = await game.ask(player, 'askChooseCards', {
      count: excess, from: 'self', reason: 'discard-phase',
    });
    const chosen = (cards || player.hand.slice(0, excess)).filter(c => player.hand.some(h => h.id === c.id));
    player.removeFromHand(chosen);
    game.discardCards(chosen);
    game.log(`${player.name} 弃置 ${chosen.map(cardLabel).join('、')}`);
  }

  game.currentPhase = 'end';
  await game.emit('phaseEnd', { player });
}
