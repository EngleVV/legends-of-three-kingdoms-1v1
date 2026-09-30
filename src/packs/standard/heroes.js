// 标准版 25 名武将（技能按原版标准包描述）
const h = (id, name, kingdom, hp, gender, skills, lordSkills = []) => ({ id, name, kingdom, hp, gender, skills, lordSkills });

export default [
  // ---- 魏 ----
  h('caocao', '曹操', '魏', 4, 'male', ['jianxiong'], ['hujia']),
  h('simayi', '司马懿', '魏', 3, 'male', ['fankui', 'guicai']),
  h('xiahoudun', '夏侯惇', '魏', 4, 'male', ['ganglie']),
  h('zhangliao', '张辽', '魏', 4, 'male', ['tuxi']),
  h('xuchu', '许褚', '魏', 4, 'male', ['luoyi']),
  h('guojia', '郭嘉', '魏', 3, 'male', ['tiandu', 'yiji']),
  h('zhenji', '甄姬', '魏', 3, 'female', ['qingguo', 'luoshen']),
  // ---- 蜀 ----
  h('liubei', '刘备', '蜀', 4, 'male', ['rende'], ['jijiang']),
  h('guanyu', '关羽', '蜀', 4, 'male', ['wusheng']),
  h('zhangfei', '张飞', '蜀', 4, 'male', ['paoxiao']),
  h('zhugeliang', '诸葛亮', '蜀', 3, 'male', ['guanxing', 'kongcheng']),
  h('zhaoyun', '赵云', '蜀', 4, 'male', ['longdan']),
  h('machao', '马超', '蜀', 4, 'male', ['mashu', 'tieji']),
  h('huangyueying', '黄月英', '蜀', 3, 'female', ['jizhi', 'qicai']),
  // ---- 吴 ----
  h('sunquan', '孙权', '吴', 4, 'male', ['zhiheng'], ['jiuyuan']),
  h('ganning', '甘宁', '吴', 4, 'male', ['qixi']),
  h('lvmeng', '吕蒙', '吴', 4, 'male', ['keji']),
  h('huanggai', '黄盖', '吴', 4, 'male', ['kurou']),
  h('zhouyu', '周瑜', '吴', 3, 'male', ['yingzi', 'fanjian']),
  h('daqiao', '大乔', '吴', 3, 'female', ['guose', 'liuli']),
  h('luxun', '陆逊', '吴', 3, 'male', ['qianxun', 'lianying']),
  h('sunshangxiang', '孙尚香', '吴', 3, 'female', ['jieyin', 'xiaoji']),
  // ---- 群 ----
  h('huatuo', '华佗', '群', 3, 'male', ['jijiu', 'qingnang']),
  h('lvbu', '吕布', '群', 4, 'male', ['wushuang']),
  h('diaochan', '貂蝉', '群', 3, 'female', ['lijian', 'biyue']),
];
