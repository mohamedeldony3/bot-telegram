// src/plugins/addserver.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "addserver",
  command: null,
  callback: /^addserver:(start|setname|setip|setuser|setpass|setport|cancel)$/i,

  states: {},

  // تحميل / حفظ السيرفرات
  loadUsers() {
    const file = path.join(__dirname, "..", "..", "servers.json");
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}");
    return JSON.parse(fs.readFileSync(file));
  },

  saveUsers(data) {
    const file = path.join(__dirname, "..", "..", "servers.json");
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
  },

  // =====================================================
  // تشغيل إضافة السيرفر من المنصة
  // =====================================================
  async startWizard(bot, message, lang) {
    this.states[message.chat.id] = {
      step: "name",
      data: {}
    };

    const txt = await autoTranslate("📝 اكتب اسم السيرفر:", lang);
    const cancel = await autoTranslate("❌ إلغاء", lang);

    return bot.editMessageText(txt, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: cancel, callback_data: "addserver:cancel" }]
        ]
      }
    });
  },

  // =====================================================
  // معالجة الضغط على الأزرار
  // =====================================================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const action = query.data.split(":")[1];
    const chatId = query.message.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    bot.answerCallbackQuery(query.id).catch(() => {});

    // زر الإلغاء
    if (action === "cancel") {
      delete this.states[chatId];

      const txt = await autoTranslate("❌ تم الإلغاء. اكتب /start للرجوع.", lang);

      return bot.editMessageText(txt, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }

    // تشغيل أول صفحة
    if (action === "start") {
      return this.startWizard(bot, query.message, lang);
    }
  },

  // =====================================================
  // استقبال الرسائل لإكمال الخطوات
  // =====================================================
  async onMessage(ctx) {
    const { bot, msg, text } = ctx;
    const chatId = msg.chat.id;

    if (!this.states[chatId]) return;

    const lang = getUser(chatId)?.lang || "ar";
    const state = this.states[chatId];

    // الخطوة 1: الاسم
    if (state.step === "name") {
      state.data.name = text;
      state.step = "ip";

      const ask = await autoTranslate("🌐 IP السيرفر:", lang);

      return bot.sendMessage(chatId, ask, {
        reply_to_message_id: msg.message_id
      });
    }

    // الخطوة 2: IP
    if (state.step === "ip") {
      state.data.host = text;
      state.step = "user";

      const ask = await autoTranslate("👤 Username:", lang);

      return bot.sendMessage(chatId, ask, {
        reply_to_message_id: msg.message_id
      });
    }

    // الخطوة 3: USERNAME
    if (state.step === "user") {
      state.data.user = text;
      state.step = "pass";

      const ask = await autoTranslate("🔐 Password:", lang);

      return bot.sendMessage(chatId, ask, {
        reply_to_message_id: msg.message_id
      });
    }

    // الخطوة 4: PASSWORD
    if (state.step === "pass") {
      state.data.pass = text;
      state.step = "port";

      const ask = await autoTranslate("🔢 Port (مثال: 22):", lang);

      return bot.sendMessage(chatId, ask, {
        reply_to_message_id: msg.message_id
      });
    }

    // الخطوة 5: PORT
    if (state.step === "port") {
      const port = parseInt(text);
      if (isNaN(port)) {
        const err = await autoTranslate("❌ البورت لازم يكون رقم", lang);
        return bot.sendMessage(chatId, err);
      }

      state.data.port = port;

      // حفظ السيرفر
      const all = this.loadUsers();
      if (!all[chatId]) all[chatId] = { servers: [] };

      all[chatId].servers.push(state.data);
      this.saveUsers(all);

      delete this.states[chatId];

      const done = await autoTranslate("✅ تم حفظ السيرفر بنجاح!", lang);

      return bot.sendMessage(chatId, done);
    }
  }
};