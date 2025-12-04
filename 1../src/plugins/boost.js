module.exports = {
  name: "boost",
  callback: /^boost:.+/i,

  async openMainMenu(bot, message, lang, edit = false) {
    const text = "⚡ قسم الرشق — لم يتم إضافته بعد.";

    const keyboard = {
      inline_keyboard: [
        [{ text: "⬅️ رجوع", callback_data: "start:back" }]
      ]
    };

    if (edit)
      return bot.editMessageText(text, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard
      });

    return bot.sendMessage(message.chat.id, text, { reply_markup: keyboard });
  },

  async callbackRun() {}
};