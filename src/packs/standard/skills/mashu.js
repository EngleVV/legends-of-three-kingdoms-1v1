import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'mashu', name: '马术', locked: true, desc: '锁定技，你计算与其他角色的距离 -1。',
  modifiers: { distanceFrom: () => -1 },
});
