import { defineSkill } from '../../../core/registry.js';
import { isRed } from '../../../data/cards.js';

export default defineSkill({
  id: 'qixi', name: '奇袭', desc: '你可以将一张黑色牌当【过河拆桥】使用。',
  viewAs: [{ as: 'guohe', ok: c => !isRed(c), equip: true }],
});
