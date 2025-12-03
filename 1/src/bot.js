// =========================== bot.js ===========================
// بوت احترافي — يدعم HOT RELOAD + نظام الإحالة + تسجيل الإيميل
// ===============================================================

const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const {
  safeEditMessage,
  safeAnswerCallback,
  safeSendMessage
} = require("./utils/safeHandlers");

const {
  getUser,
  updateUser,
  getUserLang
} = require("./userStore");

const config = require("./config");

// ============ تحقق من التوكن ============
if (!config.BOT_TOKEN) {
  console.log("❌ ERROR: BOT_TOKEN غير موجود في config.js");
  process.exit(1);
}

// ============ تشغيل البوت ============
const bot = new TelegramBot(config.BOT_TOKEN, {
  polling: true
});

console.log("🤖 Bot is running with AUTO HOT RELOAD…");

// ============ تحميل البرمجيات (Plugins) ============
let plugins = [];

function loadPlugins() {
  plugins = [];
  const pluginsPath = path.join(__dirname, "plugins");

  fs.readdirSync(pluginsPath).forEach((file) => {
    if (file.endsWith(".js")) {
      try {
        const plugin = require(`./plugins/${file}`);
        if (!plugin.name) {
          console.log(`⚠️ Plugin has no name: ${file}`);
          return;
        }
        plugins.push(plugin);
        console.log(`🔥 Loaded: ${plugin.name}`);
      } catch (err) {
        console.log(`❌ ERROR loading plugin ${file}:`, err.message);
      }
    }
  });
}

loadPlugins();

// ============ HOT RELOAD ============
fs.watch(path.join(__dirname, "plugins"), () => {
  console.log("♻️ Reloading plugins...");
  Object.keys(require.cache).forEach((k) => {
    if (k.includes("/plugins/")) delete require.cache[k];
  });
  loadPlugins();
});

// ============ /start ============
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const code = match[1]; // كود الإحالة إن وجد
  const startPlugin = plugins.find((p) => p.name === "start");

  if (!startPlugin) return;

  return startPlugin.run({
    bot,
    msg,
    referralCode: code,
    reply: (text, extra) => bot.sendMessage(msg.chat.id, text, extra)
  });
});

// ============ CALLBACKS ============
bot.on("callback_query", async (query) => {
  const data = query.data;

  // نمر على كل Plugin ونرى من يناسب الـ callback
  for (const plugin of plugins) {
    if (plugin.callback && plugin.callback.test(data)) {
      try {
        await plugin.callbackRun({ bot, query });
      } catch (e) {
        console.log("❌ Callback Error:", e.message);
      }
      return;
    }
  }

  console.log(`⚠️ لا يوجد Plugin يتعامل مع: ${data}`);
});

// ============ استقبال الرسائل النصية (لبريد التسجيل) ============
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const user = getUser(userId);

  // ليس تسجيل
  if (!user || !user.awaitEmailRegister) return;

  const email = msg.text?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bot.sendMessage(
      userId,
      "❌ البريد غير صحيح.\n📧 أرسل بريدًا صالحًا مثل:\nexample@gmail.com"
    );
  }

  // حفظ البريد وإنشاء الحساب
  updateUser(userId, {
    email,
    isRegistered: true,
    awaitEmailRegister: false
  });

  bot.sendMessage(userId, "✅ تم تسجيل الحساب بنجاح!");

  // افتح القائمة
  const startPlugin = plugins.find((p) => p.name === "start");

  return startPlugin.run({
    bot,
    msg,
    reply: (text, extra) => bot.sendMessage(userId, text, extra)
  });
});

// ============ تصدير ============
module.exports = bot;