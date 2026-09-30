import { defineSkill, kindOf } from '../../../core/registry.js';

export default defineSkill({
  id: 'longdan', name: '龙胆', desc: '你可以将一张【杀】当【闪】、一张【闪】当【杀】使用或打出。',
  viewAs: [
    { as: 'shan', ok: c => kindOf(c.name) === 'sha' },
    { as: 'sha', ok: c => c.name === 'shan' },
  ],
});
