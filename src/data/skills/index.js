// 技能注册表
// 说明：以下技能不在此注册钩子，而由引擎在对应判据处通过 hasSkill 同步判定，
// 以保证引擎/UI/AI 共用同一份规则（判据集中在 data/cards.js）：
// - 仁德(rende)/制衡(zhiheng)：主动技能，在 card-use.js 的 useSkill 中结算
// - 转化技（武圣/龙胆/倾国/奇袭/国色/急救）：data/cards.js 的 CONVERSIONS 表
// - 距离/目标类锁定技（马术/奇才/谦逊）：data/cards.js 的 distance/canTarget
// - 阶段类（洛神/突袭/裸衣/英姿/克己/闭月）：skills/phase.js，由 turn.js 调用
// - 天妒：core/judge.js；铁骑/流离/裸衣伤害：core/card-use.js；连营/枭姬：Game.flushLoseTriggers
// - 主动技能（仁德/制衡/苦肉/反间/结姻/青囊/离间/激将）：data/active-skills.js + core/card-use.js 的 useSkill
// - 咆哮(paoxiao)：锁定技，shaLimitOf 判定「【杀】无次数限制」
// - 无双(wushuang)：锁定技，杀/决斗结算中判定需两张【闪】/【杀】
// 其余技能在此注册钩子。
import jianxiong from './jianxiong.js';
import fankui from './fankui.js';
import guicai from './guicai.js';
import guanxing from './guanxing.js';
import kongcheng from './kongcheng.js';
import ganglie from './ganglie.js';
import yiji from './yiji.js';

export const SKILL_REGISTRY = {
  jianxiong,
  fankui,
  guicai,
  guanxing,
  kongcheng,
  ganglie,
  yiji,
};
