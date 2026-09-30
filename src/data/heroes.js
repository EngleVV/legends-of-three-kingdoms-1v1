// 标准版 25 名武将（技能按原版标准包描述）
const h = (id, name, kingdom, hp, gender, skills, lordSkills) =>
  ({ id, name, kingdom, hp, gender, skills, ...(lordSkills ? { lordSkills } : {}) });

export const HEROES = {
  // ---- 魏 ----
  caocao: h('caocao', '曹操', '魏', 4, 'male', ['jianxiong'], ['hujia']),
  simayi: h('simayi', '司马懿', '魏', 3, 'male', ['fankui', 'guicai']),
  xiahoudun: h('xiahoudun', '夏侯惇', '魏', 4, 'male', ['ganglie']),
  zhangliao: h('zhangliao', '张辽', '魏', 4, 'male', ['tuxi']),
  xuchu: h('xuchu', '许褚', '魏', 4, 'male', ['luoyi']),
  guojia: h('guojia', '郭嘉', '魏', 3, 'male', ['tiandu', 'yiji']),
  zhenji: h('zhenji', '甄姬', '魏', 3, 'female', ['qingguo', 'luoshen']),
  // ---- 蜀 ----
  liubei: h('liubei', '刘备', '蜀', 4, 'male', ['rende'], ['jijiang']),
  guanyu: h('guanyu', '关羽', '蜀', 4, 'male', ['wusheng']),
  zhangfei: h('zhangfei', '张飞', '蜀', 4, 'male', ['paoxiao']),
  zhugeliang: h('zhugeliang', '诸葛亮', '蜀', 3, 'male', ['guanxing', 'kongcheng']),
  zhaoyun: h('zhaoyun', '赵云', '蜀', 4, 'male', ['longdan']),
  machao: h('machao', '马超', '蜀', 4, 'male', ['mashu', 'tieji']),
  huangyueying: h('huangyueying', '黄月英', '蜀', 3, 'female', ['jizhi', 'qicai']),
  // ---- 吴 ----
  sunquan: h('sunquan', '孙权', '吴', 4, 'male', ['zhiheng'], ['jiuyuan']),
  ganning: h('ganning', '甘宁', '吴', 4, 'male', ['qixi']),
  lvmeng: h('lvmeng', '吕蒙', '吴', 4, 'male', ['keji']),
  huanggai: h('huanggai', '黄盖', '吴', 4, 'male', ['kurou']),
  zhouyu: h('zhouyu', '周瑜', '吴', 3, 'male', ['yingzi', 'fanjian']),
  daqiao: h('daqiao', '大乔', '吴', 3, 'female', ['guose', 'liuli']),
  luxun: h('luxun', '陆逊', '吴', 3, 'male', ['qianxun', 'lianying']),
  sunshangxiang: h('sunshangxiang', '孙尚香', '吴', 3, 'female', ['jieyin', 'xiaoji']),
  // ---- 群 ----
  huatuo: h('huatuo', '华佗', '群', 3, 'male', ['jijiu', 'qingnang']),
  lvbu: h('lvbu', '吕布', '群', 4, 'male', ['wushuang']),
  diaochan: h('diaochan', '貂蝉', '群', 3, 'female', ['lijian', 'biyue']),
};

export const HERO_LIST = Object.values(HEROES);

