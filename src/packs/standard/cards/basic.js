// 基本牌：杀、闪、桃
import { defineCard } from '../../../core/registry.js';
import { respond, playedLog, discardUsed } from '../../../core/card-use.js';
import { applyDamage } from '../../../core/damage.js';
import { useLabel } from '../../../core/util.js';
import { blockerOf, shaLeftOf, cardLabel } from '../../../data/cards.js';
import { modify, skillName } from '../../../core/registry.js';
import { enemyFor } from '../../../ai/util.js';

// ---------- 【杀】的结算（也供借刀杀人、青龙偃月刀、激将等复用） ----------
// 时机顺序：成为目标时（流离可转移）→ 指定目标后（铁骑、雌雄双股剑、仁王盾）→ 求【闪】
//          →（被【闪】抵消时：贯石斧）→ 造成伤害 / 被抵消后（青龙偃月刀）
export async function resolveSlash(game, source, target, vcard) {
  const blocker = blockerOf(game, source, target, 'sha');
  if (blocker) {
    discardUsed(game, vcard);
    game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}，【${skillName(blocker)}】生效，${target.name} 不能成为【杀】的目标`);
    return;
  }
  game.log(`${source.name} 对 ${target.name} 使用 ${useLabel(vcard)}`);
  game.pointAt(source, [target]);
  game.recordRelation(source, target, 'harm');

  const ctx = { card: vcard, source, target, noShan: false, nullified: false };
  await game.trigger('becomingTarget', ctx);
  if (game.over) return;
  await game.trigger('targetConfirmed', ctx);
  target = ctx.target;
  if (ctx.nullified || game.over) { discardUsed(game, vcard); return; }

  // 需要的【闪】数：1 + 使用者的 extraResponses 修正（无双）
  const need = 1 + modify(source, 'extraResponses', 0, { kind: 'shan', from: source, to: target }, game);
  let dodged = 0;
  for (let i = 0; i < need && !ctx.noShan; i++) {
    const v = await respond(game, target, { type: 'shan', reason: 'sha', info: { source, card: vcard, nth: i + 1, need } });
    if (!v) break;
    playedLog(game, target, v, need > 1 ? `（第 ${i + 1}/${need} 张）` : '');
    dodged++;
  }

  let hit = ctx.noShan || dodged < need;
  if (!hit) hit = (await game.trigger('slashDodged', { ...ctx, target, hit: false })).hit;

  discardUsed(game, vcard);
  if (hit) {
    // 传入虚拟牌：合成牌（丈八蛇矛）时奸雄可获得其全部实体牌
    await applyDamage(game, source, target, 1, vcard);
  } else {
    game.log(`${target.name} 闪避了【杀】`);
    await game.trigger('slashMissed', { card: vcard, source, target });
  }
}

export const sha = defineCard({
  id: 'sha', name: '杀', type: 'basic',
  selfLog: true,
  target: { distance: 'attack' },
  // 出牌阶段受次数上限限制（咆哮、诸葛连弩修正 shaLimit）
  usable: (game, p) => shaLeftOf(p, game) > 0,
  async use(game, { player, card, targets }) {
    player.flags.shaUsed = (player.flags.shaUsed || 0) + 1;
    await resolveSlash(game, player, targets[0], card);
  },
  ai: {
    order: 60,
    play: (game, p, use) => {
      const t = enemyFor(game, p, use);
      return t ? { card: use.card, targets: [t] } : null;
    },
  },
  prompt: {
    respond: (req, h) => `${h.who(req.info?.source)} 对你使用了【杀】，请打出一张${h.cn(req.type)}${h.nth(req.info)}`,
  },
});

export const shan = defineCard({
  id: 'shan', name: '闪', type: 'basic', respondOnly: true,
  ai: { value: 6 },
});

export const tao = defineCard({
  id: 'tao', name: '桃', type: 'basic',
  // 出牌阶段只能对自己使用，且体力值未满
  usable: (game, p) => p.hp < p.maxHp,
  async use(game, { player, card, reals }) {
    if (player.hp < player.maxHp) game.heal(player, 1);
    else game.log(`${player.name} 体力已满，${cardLabel(reals[0] || card)} 无效`);
    game.discardCards(reals);
  },
  ai: {
    value: 9, order: 10,
    play: (game, p, use) => ({ card: use.card, targets: [] }),
  },
  prompt: { use: () => '是否使用【桃】回复 1 点体力？' },
});

export default [sha, shan, tao];
