// ===================== src/plugins/platform.js =====================

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const { safeEditMessage } = require("../utils/safeHandlers");

// كاش للترجمة
const translationCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

async function getCached(text, lang) {
  const key = `${text}_${lang}`;
  const cached = translationCache.get(key);

  if (cached && Date.now() - cached.time < CACHE_DURATION) {
    return cached.value;
  }

  const translated = await autoTranslate(text, lang);
  translationCache.set(key, { value: translated, time: Date.now() });
  return translated;
}

module.exports = {
  name: "platform",
  command: null,
  callback: /^platform:(open|panel|dash|wings|platform|menuserver|back)$/i,

  async run(ctx) {
    const { bot, msg } = ctx;
    const lang = getUser(msg.from.id)?.lang || "ar";
    return this.openMainMenu(bot, msg, lang);
  },

  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const action = query.data.split(":")[1];
    const chatId = query.message.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ⭐⭐⭐ زر الرجوع الصحيح ⭐⭐⭐
    if (action === "open" || action === "back") {
      return bot.editMessageText("🔙", {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 رجوع للقائمة الرئيسية", callback_data: "start:back" }]
          ]
        }
      });
    }

    // باقي الأقسام...
    if (action === "menuserver") {
      const ms = require("./menuserver");
      return ms.openMainMenu(bot, query.message, lang, true);
    }

    if (action === "panel") {
      const installer = require("./installpanel");
      return installer.startWizard(bot, query.message, lang);
    }

    if (action === "dash") {
      const installer = require("./installdash");
      return installer.startWizard(bot, query.message, lang);
    }

    if (action === "wings") {
      const installer = require("./installwings");
      return installer.startWizard(bot, query.message, lang);
    }

    if (action === "platform") {
      const installer = require("./installplatform");
      return installer.startWizard(bot, query.message, lang);
    }
  },

  // ⭐ قائمة المنصة
  async openMainMenu(bot, message, lang, edit = false) {
    const title = await getCached("⚙️ قسم المنصة — اختر الخدمة:", lang);

    const keyboard = {
      inline_keyboard: [
        [
          { text: await getCached("🛠 تثبيت الداش", lang), callback_data: "platform:dash" },
          { text: await getCached("🛠 تثبيت البانل", lang), callback_data: "platform:panel" }
        ],
        [
          { text: await getCached("🪽 تثبيت الوينجز", lang), callback_data: "platform:wings" }
        ],
        [
          { text: await getCached("🌍 تثبيت المنصة", lang), callback_data: "platform:platform" }
        ],
        [
          { text: await getCached("🖥 إدارة السيرفرات", lang), callback_data: "platform:menuserver" }
        ],
        [
          { text: await getCached("⬅ الرجوع", lang), callback_data: "start:back" }
        ]
      ]
    };

    if (edit) {
      return safeEditMessage(bot, {
        text: title,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard
      });
    }

    return bot.sendMessage(message.chat.id, title, { reply_markup: keyboard });
  }
};