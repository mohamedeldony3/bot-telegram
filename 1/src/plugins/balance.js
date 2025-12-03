// ======================= src/plugins/balance.js =======================

const { autoTranslate } = require("../translator");
const {
  getUser,
  getUserBalance
} = require("../userStore");

const {
  safeEditMessage,
  safeAnswerCallback,
  safeSendMessage
} = require("../utils/safeHandlers");

module.exports = {
  name: "balance",
  command: null,
  callback: /^balance:(check|add|history|buy:[0-9]+)$/i,

  // فتح القائمة من start.js
  async openMainMenu(bot, message, lang, edit = false) {
    const userId = message.chat.id;

    const user = getUser(userId);
    const balance = getUserBalance(userId);

    const title = await autoTranslate("💰 رصيد حسابك", lang);

    const txt = `
<b>${title}</b>

💎 <b>${balance}</b>
📧 <code>${user.email}</code>
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: await autoTranslate("➕ شحن الرصيد", lang), callback_data: "balance:add" },
          { text: await autoTranslate("📊 السجل", lang), callback_data: "balance:history" }
        ],
        [
          { text: await autoTranslate("⬅️ رجوع", lang), callback_data: "start:back" }
        ]
      ]
    };

    if (edit)
      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: "HTML",
        reply_markup: keyboard
      });

    return safeSendMessage(bot, message.chat.id, txt, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  },

  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const lang = getUser(query.from.id)?.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    const action = query.data.split(":")[1];

    if (action === "add") return this.openAdd(bot, query.message, lang);
    if (action === "history") return this.openHistory(bot, query.message, lang);

    if (action.startsWith("buy")) {
      const amount = parseInt(action.split(":")[2]);
      return this.openBuy(bot, query.message, lang, amount);
    }
  },

  async openAdd(bot, message, lang) {
    const txt = await autoTranslate(
      "💳 <b>إضافة رصيد</b>\n\nتواصل مع الإدارة:\n@username",
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "10 💎", callback_data: "balance:buy:10" },
            { text: "50 💎", callback_data: "balance:buy:50" },
            { text: "100 💎", callback_data: "balance:buy:100" }
          ],
          [{ text: await autoTranslate("⬅️ رجوع", lang), callback_data: "menu:back" }]
        ]
      }
    });
  },

  async openHistory(bot, message, lang) {
    const txt = await autoTranslate(
      "📊 <b>سجل المعاملات</b>\nلا توجد معاملات حالياً.",
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("⬅️ رجوع", lang), callback_data: "menu:back" }]
        ]
      }
    });
  },

  async openBuy(bot, message, lang, amount) {
    const txt = await autoTranslate(
      `💎 <b>شراء ${amount} رصيد</b>\n` +
      `المطلوب: ${amount * 10} ريال\n` +
      "تواصل مع الإدارة:\n@username",
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("⬅️ رجوع", lang), callback_data: "menu:back" }]
        ]
      }
    });
  }
};