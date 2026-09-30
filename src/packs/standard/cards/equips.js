// 装备牌：武器、防具、坐骑。装备在装备区时，其效果与技能一样挂在时机（triggers）与修正点（modifiers）上。
import { defineCard } from '../../../core/registry.js';
import { respond, makeViewAs } from '../../../core/card-use.js';
import { doJudge } from '../../../core/judge.js';
import { cardLabel, hasCard, armorOf, cardColor, judgeEffective } from '../../../data/cards.js';
import { resolveSlash } from './basic.js';
import { isFriend, lowest, pickArea, pickResponse } from '../../../ai/util.js';
import { hasSkill } from '../../../core/registry.js';

const isSha = card => card?.name === 'sha';
const ownCount = p => p.hand.length + Object.values(p.equip).filter(Boolean).length;

// 所有装备共用：装备到对应栏位（替换旧装备）；AI 在栏位空时装备
const equip = (spec) => defineCard({
  type: 'equip',
  use: (game, { player, reals }) => game.equipCard(player, reals[0]),
  ...spec,
  ai: {
    order: 30,
    play: (game, p, use) => (!p.equip[spec.subType] ? { card: use.card, targets: [] } : null),
    ...(spec.ai || {}),
  },
  prompt: {
    use: (game, me, card) => {
      const old = me.equip[spec.subType];
      return `是否装备【${spec.name}】？${old ? `（将替换 ${cardLabel(old)}）` : ''}`;
    },
    ...(spec.prompt || {}),
  },
});

// ---------- 武器 ----------
export const zhugenu = equip({
  id: 'zhugenu', name: '诸葛连弩', subType: 'weapon', range: 1,
  desc: '锁定技，出牌阶段，你使用【杀】无次数限制。',
  modifiers: { shaLimit: () => Infinity },
});

export const qinggang = equip({
  id: 'qinggang', name: '青釭剑', subType: 'weapon', range: 2,
  desc: '锁定技，你使用【杀】无视目标角色的防具。',
  modifiers: { ignoreArmor: () => true },
  triggers: {
    targetConfirmed: {
      locked: true,
      can: (ctx, owner) => ctx.source === owner && !!ctx.target.equip.armor,
      run: (ctx, owner, game) => game.log(`${owner.name} 的【青釭剑】无视 ${ctx.target.name} 的防具`),
    },
  },
});

export const cixiong = equip({
  id: 'cixiong', name: '雌雄双股剑', subType: 'weapon', range: 2,
  desc: '当你使用【杀】指定一名异性角色为目标后，你可以令其选择一项：弃置一张手牌，或令你摸一张牌。',
  triggers: {
    targetConfirmed: {
      can: (ctx, owner) => ctx.source === owner && owner.hero.gender !== ctx.target.hero.gender,
      info: ctx => ({ target: ctx.target }),
      async run(ctx, owner, game) {
        const target = ctx.target;
        game.skillLog(owner, 'cixiong');
        if (target.hand.length > 0) {
          const give = await game.ask(target, 'askChooseCards', {
            count: 1, from: 'self', reason: 'cixiong', optional: true, info: { source: owner },
          });
          if (give?.length === 1 && target.hand.some(h => h.id === give[0]?.id)) {
            target.removeFromHand(give);
            game.discardCards(give);
            game.log(`${target.name} 弃置 ${cardLabel(give[0])}`);
            return;
          }
        }
        game.log(`${target.name} 不弃牌`);
        game.drawCards(owner, 1);
      },
    },
  },
  ai: {
    invoke: (game, p, info) => game.mode !== 'identity' || !isFriend(game, p, info.target),
    chooseCards: (game, p) => lowest(p.hand, 1),
  },
  prompt: {
    invoke: (info, h) => [`是否对 ${h.who(info.target)} 发动【雌雄双股剑】？`, '对方须弃置一张手牌，否则你摸一张牌'],
    chooseCards: (opts, h) => [`${h.who(opts.info?.source)} 发动了【雌雄双股剑】，请弃置一张手牌，否则其摸一张牌`, '', '不弃置'],
  },
});

