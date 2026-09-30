// 军争篇：属性伤害（火焰、雷电）、铁索连环、酒等 52 张新牌，不含新武将
import deck from './deck.js';
import basic from './cards/basic.js';
import tricks from './cards/tricks.js';
import equips from './cards/equips.js';

export default {
  id: 'junzheng',
  name: '军争篇',
  heroes: [],
  skills: [],
  cards: [...basic, ...tricks, ...equips],
  deck,
};
