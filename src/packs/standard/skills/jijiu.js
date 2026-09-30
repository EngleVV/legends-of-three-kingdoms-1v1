import { defineSkill } from '../../../core/registry.js';
import { isRed } from '../../../data/cards.js';

export default defineSkill({
  id: 'jijiu', name: '急救', desc: '你的回合外，你可以将一张红色牌当【桃】使用。',
  viewAs: [{ as: 'tao', ok: c => isRed(c), equip: true, when: (game, p) => !game || game.currentTurnSeat !== p.seat }],
});
