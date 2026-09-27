// 技能注册表
// 说明：以下技能不在此注册钩子，而由引擎在对应判据处通过 hasSkill 同步判定，
// 以保证引擎/UI/AI 共用同一份规则（判据集中在 data/cards.js）：
// - 仁德(rende)/制衡(zhiheng)：主动技能，在 card-use.js 的 useSkill 中结算
// - 武圣(wusheng)：转化技，canUseAsSha 判定「红色牌当【杀】」
// - 咆哮(paoxiao)：锁定技，shaLimitOf 判定「【杀】无次数限制」
// - 无双(wushuang)：锁定技，杀/决斗结算中判定需两张【闪】/【杀】
// 其余技能在此注册钩子。
import jianxiong from './jianxiong.js';
import fankui from './fankui.js';
import guicai from './guicai.js';
import guanxing from './guanxing.js';
import kongcheng from './kongcheng.js';

export const SKILL_REGISTRY = {
  jianxiong,
  fankui,
  guicai,
  guanxing,
  kongcheng,
};
