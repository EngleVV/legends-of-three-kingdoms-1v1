// 阶段类技能：准备阶段（洛神）、摸牌阶段（突袭/裸衣/英姿）、弃牌阶段（克己）、结束阶段（闭月）
import { cardLabel, judgeEffective } from '../cards.js';
import { hasSkill } from '../heroes.js';
import { doJudge } from '../../core/judge.js';

// 洛神：准备阶段判定，黑色则获得判定牌并可重复，直到出现红色
export async function luoshen(game, p) {
  if (!hasSkill(p, 'luoshen')) return;
  for (let guard = 0; guard < 30 && p.alive && !game.over; guard++) {
    if (!await game.ask(p, 'askSkillInvoke', 'luoshen', {})) return;
    game.log(`${p.name} 发动【洛神】`);
    const jc = await doJudge(game, p, '洛神');
    if (!judgeEffective('洛神', jc)) {
      game.log(`【洛神】判定为 ${cardLabel(jc)}（红色），结束`);
      return;
    }
    const got = game.takeFromDiscard(jc);
    if (got) {
      p.hand.push(got);
      game.log(`${p.name} 获得 ${cardLabel(got)}`);
    }
  }
}

// 摸牌阶段：返回最终摸牌数（突袭时为 0，牌已获得）
export async function drawPhaseCount(game, p, base) {
  let n = base;
  // 突袭：放弃摸牌，改为获得至多两名其他角色的各一张手牌
  if (hasSkill(p, 'tuxi')) {
    const candidates = game.others(p).filter(o => o.hand.length > 0);
    if (candidates.length) {
      const pick = await game.ask(p, 'askChoosePlayers', {
        reason: 'tuxi', candidates, min: 1, max: 2, optional: true,
      });
      const chosen = (pick || []).filter(t => candidates.includes(t)).slice(0, 2);
      if (chosen.length) {
        game.log(`${p.name} 发动【突袭】，放弃摸牌，获得 ${chosen.map(t => t.name).join('、')} 的各一张手牌`);
        game.pointAt(p, chosen);
        for (const t of chosen) {
          const c = game.takeCardFromArea(t, 'hand');
          if (c) p.hand.push(c);
          game.recordRelation(p, t, 'harm');
        }
        return 0;
      }
    }
  }
  // 裸衣：少摸一张，本回合杀/决斗伤害 +1
  if (hasSkill(p, 'luoyi') && n > 0 && await game.ask(p, 'askSkillInvoke', 'luoyi', {})) {
    n -= 1;
    p.flags.luoyi = true;
    game.log(`${p.name} 发动【裸衣】，少摸一张牌，本回合【杀】/【决斗】伤害 +1`);
  }
  // 英姿：多摸一张
  if (hasSkill(p, 'yingzi') && await game.ask(p, 'askSkillInvoke', 'yingzi', {})) {
    n += 1;
    game.log(`${p.name} 发动【英姿】，多摸一张牌`);
  }
  return n;
}

// 克己：出牌阶段未使用或打出过【杀】，可以跳过弃牌阶段
export async function keji(game, p) {
  if (!hasSkill(p, 'keji') || p.flags.shaUsed || p.flags.shaPlayed) return false;
  if (!await game.ask(p, 'askSkillInvoke', 'keji', {})) return false;
  game.log(`${p.name} 发动【克己】，跳过弃牌阶段`);
  return true;
}

// 闭月：结束阶段摸一张牌
export async function biyue(game, p) {
  if (!hasSkill(p, 'biyue') || !p.alive || game.over) return;
  if (!await game.ask(p, 'askSkillInvoke', 'biyue', {})) return;
  game.log(`${p.name} 发动【闭月】`);
  game.drawCards(p, 1);
}
