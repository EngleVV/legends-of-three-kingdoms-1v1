import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'guose', name: '国色', desc: '你可以将一张方块牌当【乐不思蜀】使用。',
  viewAs: [{ as: 'le', ok: c => c.suit === '♦', equip: true }],
});
