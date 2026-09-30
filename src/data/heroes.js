// 8 名武将（首批，可扩展）
export const HEROES = {
  liubei: { id: 'liubei', name: '刘备', kingdom: '蜀', hp: 4, gender: 'male', skills: ['rende'], lordSkills: ['jijiang'] },
  caocao: { id: 'caocao', name: '曹操', kingdom: '魏', hp: 4, gender: 'male', skills: ['jianxiong'], lordSkills: ['hujia'] },
  sunquan: { id: 'sunquan', name: '孙权', kingdom: '吴', hp: 4, gender: 'male', skills: ['zhiheng'], lordSkills: ['jiuyuan'] },
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

// 主公技：仅当该角色身份为主公时拥有
//   激将（刘备）：需要使用或打出【杀】时，可令其他蜀势力角色代为打出
//   护驾（曹操）：需要使用或打出【闪】时，可令其他魏势力角色代为打出
//   救援（孙权）：其他吴势力角色在你濒死时对你使用【桃】，你额外回复 1 点体力
export const LORD_SKILL_KINGDOM = { jijiang: '蜀', hujia: '魏', jiuyuan: '吴' };

export function hasLordSkill(player, skillId) {
  return player.role === 'lord' && !!player.hero.lordSkills?.includes(skillId);
}
