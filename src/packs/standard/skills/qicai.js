import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'qicai', name: '奇才', locked: true, desc: '锁定技，你使用锦囊牌无距离限制。',
  modifiers: { noDistanceLimit: ctx => ['trick', 'delayed'].includes(ctx.card?.type) },
});
