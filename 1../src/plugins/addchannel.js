// src/plugins/addchannel.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const { addChannel, getChannels, removeChannel } = require("../channelStore");

module.exports = {
  name: "addchannel",
  command: /^\/addchannel(.*)$/i,
  callback: /^channels:(list|delete|confirm|back):?(.*)?$/i,

  async run(ctx) {
    const { bot, msg, text } = ctx;
    const chatId = msg.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    const isDeveloper = msg.from.id === 7712508848;
    if (!isDeveloper) {
      return bot.sendMessage(chatId, "❌ هذا الأمر للمطور فقط.");
    }

    // لو كتب /addchannel فقط → افتح لوحة القنوات
    if (!text || text.trim() === "/addchannel") {
      return this.showChannelMenu(bot, msg, lang);
    }

    // ===== التقاط أي صيغة قناة =====
    let raw = text.replace("/addchannel", "").trim();
    let username = null;

    // @username
    if (raw.startsWith("@")) {
      username = raw.replace("@", "").trim();
    }

    // https://t.me/username
    else if (raw.includes("t.me/")) {
      const match = raw.match(/t\.me\/([\w_]+)/i);
      if (match) username = match[1];
    }

    // username فقط بدون @
    else if (/^[a-zA-Z0-9_]{4,32}$/.test(raw)) {
      username = raw;
    }

    if (!username) {
      return bot.sendMessage(
        chatId,
        "❌ صيغة غير صحيحة.\nأمثلة:\n\n" +
        "@channel\n" +
        "channel\n" +
        "https://t.me/channel"
      );
    }

    // إضافة القناة
    return this.addChannelByUsername(bot, msg, username, lang);
  },

  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const msg = query.message;
    const chatId = msg.chat.id;
    const lang = getUser(chatId)?.lang || "ar";
    const isDeveloper = query.from.id === 7712508848;

    if (!isDeveloper) {
      return bot.answerCallbackQuery(query.id, { text: "❌ هذا الأمر للمطور فقط." });
    }

    await bot.answerCallbackQuery(query.id).catch(() => {});

    const parts = query.data.split(":");
    const action = parts[1];
    const id = parts[2];

    if (action === "back") {
      return this.showChannelMenu(bot, msg, lang);
    }

    if (action === "list") {
      return this.showChannelsList(bot, msg, lang);
    }

    if (action === "delete") {
      return this.confirmDeleteChannel(bot, msg, id, lang);
    }

    if (action === "confirm") {
      const [yesno, channelId] = id.split("_");

      if (yesno === "yes") {
        return this.deleteChannel(bot, msg, channelId, lang);
      } else {
        return this.showChannelsList(bot, msg, lang);
      }
    }
  },

  // ===== لوحة التحكم =====
  async showChannelMenu(bot, message, lang) {
    const channels = getChannels();

    let text = "📋 **إدارة القنوات الإجبارية**\n\n";
    text += `📊 عدد القنوات الحالية: ${channels.length}\n\n`;
    text += "➕ لإضافة قناة:\n";
    text += "`/addchannel @username`\n";

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: await autoTranslate("📄 عرض القنوات", lang),
            callback_data: "channels:list"
          }
        ]
      ]
    };

    return bot.sendMessage(message.chat.id, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  },

  // ===== إضافة قناة =====
  async addChannelByUsername(bot, message, username, lang) {
    try {
      const chat = await bot.getChat(`@${username}`);

      const channelObj = {
        id: chat.id,
        username: username,
        title: chat.title
      };

      const added = addChannel(channelObj);

      if (!added) {
        return bot.sendMessage(message.chat.id, "❌ القناة مضافة مسبقاً.");
      }

      return bot.sendMessage(
        message.chat.id,
        `✅ **تم إضافة القناة بنجاح**\n\n` +
        `📢 ${chat.title}\n` +
        `🔗 @${username}\n` +
        `🆔 ${chat.id}`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      return bot.sendMessage(
        message.chat.id,
        "❌ فشل في إضافة القناة.\n" +
        "تأكد من:\n" +
        "• البوت مشرف بالقناة\n" +
        "• اليوزر صحيح"
      );
    }
  },

  // ===== عرض القنوات =====
  async showChannelsList(bot, message, lang) {
    const channels = getChannels();

    if (!channels.length) {
      return bot.editMessageText("❌ لا توجد قنوات مضافة.", {
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    let text = "📋 **القنوات الإجبارية:**\n\n";
    const keyboard = [];

    channels.forEach((c, index) => {
      text += `${index + 1}. ${c.title}\n`;
      text += `🔗 @${c.username}\n`;
      text += `🆔 ${c.id}\n\n`;

      keyboard.push([
        {
          text: `🗑 حذف: ${c.title}`,
          callback_data: `channels:delete:${c.id}`
        }
      ]);
    });

    keyboard.push([
      { text: await autoTranslate("↩️ رجوع", lang), callback_data: "channels:back" }
    ]);

    return bot.editMessageText(text, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    });
  },

  // ===== تأكيد حذف =====
  async confirmDeleteChannel(bot, message, id, lang) {
    const channels = getChannels();
    const channel = channels.find(c => c.id == id);

    if (!channel) {
      return bot.answerCallbackQuery(message.id, { text: "❌ القناة غير موجودة." });
    }

    const text =
      `⚠️ **تأكيد الحذف**\n\n` +
      `📢 ${channel.title}\n` +
      `🔗 @${channel.username}`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: await autoTranslate("نعم", lang),
            callback_data: `channels:confirm:yes_${id}`
          },
          {
            text: await autoTranslate("لا", lang),
            callback_data: `channels:confirm:no_${id}`
          }
        ]
      ]
    };

    return bot.editMessageText(text, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  },

  // ===== حذف فعلي =====
  async deleteChannel(bot, message, id, lang) {
    const removed = removeChannel(id);

    if (removed) {
      return bot.editMessageText("✅ تم حذف القناة بنجاح.", {
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    return bot.editMessageText("❌ القناة غير موجودة.", {
      chat_id: message.chat.id,
      message_id: message.message_id
    });
  }
};