export const hanbing = equip({
  id: 'hanbing', name: '寒冰剑', subType: 'weapon', range: 2,
  desc: '当你使用【杀】对目标角色造成伤害时，若该角色有牌，你可以防止此伤害，然后依次弃置其两张牌。',
  triggers: {
    beforeDamage: {
      can: (ctx, owner) => ctx.source === owner && isSha(ctx.card) && hasCard(ctx.target),
      info: ctx => ({ target: ctx.target }),
      async run(ctx, owner, game) {
        const target = ctx.target;
        game.skillLog(owner, 'hanbing', '，防止此伤害');
        for (let i = 0; i < 2 && hasCard(target); i++) {
          const pick = await game.ask(owner, 'askChooseCards', {
            count: 1, from: 'target-area', reason: 'hanbing', noJudge: true, info: { target },
          });
          const zone = pick?.[0] === 'hand' || target.equip[pick?.[0]] ? pick[0] : 'hand';
          const c = game.takeCardFromArea(target, zone);
          if (!c) break;
          game.discardCards([c]);
          game.log(`${owner.name} 弃置了 ${target.name} 的${zone === 'hand' ? '手牌' : ''} ${cardLabel(c)}`);
        }
        ctx.prevented = true;
      },
    },
  },
  ai: {
    // 防止伤害改为弃两张牌：对方有奸雄/反馈（受伤有收益）或体力充裕且牌多时发动
    invoke: (game, p, info) => {
      const t = info.target;
      if (!t) return false;
      const n = ownCount(t);
      if (n < 2) return false;
      if (hasSkill(t, 'jianxiong') || hasSkill(t, 'fankui')) return t.hp > 1;
      return t.hp >= 3 && n >= 3;
    },
    chooseCards: (game, p, opts) => pickArea(game, p, opts),
  },
  prompt: {
    invoke: (info, h) => ['是否发动【寒冰剑】？', `防止此伤害，改为依次弃置 ${h.who(info.target)} 的两张牌`],
    zone: '弃置',
  },
});

export const qinglong = equip({
  id: 'qinglong', name: '青龙偃月刀', subType: 'weapon', range: 3,
  desc: '当你使用的【杀】被【闪】抵消后，你可以对相同的目标再使用一张【杀】（可连续发动）。',
  triggers: {
    slashMissed: {
      optional: false,
      can: (ctx, owner) => ctx.source === owner && ctx.target.alive,
      async run(ctx, owner, game) {
        const chase = await respond(game, owner, { type: 'sha', reason: 'qinglong', info: { target: ctx.target, source: owner } });
        if (!chase) return;
        game.skillLog(owner, 'qinglong');
        await resolveSlash(game, owner, ctx.target, chase);
      },
    },
  },
  ai: { respond: (game, p) => pickResponse(game, p, 'sha', { realOnly: true }) },
  prompt: {
    respond: (req, h) => `【杀】被抵消，是否发动【青龙偃月刀】对 ${h.who(req.info?.target)} 再使用一张${h.cn(req.type)}？`,
    cancel: '不发动',
  },
});

export const guanshi = equip({
  id: 'guanshi', name: '贯石斧', subType: 'weapon', range: 3,
  desc: '当你使用的【杀】被【闪】抵消时，你可以弃置两张牌（不含贯石斧），令此【杀】依然造成伤害。',
  triggers: {
    slashDodged: {
      optional: false,
      can: (ctx, owner) => ctx.source === owner && ownCount(owner) - 1 >= 2,
      async run(ctx, owner, game) {
        const axe = owner.equip.weapon;
        const pool = [...owner.hand, ...Object.values(owner.equip).filter(e => e && e.id !== axe?.id)];
        const give = await game.ask(owner, 'askChooseCards', {
          count: 2, from: 'self', reason: 'guanshi', optional: true, includeEquip: true,
          exclude: axe ? [axe.id] : [], info: { target: ctx.target },
        });
        const ok = give?.length === 2 && new Set(give.map(c => c?.id)).size === 2
          && give.every(c => pool.some(x => x.id === c.id));
        if (!ok) return;
        owner.removeCards(give);
        game.discardCards(give);
        game.skillLog(owner, 'guanshi', `，弃置 ${give.map(cardLabel).join('、')}，强制命中`);
        ctx.hit = true;
        ctx.stop = true;
      },
    },
  },
  ai: {
    // 强制命中收益：对方残血时值得
    chooseCards: (game, p, opts) => {
      const t = opts.info?.target;
      if (!t || t.hp > 2 || p.hand.length < 3) return null;
      return lowest(p.hand, 2);
    },
  },
  prompt: {
    chooseCards: (opts, h, n) => [`是否发动【贯石斧】，弃置两张牌令此【杀】依然造成伤害？（已选 ${n}/2）`, '可弃置手牌或装备区的牌（贯石斧除外）'],
  },
});

export const zhangba = equip({
  id: 'zhangba', name: '丈八蛇矛', subType: 'weapon', range: 3,
  desc: '你可以将两张手牌当【杀】使用或打出。',
  viewAs: [{ as: 'sha', count: 2 }],
});

