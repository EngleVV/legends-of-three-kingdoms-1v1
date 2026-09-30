import { defineSkill } from '../../../core/registry.js';
import { isRed } from '../../../data/cards.js';

export default defineSkill({
  id: 'qingguo', name: '倾国', desc: '你可以将一张黑色手牌当【闪】使用或打出。',
  viewAs: [{ as: 'shan', ok: c => !isRed(c) }],
});
