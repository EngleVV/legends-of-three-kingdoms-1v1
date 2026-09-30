// 主公技共用：激将 / 护驾「令其他某势力角色代为打出」
import { canRespondWith } from '../../../data/cards.js';
import { validResponse, realsOf } from '../../../core/card-use.js';
import { useLabel } from '../../../core/util.js';
import { skillName } from '../../../core/registry.js';
import { isFriend, pickResponse } from '../../../ai/util.js';

export const helpersOf = (game, lord, kingdom) => game.others(lord).filter(p => p.hero.kingdom === kingdom);

// 依次询问同势力角色是否代主公打出 type；返回代出的虚拟牌（已从代出者处移除）
export async function askHelpers(game, lord, skillId, type, kingdom, req = {}) {
  const sname = skillName(skillId);
  game.log(`${lord.name} 发动【${sname}】`);
  for (const h of helpersOf(game, lord, kingdom)) {
    if (game.over || !h.alive || !canRespondWith(h, type, game)) continue;
    const r = await game.ask(h, 'askRespondCard', { type, reason: skillId, info: { lord, orig: req.reason, ...(req.info || {}) } });
    const v = validResponse(h, r, type, game);
    if (v) {
      h.removeCards(realsOf(v));
      game.log(`${h.name} 响应【${sname}】，代 ${lord.name} 打出 ${useLabel(v)}`);
      v.by = h;
      return v;
    }
  }
  game.log(`无人响应【${sname}】`);
  return null;
}

// 「需要打出 type 时」的时机效果（挂在 needResponse 上）
export const helperTrigger = (skillId, type, kingdom) => ({
  can: (ctx, owner, game) => ctx.player === owner && ctx.req.type === type && helpersOf(game, owner, kingdom).length > 0,
  info: ctx => ({ req: ctx.req, hasOwn: ctx.own }),
  async run(ctx, owner, game) {
    const v = await askHelpers(game, owner, skillId, type, kingdom, ctx.req);
    if (v) { ctx.result = v; ctx.stop = true; }
  },
});

export const helperAI = type => ({
  // 自己没有可出的牌时才求援
  invoke: (game, p, info) => !info.hasOwn,
  // 代出方：只替友方主公代出
  respond: (game, p, req) => (isFriend(game, p, req.info?.lord) ? pickResponse(game, p, type) : null),
});

export const helperPrompt = (skillId, type, kingdom) => ({
  invoke: (info, h) => [`需要打出${h.cn(type)}，是否发动【${skillName(skillId)}】？`, `令其他${kingdom}势力角色代你打出${info.hasOwn ? '（你也可以自己出）' : ''}`],
  respond: (req, h) => `主公 ${h.who(req.info?.lord)} 发动了【${skillName(skillId)}】，是否代其打出一张${h.cn(type)}？`,
});
