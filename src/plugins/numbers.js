// ======================= src/plugins/numbers.js =======================

const { autoTranslate } = require("../translator");
const {
  safeSendMessage,
  safeEditMessage,
  safeAnswerCallback
} = require("../utils/safeHandlers");
const { getUser } = require("../userStore");

module.exports = {
  name: "numbers",
  command: null,
  callback: /^numbers:(menu|paid|free)$/i,

  // =================== تشغيل مباشر من الراوتر ===================
  async openMainMenu(bot, message, lang, edit = false) {
    return this.openMenu(bot, message, lang, edit);
  },

  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const lang = getUser(query.from.id)?.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    const action = query.data.split(":")[1];

    if (action === "menu") {
      return this.openMenu(bot, query.message, lang, true);
    }

    if (action === "paid") {
      return this.openPaid(bot, query.message, lang);
    }

    if (action === "free") {
      return this.openFree(bot, query.message, lang);
    }
  },

  // ⭐ القائمة الرئيسية
  async openMenu(bot, message, lang, edit = false) {
    const title = await autoTranslate("🔢 قسم الأرقام — اختر المورد:", lang);

    const keyboard = {
      inline_keyboard: [
        [
          { text: await autoTranslate("📞 المورد المدفوع", lang), callback_data: "numbers:paid" }
        ],
        [
          { text: await autoTranslate("📱 المورد المجاني", lang), callback_data: "numbers:free" }
        ],
        [
          { text: await autoTranslate("⬅️ الرجوع", lang), callback_data: "start:back" }
        ]
      ]
    };

    if (edit)
      return safeEditMessage(bot, {
        text: title,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard
      });

    return safeSendMessage(bot, message.chat.id, title, {
      reply_markup: keyboard
    });
  },

  // ⭐ المورد المدفوع
  async openPaid(bot, message, lang) {
    const txt = await autoTranslate(
      "💳 <b>المورد المدفوع</b>\n\n" +
      "هنا يمكن إضافة خدمات مدفوعة لاحقًا.",
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("⬅️ الرجوع", lang), callback_data: "numbers:menu" }]
        ]
      }
    });
  },

  // ⭐ المورد المجاني
  async openFree(bot, message, lang) {
    const txt = await autoTranslate(
      "🎁 <b>المورد المجاني</b>\n\n" +
      "سيتم إضافة أرقام مجانية لاحقاً.",
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("⬅️ الرجوع", lang), callback_data: "numbers:menu" }]
        ]
      }
    });
  }
};