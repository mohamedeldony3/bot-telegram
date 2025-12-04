// ===================== src/plugins/account.js =====================

const { autoTranslate } = require("../translator");
const {
  getUser,
  updateUser
} = require("../userStore");

const {
  safeEditMessage,
  safeAnswerCallback
} = require("../utils/safeHandlers");

module.exports = {
  name: "account",
  command: null,
  callback: /^account:(open|settings|change_email|change_password|security|transactions|ref|refresh)$/i,

  // ===================== فتح الحساب من start.js =====================
  async openMainMenu(bot, message, lang, edit = false) {
    return this.openAccount(bot, message, message.chat.id, lang, edit);
  },

  // ===================== راوتر داخلي =====================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const action = query.data.split(":")[1];
    const userId = query.from.id;
    const user = getUser(userId);
    const lang = user?.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    switch (action) {
      case "open":
      case "refresh":
        return this.openAccount(bot, query.message, userId, lang, true);

      case "settings":
        return this.openSettings(bot, query.message, userId, lang);

      case "change_email":
        return this.changeEmail(bot, query.message, userId, lang);

      case "change_password":
        return this.changePassword(bot, query.message, userId, lang);

      case "security":
        return this.openSecurity(bot, query.message, lang);

      case "transactions":
        return this.showTransactions(bot, query.message, lang);

      case "ref":
        return this.showReferral(bot, query.message, userId, lang);

      default:
        return;
    }
  },

  // ===================== صفحة الحساب =====================
  async openAccount(bot, message, userId, lang, edit = false) {
    const user = getUser(userId);

    const txt = await autoTranslate("👤 مركز الحساب", lang);

    const text =
      `${txt}\n\n` +
      `🆔 <b>ID:</b> <code>${user.id}</code>\n` +
      `📧 <b>${await autoTranslate("البريد", lang)}:</b> <code>${user.email}</code>\n` +
      `🔐 <b>${await autoTranslate("كلمة المرور", lang)}:</b> <code>${user.emailPassword}</code>\n` +
      `💰 <b>${await autoTranslate("الرصيد", lang)}:</b> ${user.balance} 💎\n\n` +
      `📅 <b>${await autoTranslate("تاريخ التسجيل", lang)}:</b> ${user.registrationDate.split("T")[0]}\n` +
      `⏱ <b>${await autoTranslate("آخر دخول", lang)}:</b> ${user.lastLogin?.split("T")[0] || "--"}\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "💳 " + await autoTranslate("شحن الرصيد", lang), callback_data: "start:balance" },
          { text: "📊 " + await autoTranslate("معاملاتك", lang), callback_data: "account:transactions" }
        ],
        [
          { text: "👥 " + await autoTranslate("الإحالة", lang), callback_data: "account:ref" },
          { text: "⚙️ " + await autoTranslate("الإعدادات", lang), callback_data: "account:settings" }
        ],
        [
          { text: "🔐 " + await autoTranslate("الأمان", lang), callback_data: "account:security" }
        ],
        [
          { text: "🔄 " + await autoTranslate("تحديث", lang), callback_data: "account:refresh" }
        ],
        [
          { text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "start:back" }
        ]
      ]
    };

    if (edit) {
      return safeEditMessage(bot, {
        text,
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    }

    return bot.sendMessage(message.chat.id, text, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  },

  // ===================== الإعدادات =====================
  async openSettings(bot, message, userId, lang) {
    const text =
      `⚙️ <b>${await autoTranslate("إعدادات الحساب", lang)}</b>\n\n` +
      `${await autoTranslate("اختر ما تريد تعديله", lang)}:`;

    return safeEditMessage(bot, {
      text,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📧 " + await autoTranslate("تغيير البريد", lang), callback_data: "account:change_email" }],
          [{ text: "🔑 " + await autoTranslate("تغيير كلمة المرور", lang), callback_data: "account:change_password" }],
          [{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]
        ]
      }
    });
  },

  // ===================== تغيير البريد =====================
  async changeEmail(bot, message, userId, lang) {
    const newEmail = `user_${userId}@gmail.com`;

    updateUser(userId, { email: newEmail });

    const msg =
      `✅ ${await autoTranslate("تم تغيير البريد", lang)}!\n` +
      `${await autoTranslate("البريد الجديد", lang)}:\n<code>${newEmail}</code>`;

    return safeEditMessage(bot, {
      text: msg,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]]
      }
    });
  },

  // ===================== تغيير كلمة المرور =====================
  async changePassword(bot, message, userId, lang) {
    const newPass = Math.random().toString(36).slice(2, 10);
    updateUser(userId, { emailPassword: newPass });

    const msg =
      `🔐 ${await autoTranslate("تم تغيير كلمة المرور", lang)}!\n` +
      `${await autoTranslate("كلمة المرور الجديدة", lang)}:\n<code>${newPass}</code>`;

    return safeEditMessage(bot, {
      text: msg,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]]
      }
    });
  },

  // ===================== الأمان =====================
  async openSecurity(bot, message, lang) {
    return safeEditMessage(bot, {
      text: "🔐 <b>" + await autoTranslate("إعدادات الأمان", lang) + "</b>\n" +
            await autoTranslate("سيتم إضافة المزيد قريباً…", lang),
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]
        ]
      }
    });
  },

  // ===================== سجل المعاملات =====================
  async showTransactions(bot, message, lang) {
    return safeEditMessage(bot, {
      text: "📊 " + await autoTranslate("لا توجد معاملات حتى الآن", lang),
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]
        ]
      }
    });
  },

  // ===================== الإحالة =====================
  async showReferral(bot, message, userId, lang) {
    const { BOT_USERNAME } = require("../config");
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;

    return safeEditMessage(bot, {
      text: `👥 ${await autoTranslate("رابط الإحالة الخاص بك", lang)}:\n\n<code>${link}</code>`,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ " + await autoTranslate("رجوع", lang), callback_data: "account:open" }]
        ]
      }
    });
  }
};