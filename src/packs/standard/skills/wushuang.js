import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'wushuang', name: '无双', locked: true,
  desc: '锁定技，你使用【杀】时，目标需连续使用两张【闪】才能抵消；与你【决斗】的角色每次需连续打出两张【杀】。',
  // 对方需要额外打出的【闪】（你的【杀】）或【杀】（与你决斗）
  modifiers: { extraResponses: (ctx, p) => (ctx.from.seat === p.seat && ['shan', 'sha'].includes(ctx.kind) ? 1 : 0) },
});
