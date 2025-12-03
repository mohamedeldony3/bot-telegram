// ===================== Cloudflare Subdomain Manager =====================
//   يدعم: A / CNAME — limit — اسم — target — IP — حفظ متعدد
// =======================================================================

const axios = require("axios");
const config = require("../config");
const { autoTranslate } = require("../translator");
const { getUser, updateUser } = require("../userStore");
const { safeEditMessage, safeSendMessage, safeAnswerCallback } = require("../utils/safeHandlers");

const CF = config.CLOUDFLARE;

module.exports = {
  name: "cloudflare",
  command: null,
  callback: /^cloudflare:(menu|create|list|delete)$/i,

  // -------------------- Cloudflare Request --------------------
  async cf(method, endpoint, data = {}) {
    return axios({
      method,
      url: `https://api.cloudflare.com/client/v4/zones/${CF.ZONE_ID}${endpoint}`,
      headers: {
        "X-Auth-Email": CF.EMAIL,
        "X-Auth-Key": CF.API_KEY,
        "Content-Type": "application/json"
      },
      data
    });
  },

  // -------------------- Callback Router --------------------
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const userId = query.from.id;
    const user = getUser(userId);
    const lang = user.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    const action = query.data.split(":")[1];

    if (action === "menu")
      return this.openMainMenu(bot, query.message, lang, true);

    if (action === "create")
      return this.startCreate(bot, query.message, lang, userId);

    if (action === "list")
      return this.showDomains(bot, query.message, lang, userId);

    if (action === "delete")
      return this.startDelete(bot, query.message, lang, userId);
  },

  // -------------------- Main Menu --------------------
  async openMainMenu(bot, message, lang, edit = false) {
    const txt = await autoTranslate("🌐 إدارة الدومينات", lang);

    const kb = {
      inline_keyboard: [
        [{ text: await autoTranslate("➕ إنشاء دومين", lang), callback_data: "cloudflare:create" }],
        [{ text: await autoTranslate("📄 دوميناتي", lang), callback_data: "cloudflare:list" }],
        [{ text: await autoTranslate("🗑 حذف دومين", lang), callback_data: "cloudflare:delete" }],
        [{ text: await autoTranslate("⬅️ رجوع", lang), callback_data: "menu:back" }]
      ]
    };

    if (edit)
      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: kb
      });

    return safeSendMessage(bot, message.chat.id, txt, { reply_markup: kb });
  },

  // -------------------- Step 1: Enter Subdomain Name --------------------
  async startCreate(bot, message, lang, userId) {
    const user = getUser(userId);

    // check limit
    if (user.subdomains.length >= config.SUBDOMAIN_LIMIT) {
      return safeEditMessage(bot, {
        text: await autoTranslate(`❌ لا يمكنك إنشاء أكثر من ${config.SUBDOMAIN_LIMIT} دومينات.`, lang),
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    updateUser(userId, {
      awaitSubName: true,
      awaitRecordType: false,
      awaitIP: false,
      awaitCnameTarget: false,
      tempSubName: null,
      tempRecordType: null
    });

    return safeEditMessage(bot, {
      text: await autoTranslate("✍️ أرسل اسم الدومين (مثال: server1)", lang),
      chat_id: message.chat.id,
      message_id: message.message_id
    });
  },

  // -------------------- Step 2: Choose Record Type --------------------
  async askRecordType(bot, userId, lang) {
    updateUser(userId, {
      awaitSubName: false,
      awaitRecordType: true
    });

    const kb = {
      inline_keyboard: [
        [{ text: "A 🔵", callback_data: "record:A" }],
        [{ text: "CNAME 🟣", callback_data: "record:CNAME" }]
      ]
    };

    return bot.sendMessage(
      userId,
      await autoTranslate("اختر نوع السجل:", lang),
      { reply_markup: kb }
    );
  },

  // -------------------- Step 3: Ask for IP/CNAME --------------------
  async askIP(bot, userId, recordType, lang) {
    if (recordType === "A") {
      updateUser(userId, {
        awaitRecordType: false,
        awaitIP: true
      });

      return bot.sendMessage(
        userId,
        await autoTranslate("🌍 أرسل الآن الـ IP:", lang)
      );
    }

    if (recordType === "CNAME") {
      updateUser(userId, {
        awaitRecordType: false,
        awaitCnameTarget: true
      });

      return bot.sendMessage(
        userId,
        await autoTranslate("🔗 أرسل اسم الدومين الهدف (مثال: example.com)", lang)
      );
    }
  },

  // -------------------- Final Step: Create Record --------------------
  async createRecord(bot, userId, lang, target) {
    const user = getUser(userId);
    const name = user.tempSubName;
    const type = user.tempRecordType;

    const fqdn = `${name}.${CF.MAIN_DOMAIN}`;

    try {
      await this.cf("POST", "/dns_records", {
        type,
        name,
        content: target,
        ttl: 1,
        proxied: true
      });

      // save record inside userStore
      const updated = [...user.subdomains, { domain: fqdn, type, target }];
      updateUser(userId, {
        subdomains: updated,
        awaitIP: false,
        awaitCnameTarget: false,
        tempSubName: null,
        tempRecordType: null
      });

      return bot.sendMessage(
        userId,
        await autoTranslate(`✅ تم إنشاء الدومين:\n${fqdn}`, lang)
      );

    } catch (err) {
      console.error(err.response?.data || err);
      return bot.sendMessage(
        userId,
        await autoTranslate("❌ فشل إنشاء الدومين.", lang)
      );
    }
  },

  // -------------------- List Domains --------------------
  async showDomains(bot, message, lang, userId) {
    const user = getUser(userId);

    if (!user.subdomains.length) {
      return safeEditMessage(bot, {
        text: await autoTranslate("📭 لا توجد لديك دومينات.", lang),
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    let t = "🌐 <b>دوميناتك:</b>\n\n";
    user.subdomains.forEach((d, i) => {
      t += `#${i + 1}\n<code>${d.domain}</code>\nنوع: ${d.type}\nهدف: ${d.target}\n\n`;
    });

    return safeEditMessage(bot, {
      text: t,
      parse_mode: "HTML",
      chat_id: message.chat.id,
      message_id: message.message_id
    });
  },

  // -------------------- Start Delete --------------------
  async startDelete(bot, message, lang, userId) {
    const user = getUser(userId);

    if (!user.subdomains.length) {
      return safeEditMessage(bot, {
        text: await autoTranslate("❌ لا توجد دومينات.", lang),
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    const kb = {
      inline_keyboard: user.subdomains.map((d, i) => [
        { text: d.domain, callback_data: `cloudflare_del:${i}` }
      ])
    };

    return safeEditMessage(bot, {
      text: await autoTranslate("🗑 اختر الدومين لحذفه:", lang),
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: kb
    });
  }
};