export const fangtian = equip({
  id: 'fangtian', name: '方天画戟', subType: 'weapon', range: 4,
  desc: '当你使用的【杀】是你最后的手牌时，此【杀】可以额外指定至多两个目标（1v1 无实际意义，身份局暂未实现多目标）。',
});

export const qilin = equip({
  id: 'qilin', name: '麒麟弓', subType: 'weapon', range: 5,
  desc: '当你使用【杀】对目标角色造成伤害时，你可以弃置其装备区里的一张坐骑牌。',
  triggers: {
    beforeDamage: {
      optional: false,
      can: (ctx, owner) => ctx.source === owner && isSha(ctx.card) && !!(ctx.target.equip['horse+'] || ctx.target.equip['horse-']),
      async run(ctx, owner, game) {
        const pick = await game.ask(owner, 'askChooseCards', {
          count: 1, from: 'horse', reason: 'qilin', optional: true, info: { target: ctx.target },
        });
        const slot = pick?.[0];
        if ((slot === 'horse+' || slot === 'horse-') && ctx.target.equip[slot]) {
          game.skillLog(owner, 'qilin');
          await game.loseEquip(ctx.target, slot);
        }
      },
    },
  },
  ai: {
    chooseCards: (game, p, opts) => {
      const t = opts.info?.target;
      if (t?.equip['horse+']) return ['horse+'];
      if (t?.equip['horse-']) return ['horse-'];
      return null;
    },
  },
  prompt: { zone: '弃置' },
});

// ---------- 防具 ----------
export const bagua = equip({
  id: 'bagua', name: '八卦阵', subType: 'armor',
  desc: '当你需要使用或打出一张【闪】时，你可以进行一次判定，若结果为红色，视为你使用或打出了一张【闪】。',
  judge: { name: '八卦阵', effective: c => c.suit === '♥' || c.suit === '♦', good: true },
  triggers: {
    needResponse: {
      // 被【杀】指定时，使用者的青釭剑可令其失效
      can: (ctx, owner, game) => ctx.player === owner && ctx.req.type === 'shan'
        && armorOf(owner, ctx.req.reason === 'sha' ? ctx.req.info?.source : null, game)?.name === 'bagua',
      info: ctx => ({ reason: ctx.req.reason, source: ctx.req.info?.source, nth: ctx.req.info?.nth, need: ctx.req.info?.need }),
      async run(ctx, owner, game) {
        game.skillLog(owner, 'bagua');
        const jc = await doJudge(game, owner, '八卦阵');
        if (judgeEffective('八卦阵', jc)) {
          game.log(`${owner.name} 八卦阵判定生效（${cardLabel(jc)} 为红色），视为打出【闪】`);
          ctx.result = { ...makeViewAs('shan', 'bagua'), effectOnly: true };
          ctx.stop = true;
        } else {
          game.log(`${owner.name} 的【八卦阵】判定未生效（${cardLabel(jc)} 为黑色）`);
        }
      },
    },
  },
  ai: { invoke: () => true },
  prompt: {
    invoke: (info, h) => {
      const what = info.reason === 'wanjian' ? '【万箭齐发】' : '【杀】';
      return [`${h.who(info.source)} 对你使用了${what}，是否发动【八卦阵】判定？${h.nth(info)}`, '判定为红色则视为打出一张【闪】'];
    },
  },
});

export const renwang = equip({
  id: 'renwang', name: '仁王盾', subType: 'armor',
  desc: '锁定技，黑色的【杀】对你无效。',
  triggers: {
    targetConfirmed: {
      locked: true,
      can: (ctx, owner, game) => ctx.target === owner && armorOf(owner, ctx.source, game)?.name === 'renwang'
        && cardColor(ctx.card) === 'black',
      run: (ctx, owner, game) => {
        ctx.nullified = true;
        game.log(`${owner.name} 的【仁王盾】生效，黑色【杀】对其无效`);
      },
    },
  },
});

// ---------- 坐骑 ----------
export const plusHorse = equip({
  id: 'ma+1', name: '+1马', subType: 'horse+',
  desc: '锁定技，其他角色计算与你的距离 +1。',
  modifiers: { distanceTo: () => 1 },
});

export const minusHorse = equip({
  id: 'ma-1', name: '-1马', subType: 'horse-',
  desc: '锁定技，你计算与其他角色的距离 -1。',
  modifiers: { distanceFrom: () => -1 },
});

export default [
  zhugenu, qinggang, cixiong, hanbing, qinglong, guanshi, zhangba, fangtian, qilin,
  bagua, renwang, plusHorse, minusHorse,
];


