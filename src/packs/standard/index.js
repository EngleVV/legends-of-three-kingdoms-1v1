// 标准包：25 名武将、108 张牌
import heroes from './heroes.js';
import deck from './deck.js';
import basic from './cards/basic.js';
import tricks from './cards/tricks.js';
import delayed from './cards/delayed.js';
import equips from './cards/equips.js';
// 魏
import jianxiong from './skills/jianxiong.js';
import hujia from './skills/hujia.js';
import fankui from './skills/fankui.js';
import guicai from './skills/guicai.js';
import ganglie from './skills/ganglie.js';
import tuxi from './skills/tuxi.js';
import luoyi from './skills/luoyi.js';
import tiandu from './skills/tiandu.js';
import yiji from './skills/yiji.js';
import qingguo from './skills/qingguo.js';
import luoshen from './skills/luoshen.js';
// 蜀
import rende from './skills/rende.js';
import jijiang from './skills/jijiang.js';
import wusheng from './skills/wusheng.js';
import paoxiao from './skills/paoxiao.js';
import guanxing from './skills/guanxing.js';
import kongcheng from './skills/kongcheng.js';
import longdan from './skills/longdan.js';
import mashu from './skills/mashu.js';
import tieji from './skills/tieji.js';
import jizhi from './skills/jizhi.js';
import qicai from './skills/qicai.js';
// 吴
import zhiheng from './skills/zhiheng.js';
import jiuyuan from './skills/jiuyuan.js';
import qixi from './skills/qixi.js';
import keji from './skills/keji.js';
import kurou from './skills/kurou.js';
import yingzi from './skills/yingzi.js';
import fanjian from './skills/fanjian.js';
import guose from './skills/guose.js';
import liuli from './skills/liuli.js';
import qianxun from './skills/qianxun.js';
import lianying from './skills/lianying.js';
import jieyin from './skills/jieyin.js';
import xiaoji from './skills/xiaoji.js';
// 群
import jijiu from './skills/jijiu.js';
import qingnang from './skills/qingnang.js';
import wushuang from './skills/wushuang.js';
import lijian from './skills/lijian.js';
import biyue from './skills/biyue.js';

export default {
  id: 'standard',
  name: '标准包',
  avatarDir: 'assets/heroes',
  heroes,
  deck,
  cards: [...basic, ...tricks, ...delayed, ...equips],
  skills: [
    jianxiong, hujia, fankui, guicai, ganglie, tuxi, luoyi, tiandu, yiji, qingguo, luoshen,
    rende, jijiang, wusheng, paoxiao, guanxing, kongcheng, longdan, mashu, tieji, jizhi, qicai,
    zhiheng, jiuyuan, qixi, keji, kurou, yingzi, fanjian, guose, liuli, qianxun, lianying, jieyin, xiaoji,
    jijiu, qingnang, wushuang, lijian, biyue,
  ],
};
