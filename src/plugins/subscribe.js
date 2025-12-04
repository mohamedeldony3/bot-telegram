// ===================== subscribe.js =====================
// نظام الاشتراك الإجباري — خالٍ من الأخطاء مع ملف خارج src

const fs = require("fs");
const path = require("path");

// ملف channels.json موجود خارج src
const CHANNELS_FILE = path.join(__dirname, "..", "..", "channels.json");

// تحميل قائمة القنوات بأمان
function loadChannels() {
  try {
    if (!fs.existsSync(CHANNELS_FILE)) {
      console.log("⚠️ ملف channels.json غير موجود — الاشتراك الإجباري متوقف.");
      return [];
    }

    const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf8"));

    if (!data || !Array.isArray(data.channels)) {
      console.log("⚠️ تنسيق channels.json غير صحيح.");
      return [];
    }

    return data.channels;
  } catch (err) {
    console.log("❌ خطأ أثناء قراءة channels.json:", err);
    return [];
  }
}

// التحقق من اشتراك المستخدم في قناة واحدة
async function isSubscribed(bot, userId, channel) {
  try {
    const member = await bot.getChatMember(channel, userId);

    return (
      member.status === "member" ||
      member.status === "administrator" ||
      member.status === "creator"
    );
  } catch (err) {
    console.log(`⚠️ تعذر التحقق من: ${channel}`, err.message);
    return false;
  }
}

// التحقق من اشتراك المستخدم في كل القنوات
async function check(bot, userId) {
  const CHANNELS = loadChannels();

  if (!CHANNELS || CHANNELS.length === 0) return true;

  for (const ch of CHANNELS) {
    const ok = await isSubscribed(bot, userId, ch);
    if (!ok) return false;
  }

  return true;
}

// إرسال رسالة الاشتراك
async function sendJoinMessage(bot, userId) {
  const CHANNELS = loadChannels();

  let text = "📌 <b>من فضلك اشترك في القنوات التالية:</b>\n\n";

  CHANNELS.forEach((ch) => {
    text += `🔗 @${ch.replace("@", "")}\n`;
  });

  text += "\nبعد الاشتراك اضغط على الزر التالي:";

  return bot.sendMessage(userId, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ تحقّق من الاشتراك", callback_data: "check_sub" }]
      ]
    }
  });
}

module.exports = {
  name: "subscribe",
  check,
  sendJoinMessage
};