import { Controller } from '../controller.js';
import {
  choosePlay, chooseRespond, choosePeach, chooseNullify,
  chooseCards, chooseInvoke, choosePlayers, chooseOption, chooseArrange,
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
    return chooseInvoke(this.game, player, skillId, info);
  }

  async askChooseCards(player, opts) {
    await this.wait();
    return chooseCards(this.game, player, opts);
  }

  async askChoosePlayers(player, opts) {
    await this.wait();
    return choosePlayers(this.game, player, opts);
  }

  async askChooseOption(player, opts) {
    await this.wait();
    return chooseOption(this.game, player, opts);
  }

  async askArrange(player, opts) {
    await this.wait();
    return chooseArrange(this.game, player, opts);
  }
}
