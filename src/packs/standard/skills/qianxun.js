import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'qianxun', name: '谦逊', locked: true, desc: '锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标。',
  modifiers: { targetable: ctx => !['shunshou', 'le'].includes(ctx.card) },
});
