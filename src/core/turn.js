// 回合流程：准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束
// 各阶段只广播时机（phaseStart / beforePhase / drawPhase），阶段相关的技能都挂在时机上。
import { cardLabel, judgeName, handLimitOf } from '../data/cards.js';
import { getCard } from './registry.js';
import { resolveCardUse, useSkill } from './card-use.js';

// 判定区结算（后放置的先结算）：每种延时锦囊的判定效果写在其卡牌定义的 judgePhase 里。
// judgePhase 返回 true 表示该牌已被效果自行处置（移至他人判定区/挂起），否则结算后进弃牌堆。
export async function resolveJudgeZone(game, player) {
  for (const jc of [...player.judgeZone].reverse()) {
    if (game.over || !player.alive) return;
    player.judgeZone = player.judgeZone.filter(c => c.id !== jc.id);
    const def = getCard(judgeName(jc));
    const handled = def?.judgePhase ? await def.judgePhase(game, player, jc) : false;
    if (!handled) game.discardCards([jc]);
  }
}

// 进入某阶段：清空阶段作用域的技能状态，记录当前阶段（供 UI 显示）并广播时机
async function enterPhase(game, player, phase) {
  game.currentPhase = phase;
  game.resetScope('phase');
  game.notify();
  await game.trigger('phaseStart', { player, phase });
}

// 阶段开始前：技能可令其跳过（克己跳过弃牌阶段）
async function skipped(game, player, phase, extra = {}) {
  const ctx = await game.trigger('beforePhase', { player, phase, skip: false, ...extra });
  return ctx.skip;
}

const stop = (game, player) => game.over || !player.alive;

export async function runTurn(game, player) {
  if (stop(game, player)) return;
  game.currentTurnSeat = player.seat;
  game.currentPhase = 'prepare';
  player.resetTurnFlags();
  game.resetScope('turn');
  game.log(`──── ${player.name} 的回合 ────`);

  try {
    // 准备（观星、洛神）
    await enterPhase(game, player, 'prepare');
    if (stop(game, player)) return;

    // 判定
    await enterPhase(game, player, 'judge');
    await resolveJudgeZone(game, player);
    if (stop(game, player)) return;

    // 摸牌（突袭/裸衣/英姿在 drawPhase 时机修改摸牌数或改为其他效果；兵粮寸断生效则跳过）
    // 官方单挑：先手第一个回合的摸牌阶段少摸一张
    const firstTurn = game.mode === '1v1' && !!game.firstTurnPending;
    game.firstTurnPending = false;
    if (player.flags.skipDraw) {
      game.currentPhase = 'draw';
      game.log(`${player.name} 跳过摸牌阶段`);
    } else {
      await enterPhase(game, player, 'draw');
      if (stop(game, player)) return;
      if (firstTurn) game.log(`${player.name} 为先手，首回合少摸一张牌`);
      const draw = await game.trigger('drawPhase', { player, count: firstTurn ? 1 : 2, done: false });
      if (stop(game, player)) return;
      if (!draw.done && draw.count > 0) game.drawCards(player, draw.count);
    }

    // 出牌
    await enterPhase(game, player, 'play');
    if (stop(game, player) || player.flags.skipPlay) {
      if (player.flags.skipPlay) game.log(`${player.name} 跳过出牌阶段`);
    } else {
      let guard = 0;
      while (!stop(game, player) && guard++ < 200) {
        const action = await game.ask(player, 'askPlayCard');
        if (!action) break;
        if (action.skillId) await useSkill(game, player, action);
        else await resolveCardUse(game, player, action);
        await game.flushLoseTriggers();
      }
    }
    if (stop(game, player)) return;

    // 弃牌：手牌数 > 手牌上限
    const excess = player.hand.length - handLimitOf(player, game);
    if (!await skipped(game, player, 'discard', { excess })) {
      await enterPhase(game, player, 'discard');
      const n = player.hand.length - handLimitOf(player, game);
      if (n > 0) {
        const cards = await game.ask(player, 'askChooseCards', {
          count: n, from: 'self', reason: 'discard-phase',
        });
        const chosen = (cards || player.hand.slice(0, n)).filter(c => player.hand.some(h => h.id === c.id)).slice(0, n);
        player.removeFromHand(chosen);
        game.discardCards(chosen);
        game.log(`${player.name} 弃置 ${chosen.map(cardLabel).join('、')}`);
      }
    }
    await game.flushLoseTriggers();
    if (stop(game, player)) return;

    // 结束（闭月）
    await enterPhase(game, player, 'end');
    await game.flushLoseTriggers();
  } finally {
    // 本回合生效的效果（裸衣、酒等）在回合结束时失效
    game.resetScope('turn');
    player.flags.shaBonus = 0;
  }
}
