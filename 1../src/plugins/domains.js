// ======================= src/plugins/domain.js =======================

const { autoTranslate } = require("../translator");
const { getUser, updateUser } = require("../userStore");
const { safeEditMessage, safeSendMessage, safeAnswerCallback } = require("../utils/safeHandlers");
const config = require("../config");
const axios = require("axios");

module.exports = {
  name: "domain",
  command: null,
  callback: /^domain:(menu|create|typeA|typeCNAME|saveA|saveCNAME)$/i,

  // ===================== فتح القائمة =====================
  async openMainMenu(bot, message, lang, edit = false) {
    const txt = await autoTranslate("🌐 إدارة الدومينات — اختر:", lang);

    const keyboard = {
      inline_keyboard: [
        [{ text: await autoTranslate("➕ إنشاء دومين فرعي", lang), callback_data: "domain:create" }],
        [{ text: await autoTranslate("↩️ رجوع", lang), callback_data: "start:back" }]
      ]
    };

    if (edit) {
      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard
      });
    }

    return safeSendMessage(bot, message.chat.id, txt, { reply_markup: keyboard });
  },

  // ===================== معالجة الكول باك =====================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const action = query.data.split(":")[1];
    const lang = getUser(query.from.id)?.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    if (action === "menu") return this.openMainMenu(bot, query.message, lang, true);
    if (action === "create") return this.askSubName(bot, query.message, lang);
    if (action === "typeA") return this.askARecord(bot, query.message, lang);
    if (action === "typeCNAME") return this.askCNAMERecord(bot, query.message, lang);
    if (action === "saveA") return this.saveARecord(bot, query.message, lang);
    if (action === "saveCNAME") return this.saveCNAMERecord(bot, query.message, lang);
  },

  // ===================== الخطوة 1 — طلب اسم السبو دومين =====================
  async askSubName(bot, message, lang) {
    const user = getUser(message.chat.id);

    if ((user.subdomains?.length || 0) >= config.MAX_SUBDOMAINS_PER_USER) {
      return safeEditMessage(bot, {
        text: await autoTranslate("❌ وصلت للحد الأقصى من الدومينات!", lang),
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    updateUser(message.chat.id, { awaitSubName: true });

    return safeEditMessage(bot, {
      text: await autoTranslate("📝 أرسل اسم السبو دومين الآن\nمثال: <code>myshop</code>", lang),
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML"
    });
  },

  // ===================== الخطوة 2 — اختيار نوع الريكورد =====================
  async askRecordType(bot, chatId, subName, lang) {
    const txt = await autoTranslate(
      `☑ اختر نوع السجل لإضافة:\n<code>${subName}.${config.ROOT_DOMAIN}</code>`,
      lang
    );

    updateUser(chatId, { tempSub: subName });

    return bot.sendMessage(chatId, txt, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 Record A", callback_data: "domain:typeA" }],
          [{ text: "🔵 CNAME", callback_data: "domain:typeCNAME" }]
        ]
      }
    });
  },

  // ===================== الخطوة 3A — طلب IP =====================
  async askARecord(bot, message, lang) {
    updateUser(message.chat.id, { awaitARecordIP: true });

    return safeEditMessage(bot, {
      text: await autoTranslate("🌍 أرسل الآن عنوان الـ IP:", lang),
      chat_id: message.chat.id,
      message_id: message.message_id
    });
  },

  // ===================== الخطوة 3B — طلب CNAME =====================
  async askCNAMERecord(bot, message, lang) {
    updateUser(message.chat.id, { awaitCNAME: true });

    return safeEditMessage(bot, {
      text: await autoTranslate("🔗 أرسل الآن الـ CNAME target\nمثال: <code>app.example.com</code>", lang),
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML"
    });
  },

  // ===================== إنشاء Record A =====================
  async saveARecord(bot, msg, lang) {
    // handled in bot.js
  },

  // ===================== إنشاء CNAME =====================
  async saveCNAMERecord(bot, msg, lang) {
    // handled in bot.js
  }
};