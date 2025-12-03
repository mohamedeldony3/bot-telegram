// ======================= src/plugins/start.js =======================

const { autoTranslate } = require("../translator");
const {
  getUser,
  updateUser,
  isUserRegistered,
  addReferral,
  hasUsedReferral
} = require("../userStore");

const subscribe = require("./subscribe");
const { safeEditMessage, safeSendMessage, safeAnswerCallback } = require("../utils/safeHandlers");
const config = require("../config");

module.exports = {
  name: "start",
  command: /^\/start/i,
  callback: /^start:(menu|back|platform|store|numbers|boost|lang|account|balance|ref|domains)$/i,

  // ===================== /start (with referral) =====================
  async run(ctx) {
    const { bot, msg, reply, referralCode } = ctx;
    const userId = msg.from.id;

    // 1️⃣ تحقق الاشتراك الإجباري
    const joined = await subscribe.check(bot, userId);
    if (!joined) return subscribe.sendJoinMessage(bot, userId);

    // 2️⃣ نظام الإحالة
    if (referralCode && referralCode.startsWith("ref_")) {
      const refOwner = parseInt(referralCode.replace("ref_", ""));

      if (refOwner !== userId && !hasUsedReferral(userId)) {
        addReferral(refOwner, userId);

        bot.sendMessage(
          refOwner,
          `🎉 شخص استخدم رابط الإحالة الخاص بك!\n✨ تم إضافة ${config.REFERRAL_REWARD} رصيد إلى حسابك!`
        );
      }
    }

    // 3️⃣ تسجيل البريد لأول مرة
    const user = getUser(userId);
    if (!user || !isUserRegistered(userId)) {
      updateUser(userId, { awaitEmailRegister: true });

      return bot.sendMessage(
        userId,
        "📧 <b>مرحباً بك لأول مرة!</b>\n\nأرسل بريدك الإلكتروني:\n<code>example@gmail.com</code>",
        { parse_mode: "HTML" }
      );
    }

    // 4️⃣ افتح القائمة الرئيسية
    return this.sendMainMenu(reply, user.lang || "ar", user);
  },

  // ===================== Callback Router =====================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    await safeAnswerCallback(bot, query.id);

    const user = getUser(userId);
    const lang = user?.lang || "ar";

    const action = query.data.split(":")[1];

    // زر الرجوع
    if (action === "back") {
      return this.sendMainMenu(
        (text, extra) =>
          safeEditMessage(bot, {
            text,
            chat_id: chatId,
            message_id: query.message.message_id,
            ...extra
          }),
        lang,
        user
      );
    }

    // باقي الأقسام
    const pluginMap = {
      platform: "platform",
      store: "store",
      numbers: "numbers",
      boost: "boost",
      lang: "lang",
      account: "account",
      balance: "balance",
      ref: "account",
      domains: "domains" // 🔥 تم إضافة زر الدومينات هنا
    };

    const pluginName = pluginMap[action];
    if (!pluginName) return;

    const subPlugin = require(`./${pluginName}`);

    if (subPlugin?.openMainMenu) {
      return subPlugin.openMainMenu(bot, query.message, lang, true);
    }

    return safeSendMessage(bot, userId, "❗ سيتم إضافة هذا القسم لاحقاً");
  },

  // ===================== Main Menu (UI) =====================
  async sendMainMenu(reply, lang, user) {
    const name = user?.email?.split("@")[0] || "صديقي";

    const text = await autoTranslate(
      `✨ <b>مرحباً ${name}!</b>\n\n` +
      `لوحة إدارة رقمية كاملة — اختر ما تريد من الأزرار بالأسفل 👇`,
      lang
    );

    const keyboard = {
      inline_keyboard: [
        [
          { text: await autoTranslate("📌 المنصّة", lang), callback_data: "start:platform" },
          { text: await autoTranslate("🛒 المتجر", lang), callback_data: "start:store" }
        ],
        [
          { text: await autoTranslate("🔢 الأرقام", lang), callback_data: "start:numbers" },
          { text: await autoTranslate("⚡ الرشق", lang), callback_data: "start:boost" }
        ],
        [
          { text: await autoTranslate("👤 حسابي", lang), callback_data: "start:account" },
          { text: await autoTranslate("💰 رصيدي", lang), callback_data: "start:balance" }
        ],
        [
          { text: await autoTranslate("🌐 الدومينات", lang), callback_data: "start:domains" } // 🔥 زر الدومينات
        ],
        [
          { text: await autoTranslate("👥 الإحالة", lang), callback_data: "start:ref" }
        ],
        [
          { text: await autoTranslate("🌍 تغيير اللغة", lang), callback_data: "start:lang" }
        ]
      ]
    };

    return reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  },

  // ===================== تسجيل الإيميل لأول مرة =====================
  async handleEmail(bot, msg) {
    const userId = msg.from.id;
    const email = msg.text.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return bot.sendMessage(userId, "❌ البريد غير صحيح. حاول مرة أخرى.");
    }

    updateUser(userId, {
      email,
      isRegistered: true,
      awaitEmailRegister: false
    });

    bot.sendMessage(userId, "🎉 تم التسجيل بنجاح!");

    return this.run({
      bot,
      msg,
      reply: (text, extra) => bot.sendMessage(userId, text, extra)
    });
  }
};