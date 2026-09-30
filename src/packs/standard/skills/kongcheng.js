import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'kongcheng', name: '空城', locked: true, desc: '锁定技，若你没有手牌，你不能成为【杀】或【决斗】的目标。',
  modifiers: {
    targetable: (ctx, p) => !(p.hand.length === 0 && ['sha', 'juedou'].includes(ctx.card)),
  },
});
