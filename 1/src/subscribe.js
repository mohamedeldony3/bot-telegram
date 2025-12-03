const { getChannels } = require("./channelStore");

module.exports = {
  async check(bot, userId) {
    const channels = getChannels();
    if (!channels.length) return true;

    for (const ch of channels) {
      try {
        const member = await bot.getChatMember(ch.id, userId);

        if (member.status === "left" || member.status === "kicked") {
          return false;
        }
      } catch (e) {
        console.log("Subscription check error:", e.message);
        return false;
      }
    }

    return true;
  },

  async sendJoinMessage(bot, chatId) {
    const channels = getChannels();

    let text = "📢 <b>الاشتراك الإجباري</b>\n\n";
    text += "يجب الاشتراك في القنوات التالية لاستخدام البوت:\n\n";

    const keyboard = [];

    channels.forEach(ch => {
      text += `🔗 <b>@${ch.username}</b>\n`;
      keyboard.push([{ text: ch.title, url: `https://t.me/${ch.username}` }]);
    });

    keyboard.push([
      { text: "✅ تم الاشتراك", callback_data: "check_sub" }
    ]);

    return bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
};