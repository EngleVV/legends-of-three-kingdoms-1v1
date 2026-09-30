import { defineSkill } from '../../../core/registry.js';
import { helperTrigger, helperAI, helperPrompt } from './_lord.js';

export default defineSkill({
  id: 'hujia', name: '护驾', lord: true,
  desc: '主公技，当你需要使用或打出一张【闪】时，你可以令其他魏势力角色打出一张【闪】（视为由你使用或打出）。',
  triggers: { needResponse: helperTrigger('hujia', 'shan', '魏') },
  ai: helperAI('shan'),
  prompt: helperPrompt('hujia', 'shan', '魏'),
});
