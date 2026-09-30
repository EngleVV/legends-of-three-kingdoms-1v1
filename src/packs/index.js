// 扩展包登记处：新增扩展包时在这里 import 并 registerPack
import { registerPack } from '../core/registry.js';
import standard from './standard/index.js';

registerPack(standard);
