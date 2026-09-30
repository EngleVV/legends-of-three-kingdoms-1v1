// 武将目录：加载全部扩展包后，从注册表导出武将与技能信息（界面、测试的入口）
import '../packs/index.js';

export {
  HEROES, HERO_LIST, LORD_HEROES, SKILL_INFO, PACKS, skillName, skillDesc, hasSkill, hasLordSkill, isMale,
} from '../core/registry.js';
