// ===================== safeHandlers.js =====================
// نسخة قوية وخفيفة — تمنع كل أخطاء "message is not modified"

async function safeEditMessage(bot, options = {}) {
  try {
    if (!options.text) return;

    return await bot.editMessageText(options.text, {
      chat_id: options.chat_id,
      message_id: options.message_id,
      parse_mode: options.parse_mode,
      reply_markup: options.reply_markup
    });
  } catch (err) {
    // تجاهل الخطأ الشهير message is not modified
    if (err.response?.body?.description?.includes("message is not modified")) {
      return;
    }

    console.log("❌ safeEditMessage Error:", err.message);
  }
}

async function safeAnswerCallback(bot, id, opts = {}) {
  try {
    return bot.answerCallbackQuery(id, opts);
  } catch (_) {}
}

async function safeSendMessage(bot, chatId, text, extra = {}) {
  try {
    return bot.sendMessage(chatId, text, extra);
  } catch (err) {
    console.log("❌ safeSendMessage Error:", err.message);
  }
}

module.exports = {
  safeEditMessage,
  safeAnswerCallback,
  safeSendMessage
};