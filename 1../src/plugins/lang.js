// ======================= src/plugins/lang.js =======================

const { autoTranslate } = require("../translator");
const { getUser, updateUser } = require("../userStore");
const { safeEditMessage, safeAnswerCallback } = require("../utils/safeHandlers");

module.exports = {
  name: "lang",
  command: null,
  callback: /^lang:(menu|set):(ar|en|ru)$/i,

  // فتح القائمة من start.js
  async openMainMenu(bot, message, lang) {
    return this.openMenu(bot, message, lang);
  },

  // ===================== قائمة اختيار اللغة =====================
  async openMenu(bot, message, lang) {
    const title = await autoTranslate("🌐 اختر اللغة:", lang);

    const keyboard = {
      inline_keyboard: [
        [{ text: "🇪🇬 العربية", callback_data: "lang:set:ar" }],
        [{ text: "🇬🇧 English", callback_data: "lang:set:en" }],
        [{ text: "🇷🇺 Русский", callback_data: "lang:set:ru" }],
        [{ text: await autoTranslate("⬅️ الرجوع", lang), callback_data: "start:back" }]
      ]
    };

    return safeEditMessage(bot, {
      text: title,
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: keyboard
    });
  },

  // ===================== عند اختيار اللغة =====================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    await safeAnswerCallback(bot, query.id);

    const [, action, chosenLang] = query.data.split(":");
    const userId = query.from.id;

    if (action === "set") {
      updateUser(userId, { lang: chosenLang });

      const text = await autoTranslate("✔️ تم تغيير اللغة بنجاح!", chosenLang);

      return safeEditMessage(bot, {
        text,
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: await autoTranslate("⬅️ الرجوع للقائمة", chosenLang),
                callback_data: "start:back"
              }
            ]
          ]
        }
      });
    }
  }
};