// 技能名与描述（唯一来源：界面技能说明、战报、选将界面都从这里取）
export const SKILL_INFO = {
  // 魏
  jianxiong: ['奸雄', '你受到伤害后，可以获得对你造成伤害的牌。'],
  hujia: ['护驾', '主公技，当你需要使用或打出一张【闪】时，你可以令其他魏势力角色打出一张【闪】（视为由你使用或打出）。'],
  fankui: ['反馈', '你受到伤害后，可以获得伤害来源的一张牌。'],
  guicai: ['鬼才', '在任意角色的判定牌生效前，你可以打出一张手牌代替之。'],
  ganglie: ['刚烈', '你受到伤害后，可以进行一次判定，若结果不为红桃，则伤害来源选择一项：弃置两张手牌，或受到你造成的 1 点伤害。'],
  tuxi: ['突袭', '摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色的各一张手牌。'],
  luoyi: ['裸衣', '摸牌阶段，你可以少摸一张牌，若如此做，本回合你使用【杀】或【决斗】对目标造成的伤害 +1。'],
  tiandu: ['天妒', '你的判定牌生效后，你可以获得此牌。'],
  yiji: ['遗计', '你每受到 1 点伤害，可以观看牌堆顶的两张牌，然后将其分配给任意角色。'],
  qingguo: ['倾国', '你可以将一张黑色手牌当【闪】使用或打出。'],
  luoshen: ['洛神', '准备阶段，你可以进行一次判定，若结果为黑色，你获得此牌，然后你可以重复此流程，直到出现红色的判定结果。'],
  // 蜀
  rende: ['仁德', '出牌阶段，你可以将任意张手牌交给其他角色，你以此法每回合给出第二张牌时，回复 1 点体力。'],
  jijiang: ['激将', '主公技，当你需要使用或打出一张【杀】时，你可以令其他蜀势力角色打出一张【杀】（视为由你使用或打出）。'],
  wusheng: ['武圣', '你可以将一张红色牌当【杀】使用或打出。'],
  paoxiao: ['咆哮', '锁定技，出牌阶段，你使用【杀】无次数限制。'],
  guanxing: ['观星', '准备阶段，你可以观看牌堆顶的 X 张牌（X 为存活角色数且至多为 5），然后将其以任意顺序置于牌堆顶或牌堆底。'],
  kongcheng: ['空城', '锁定技，若你没有手牌，你不能成为【杀】或【决斗】的目标。'],
  longdan: ['龙胆', '你可以将一张【杀】当【闪】、一张【闪】当【杀】使用或打出。'],
  mashu: ['马术', '锁定技，你计算与其他角色的距离 -1。'],
  tieji: ['铁骑', '当你使用【杀】指定一名角色为目标后，你可以进行一次判定，若结果为红色，该角色不能使用【闪】响应此【杀】。'],
  jizhi: ['集智', '当你使用一张非延时锦囊牌时，你可以摸一张牌。'],
  qicai: ['奇才', '锁定技，你使用锦囊牌无距离限制。'],
  // 吴
  zhiheng: ['制衡', '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。'],
  jiuyuan: ['救援', '主公技，锁定技，其他吴势力角色在你濒死时对你使用【桃】，你额外回复 1 点体力。'],
  qixi: ['奇袭', '你可以将一张黑色牌当【过河拆桥】使用。'],
  keji: ['克己', '若你于出牌阶段内没有使用或打出过【杀】，你可以跳过此回合的弃牌阶段。'],
  kurou: ['苦肉', '出牌阶段，你可以失去 1 点体力，然后摸两张牌。'],
  yingzi: ['英姿', '摸牌阶段，你可以多摸一张牌。'],
  fanjian: ['反间', '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其获得你的一张手牌并展示之，若此牌的花色与其所选的不同，你对其造成 1 点伤害。'],
  guose: ['国色', '你可以将一张方块牌当【乐不思蜀】使用。'],
  liuli: ['流离', '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的一名其他角色（不能是此【杀】的使用者）。'],
  qianxun: ['谦逊', '锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标。'],
  lianying: ['连营', '当你失去最后的手牌时，你可以摸一张牌。'],
  jieyin: ['结姻', '出牌阶段限一次，你可以弃置两张手牌并选择一名已受伤的男性角色，你与其各回复 1 点体力。'],
  xiaoji: ['枭姬', '当你失去装备区里的一张牌时，你可以摸两张牌。'],
  // 群
  jijiu: ['急救', '你的回合外，你可以将一张红色牌当【桃】使用。'],
  qingnang: ['青囊', '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力。'],
  wushuang: ['无双', '锁定技，你使用【杀】时，目标需连续使用两张【闪】才能抵消；与你【决斗】的角色每次需连续打出两张【杀】。'],
  lijian: ['离间', '出牌阶段限一次，你可以弃置一张牌并选择两名男性角色，视为后选择的角色对先选择的角色使用一张【决斗】（此【决斗】不能被【无懈可击】响应）。'],
  biyue: ['闭月', '结束阶段，你可以摸一张牌。'],
};

export const skillName = id => SKILL_INFO[id]?.[0] || id;
export const skillDesc = id => SKILL_INFO[id]?.[1] || '';

export function hasSkill(player, skillId) {
  return player.hero.skills.includes(skillId);
}

export const isMale = p => p.hero.gender === 'male';

// 主公技：仅当该角色身份为主公时拥有
//   激将（刘备）：需要使用或打出【杀】时，可令其他蜀势力角色代为打出
//   护驾（曹操）：需要使用或打出【闪】时，可令其他魏势力角色代为打出
//   救援（孙权）：其他吴势力角色在你濒死时对你使用【桃】，你额外回复 1 点体力
export const LORD_SKILL_KINGDOM = { jijiang: '蜀', hujia: '魏', jiuyuan: '吴' };

export function hasLordSkill(player, skillId) {
  return player.role === 'lord' && !!player.hero.lordSkills?.includes(skillId);
}
