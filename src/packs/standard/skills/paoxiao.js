import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'paoxiao', name: '咆哮', locked: true, desc: '锁定技，出牌阶段，你使用【杀】无次数限制。',
  modifiers: { shaLimit: () => Infinity },
});
