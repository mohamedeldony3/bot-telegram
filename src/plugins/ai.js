// src/plugins/ai.js
const { translate, t } = require('../translator');

// نفس الـ Regex اللي إنت كتبه:
const AI_COMMAND = /^(جبتي|ai|gpt|ذكاء)(\s+.*)?$/i;

module.exports = {
  name: 'ai',
  command: AI_COMMAND,

  /**
   * @param {Object} ctx - سياق الرسالة
   * ctx: { bot, msg, user, lang, text, args, reply }
   */
  async run(ctx) {
    const { lang, text, reply } = ctx;

    // استخرج السؤال بعد الكلمة الأساسية
    const match = text.match(AI_COMMAND);
    const prompt = (match && match[2]) ? match[2].trim() : '';

    if (!prompt) {
      if (lang === 'ar') {
        return reply('اكتب سؤالك بعد الأمر، مثال:\nجبتي ما هو الذكاء الاصطناعي؟');
      } else {
        return reply('Write your question after the command, e.g.\nai what is artificial intelligence?');
      }
    }

    // هنا تقدر تترجم سؤال المستخدم للإنجليزي تبعاً للغة، وترسله لـ GPT حقيقي
    const promptInEnglish = await translate(prompt, 'en');

    // مكان استدعاء موديل ذكاء فعلي (OpenAI مثلاً)
    // const answerInEnglish = await callYourModel(promptInEnglish);

    // مؤقتًا، هنرد رد بسيط تجريبي
    const answerInEnglish = `You said: "${promptInEnglish}"`;

    // ترجم الرد للغة المستخدم (لو لغته عربي مثلاً)
    const finalAnswer = await translate(answerInEnglish, lang);

    await reply(finalAnswer);
  },
};