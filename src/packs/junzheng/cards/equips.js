// 军争篇装备：古锭刀、朱雀羽扇、藤甲、白银狮子（骅骝为 +1 马，沿用标准版定义）
import { equip, isSha } from '../../standard/cards/equips.js';
import { armorOf } from '../../../data/cards.js';

// 防具的生效判断：【杀】的使用者装备青釭剑时无视防具
const wears = (owner, id, ctx, game) => armorOf(owner, isSha(ctx.card) ? (ctx.source || ctx.from) : null, game)?.name === id;

export const gudingdao = equip({
  id: 'gudingdao', name: '古锭刀', subType: 'weapon', range: 2,
  desc: '锁定技，当你使用【杀】对目标角色造成伤害时，若其没有手牌，此伤害 +1。',
  triggers: {
    beforeDamage: {
      locked: true,
      can: (ctx, owner) => ctx.source === owner && isSha(ctx.card) && ctx.target.hand.length === 0,
      run(ctx, owner, game) {
        ctx.amount += 1;
        game.log(`【古锭刀】${ctx.target.name} 没有手牌，伤害 +1`);
      },
    },
  },
});

export const zhuque = equip({
  id: 'zhuque', name: '朱雀羽扇', subType: 'weapon', range: 4,
  desc: '你可以将一张普通【杀】当火【杀】使用。',
  viewAs: [{ as: 'huosha', ok: c => c.name === 'sha' }],
});

export const tengjia = equip({
  id: 'tengjia', name: '藤甲', subType: 'armor',
  desc: '锁定技，【南蛮入侵】、【万箭齐发】和普通【杀】对你无效；你受到火焰伤害时，此伤害 +1。',
  modifiers: {
    effective: (ctx, owner, game) => {
      if (!wears(owner, 'tengjia', ctx, game)) return true;
      if (ctx.kind === 'nanman' || ctx.kind === 'wanjian') return false;
      return !(ctx.kind === 'sha' && ctx.nature === 'normal');
    },
  },
  triggers: {
    receiveDamage: {
      locked: true,
      can: (ctx, owner, game) => ctx.target === owner && ctx.nature === 'fire' && wears(owner, 'tengjia', ctx, game),
      run(ctx, owner, game) {
        ctx.amount += 1;
        game.log(`${owner.name} 的【藤甲】被点燃，火焰伤害 +1`);
      },
    },
  },
  ai: { value: 5 },
});

export const baiyin = equip({
  id: 'baiyin', name: '白银狮子', subType: 'armor',
  desc: '锁定技，当你受到大于 1 点的伤害时，防止多余的伤害；当你失去装备区里的【白银狮子】后，你回复 1 点体力。',
  triggers: {
    receiveDamage: {
      locked: true,
      can: (ctx, owner, game) => ctx.target === owner && ctx.amount > 1 && wears(owner, 'baiyin', ctx, game),
      run(ctx, owner, game) {
        game.log(`${owner.name} 的【白银狮子】防止了 ${ctx.amount - 1} 点伤害`);
        ctx.amount = 1;
      },
    },
  },
  onLose(game, player) {
    if (player.hp < player.maxHp) {
      game.log(`${player.name} 失去【白银狮子】`);
      game.heal(player, 1);
    }
  },
  ai: { value: 6 },
});

export default [gudingdao, zhuque, tengjia, baiyin];
