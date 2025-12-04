// src/plugins/menuserver.js

const fs = require("fs");
const path = require("path");
const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");

// دالة مساعدة للتعامل الآمن مع تعديل الرسائل
async function safeEditMessage(bot, options) {
  try {
    return await bot.editMessageText(options.text, {
      chat_id: options.chat_id,
      message_id: options.message_id,
      reply_markup: options.reply_markup,
      parse_mode: options.parse_mode
    });
  } catch (error) {
    if (error.response?.body?.error_code === 400 && 
        error.response.body.description.includes('message is not modified')) {
      console.log('⚠️  تم تجاهل خطأ message not modified');
      return null;
    }
    throw error;
  }
}

module.exports = {
  name: "menuserver",
  command: null,
  callback: /^menuserver:(menu|add|list|view|delete|deleteconfirm|remove|back)$/i,

  loadUsers() {
    const file = path.join(__dirname, "..", "..", "servers.json");
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}");
    return JSON.parse(fs.readFileSync(file));
  },

  saveUsers(d) {
    const file = path.join(__dirname, "..", "..", "servers.json");
    fs.writeFileSync(file, JSON.stringify(d, null, 4));
  },

  // ====================================================================
  //   القائمة الرئيسية لإدارة السيرفرات
  // ====================================================================
  async openMainMenu(bot, message, lang, useEdit = true) {
    const title = await autoTranslate("🖥 إدارة السيرفرات — اختر:", lang);

    const [add, list, del, back] = await Promise.all([
      autoTranslate("➕ إضافة سيرفر", lang),
      autoTranslate("📄 عرض السيرفرات", lang),
      autoTranslate("🗑 حذف سيرفر", lang),
      autoTranslate("↩️ رجوع", lang)
    ]);

    const keyboard = [
      [{ text: add, callback_data: "menuserver:add" }],
      [{ text: list, callback_data: "menuserver:list" }],
      [{ text: del, callback_data: "menuserver:delete" }],
      [{ text: back, callback_data: "start:platform" }]
    ];

    if (useEdit) {
      return safeEditMessage(bot, {
        text: title,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    return bot.sendMessage(message.chat.id, title, {
      reply_markup: { inline_keyboard: keyboard }
    });
  },

  // ====================================================================
  //   Callback HANDLER
  // ====================================================================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const chatId = query.message.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    await bot.answerCallbackQuery(query.id).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 100));

    const [_, action, index] = query.data.split(":");

    if (action === "menu") {
      return this.openMainMenu(bot, query.message, lang);
    }

    if (action === "add") {
      // إذا كان addserver غير موجود، عرض رسالة
      try {
        const addserverPlugin = require("./addserver");
        return addserverPlugin.startWizard(bot, query.message, lang);
      } catch (error) {
        return safeEditMessage(bot, {
          text: await autoTranslate("❌ ميزة إضافة السيرفرات غير متاحة حالياً", lang),
          chat_id: chatId,
          message_id: query.message.message_id
        });
      }
    }

    if (action === "list") {
      return this.openServerList(bot, query.message, lang);
    }

    if (action === "delete") {
      return this.openDeleteList(bot, query.message, lang);
    }

    if (action === "view") {
      return this.openServerView(bot, query, index, lang);
    }

    if (action === "deleteconfirm") {
      return this.openDeleteConfirm(bot, query, index, lang);
    }

    if (action === "remove") {
      return this.deleteServer(bot, query, index, lang);
    }

    if (action === "back") {
      const platform = require("./platform");
      return platform.openMainMenu(bot, query.message, lang, true);
    }
  },

  // ====================================================================
  //   قائمة عرض السيرفرات
  // ====================================================================
  async openServerList(bot, message, lang) {
    const all = this.loadUsers();
    const servers = all[message.chat.id]?.servers || [];

    if (servers.length === 0) {
      const t = await autoTranslate("❌ لا يوجد أي سيرفرات", lang);
      return safeEditMessage(bot, {
        text: t,
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    const title = await autoTranslate("📄 قائمة السيرفرات:", lang);
    const back = await autoTranslate("↩️ رجوع", lang);

    const keyboard = servers.map((s, i) => [
      { text: `${s.name} (${s.host})`, callback_data: `menuserver:view:${i}` }
    ]);

    keyboard.push([{ text: back, callback_data: "menuserver:menu" }]);

    return safeEditMessage(bot, {
      text: title,
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: keyboard }
    });
  },

  // ====================================================================
  // عرض تفاصيل سيرفر
  // ====================================================================
  async openServerView(bot, query, index, lang) {
    const chatId = query.message.chat.id;
    const all = this.loadUsers();
    const srv = all[chatId]?.servers?.[index];

    if (!srv) {
      const errorText = await autoTranslate("❌ السيرفر غير موجود", lang);
      return safeEditMessage(bot, {
        text: errorText,
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }

    const title = await autoTranslate("🔧 تفاصيل السيرفر:", lang);
    const del = await autoTranslate("🗑 حذف", lang);
    const back = await autoTranslate("↩️ رجوع", lang);

    const txt = `${title}\n\n📝 *${srv.name}*\n🌐 ${srv.host}\n👤 ${srv.user}\n🔐 ${srv.pass}\n🔢 ${srv.port}`;

    return safeEditMessage(bot, {
      text: txt,
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: del, callback_data: `menuserver:deleteconfirm:${index}` }],
          [{ text: back, callback_data: "menuserver:list" }]
        ]
      }
    });
  },

  // ====================================================================
  //  قائمة اختيار حذف السيرفر
  // ====================================================================
  async openDeleteList(bot, message, lang) {
    const all = this.loadUsers();
    const servers = all[message.chat.id]?.servers || [];

    const title = await autoTranslate("🗑 اختر سيرفر للحذف:", lang);
    const back = await autoTranslate("↩️ رجوع", lang);

    if (servers.length === 0) {
      const t = await autoTranslate("❌ لا يوجد سيرفرات للحذف", lang);
      return safeEditMessage(bot, {
        text: t,
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    const keyboard = servers.map((s, i) => [
      { text: s.name, callback_data: `menuserver:deleteconfirm:${i}` }
    ]);

    keyboard.push([{ text: back, callback_data: "menuserver:menu" }]);

    return safeEditMessage(bot, {
      text: title,
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: keyboard }
    });
  },

  // ====================================================================
  // صفحة تأكيد الحذف
  // ====================================================================
  async openDeleteConfirm(bot, query, index, lang) {
    const txt = await autoTranslate("❗ هل أنت متأكد من الحذف؟", lang);
    const yes = await autoTranslate("✔ نعم", lang);
    const no = await autoTranslate("❌ لا", lang);

    return safeEditMessage(bot, {
      text: txt,
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: yes, callback_data: `menuserver:remove:${index}` },
            { text: no, callback_data: `menuserver:view:${index}` }
          ]
        ]
      }
    });
  },

  // ====================================================================
  // حذف فعلي للسيرفر
  // ====================================================================
  async deleteServer(bot, query, index, lang) {
    const chatId = query.message.chat.id;
    const all = this.loadUsers();

    if (!all[chatId]?.servers?.[index]) {
      const errorText = await autoTranslate("❌ السيرفر غير موجود", lang);
      return safeEditMessage(bot, {
        text: errorText,
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }

    all[chatId].servers.splice(index, 1);
    this.saveUsers(all);

    const done = await autoTranslate("🗑 تم حذف السيرفر", lang);

    return safeEditMessage(bot, {
      text: done,
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("↩️ رجوع للقائمة", lang), callback_data: "menuserver:menu" }]
        ]
      }
    });
  }
};