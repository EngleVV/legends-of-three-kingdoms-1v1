import { Controller } from '../controller.js';
import {
  choosePlay, chooseRespond, choosePeach, chooseNullify,
  chooseCards, chooseJudgeReplace, chooseGuanxing,
} from './strategy.js';

export class AIController extends Controller {
  constructor(delay = 0) {
    super();
    this.delay = delay; // 每次决策延迟（UI 模式下便于阅读）
  }

  async wait() {
    if (this.delay > 0) await new Promise(r => setTimeout(r, this.delay));
  }

  async askPlayCard(player) {
    await this.wait();
    return choosePlay(this.game, player);
  }

  async askRespondCard(player, req) {
    await this.wait();
    return chooseRespond(this.game, player, req);
  }

  async askPeach(player, info) {
    await this.wait();
    return choosePeach(this.game, player, info);
  }

  async askNullify(player, effect) {
    await this.wait();
    return chooseNullify(this.game, player, effect);
  }

  async askSkillInvoke(player, skillId, info) {
    await this.wait();
    // 奸雄/反馈：收益为正必发；八卦阵：必判；雌雄：必发
    return ['jianxiong', 'fankui', 'bagua', 'cixiong'].includes(skillId);
  }

  async askChooseCards(player, opts) {
    await this.wait();
    return chooseCards(this.game, player, opts);
  }

  async askChooseJudgeReplace(player, info) {
    await this.wait();
    return chooseJudgeReplace(this.game, player, info);
  }

  async askGuanxing(player, cards) {
    await this.wait();
    return chooseGuanxing(this.game, player, cards);
  }
}
