import { defineSkill } from '../../../core/registry.js';
import { isRed } from '../../../data/cards.js';

export default defineSkill({
  id: 'wusheng', name: '武圣', desc: '你可以将一张红色牌当【杀】使用或打出。',
  viewAs: [{ as: 'sha', ok: c => isRed(c), equip: true }],
});
