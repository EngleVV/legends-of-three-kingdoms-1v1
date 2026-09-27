// 8 名武将（首批，可扩展）
export const HEROES = {
  liubei: { id: 'liubei', name: '刘备', kingdom: '蜀', hp: 4, gender: 'male', skills: ['rende'] },
  caocao: { id: 'caocao', name: '曹操', kingdom: '魏', hp: 4, gender: 'male', skills: ['jianxiong'] },
  sunquan: { id: 'sunquan', name: '孙权', kingdom: '吴', hp: 4, gender: 'male', skills: ['zhiheng'] },
  guanyu: { id: 'guanyu', name: '关羽', kingdom: '蜀', hp: 4, gender: 'male', skills: ['wusheng'] },
  zhangfei: { id: 'zhangfei', name: '张飞', kingdom: '蜀', hp: 4, gender: 'male', skills: ['paoxiao'] },
  zhugeliang: { id: 'zhugeliang', name: '诸葛亮', kingdom: '蜀', hp: 3, gender: 'male', skills: ['guanxing', 'kongcheng'] },
  simayi: { id: 'simayi', name: '司马懿', kingdom: '魏', hp: 3, gender: 'male', skills: ['fankui', 'guicai'] },
  lvbu: { id: 'lvbu', name: '吕布', kingdom: '群', hp: 4, gender: 'male', skills: ['wushuang'] },
};

export const HERO_LIST = Object.values(HEROES);

export function hasSkill(player, skillId) {
  return player.hero.skills.includes(skillId);
}
