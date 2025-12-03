// src/plugins/installdash.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");
const axios = require("axios");

const SCRIPT_URL = "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/dash-auto.sh";
const BASE_LOG_DIR = "server_logs";

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
  name: "installdash",
  command: null,
  callback: /^installdash:(start|server:\d+|confirm:(yes|no))$/i,

  states: {},

  loadUsers() {
    const file = path.join(__dirname, "..", "..", "servers.json");
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}");
    return JSON.parse(fs.readFileSync(file));
  },

  // ============================
  // فتح قائمة اختيار السيرفر
  // ============================
  async startWizard(bot, message, lang) {
    const chatId = message.chat.id;
    const servers = this.loadUsers()[chatId]?.servers || [];

    if (!servers.length) {
      return safeEditMessage(bot, {
        text: await autoTranslate("❌ لا يوجد سيرفرات.", lang),
        chat_id: chatId,
        message_id: message.message_id
      });
    }

    const text = await autoTranslate("🖥 اختر السيرفر لتثبيت الداش:", lang);

    const keyboard = servers.map((srv, idx) => [
      {
        text: `${srv.name} (${srv.host})`,
        callback_data: `installdash:server:${idx}`
      }
    ]);

    return safeEditMessage(bot, {
      text: text,
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: keyboard }
    });
  },

  // ============================
  // CALLBACK HANDLER
  // ============================
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const chatId = query.message.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    await bot.answerCallbackQuery(query.id).catch(() => {});

    const parts = query.data.split(":");

    // اختيار السيرفر
    if (parts[1] === "server") {
      const index = Number(parts[2]);
      const servers = this.loadUsers()[chatId].servers;
      const selectedServer = servers[index];

      // فحص اتصال السيرفر أولاً
      await bot.sendMessage(
        chatId,
        await autoTranslate("🔍 جاري فحص اتصال السيرفر...", lang)
      );

      const isConnected = await this.checkServerConnection(selectedServer);
      
      if (!isConnected) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ فشل الاتصال بالسيرفر. تأكد من:\n• عنوان السيرفر\n• اسم المستخدم\n• كلمة المرور\n• المنفذ\n• اتصال الانترنت", lang)
        );
      }

      // إذا كان الاتصال ناجحاً، متابعة الخطوات
      this.states[chatId] = {
        step: "ask_domain",
        server: selectedServer,
        data: {}
      };

      return bot.sendMessage(
        chatId,
        await autoTranslate("✅ تم الاتصال بالسيرفر بنجاح!\n\n🌍 أرسل الدومين:", lang)
      );
    }

    // تأكيد التثبيت
    if (parts[1] === "confirm") {
      const confirm = parts[2] === "yes";
      return this.confirmInstall(bot, chatId, confirm, lang);
    }
  },

  // ============================
  // فحص اتصال السيرفر
  // ============================
  async checkServerConnection(server) {
    return new Promise((resolve) => {
      const conn = new Client();
      let connected = false;

      const timeout = setTimeout(() => {
        conn.end();
        resolve(false);
      }, 30000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        connected = true;
        conn.end();
        resolve(true);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        console.error('SSH Connection Error:', err.message);
        resolve(false);
      });

      conn.on('close', () => {
        if (!connected) {
          clearTimeout(timeout);
          resolve(false);
        }
      });

      conn.connect({
        host: server.host,
        port: server.port || 22,
        username: server.user,
        password: server.pass,
        readyTimeout: 20000
      });
    });
  },

  // ============================
  // استقبال خطوات المستخدم
  // ============================
  async onMessage(ctx) {
    const { bot, msg, text } = ctx;
    const chatId = msg.chat.id;
    const lang = getUser(chatId)?.lang || "ar";

    if (!this.states[chatId]) return;

    const state = this.states[chatId];
    const currentStep = state.step;

    // ------------------------
    // STEP 1 — DOMAIN
    // ------------------------
    if (currentStep === "ask_domain") {
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الدومين غير صالح. يرجى إرسال دومين صحيح (مثال: example.com):", lang)
        );
      }

      state.data.domain = text;
      state.step = "ask_dbpass";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔐 أرسل كلمة مرور قاعدة البيانات:", lang)
      );
    }

    // ------------------------
    // STEP 2 — DATABASE PASSWORD
    // ------------------------
    if (currentStep === "ask_dbpass") {
      if (!text || text.length < 6) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل:", lang)
        );
      }

      state.data.dbpass = text;
      state.step = "confirm_install";

      // عرض تأكيد التثبيت
      const confirmText = await autoTranslate(
        `⚙️ **ملخص الإعداد:**\n\n` +
        `🌍 الدومين: ${state.data.domain}\n` +
        `🖥 السيرفر: ${state.server.name}\n` +
        `🔐 باسورد الداتا: ${state.data.dbpass}\n\n` +
        `هل تريد البدء؟`,
        lang
      );

      const confirmKeyboard = {
        inline_keyboard: [
          [
            { 
              text: await autoTranslate("✅ نعم", lang), 
              callback_data: `installdash:confirm:yes` 
            },
            { 
              text: await autoTranslate("❌ لا", lang), 
              callback_data: `installdash:confirm:no` 
            }
          ]
        ]
      };

      return bot.sendMessage(chatId, confirmText, {
        parse_mode: "Markdown",
        reply_markup: confirmKeyboard
      });
    }
  },

  // ============================
  // تأكيد التثبيت
  // ============================
  async confirmInstall(bot, chatId, confirm, lang) {
    if (!confirm) {
      delete this.states[chatId];
      return bot.sendMessage(
        chatId,
        await autoTranslate("❌ تم إلغاء التثبيت.", lang)
      );
    }

    const state = this.states[chatId];
    
    await bot.sendMessage(
      chatId,
      await autoTranslate("📡 جاري تحميل السكربت...", lang)
    );

    return this.beginInstall(bot, chatId, lang);
  },

  // ============================
  // بدء التثبيت عبر SSH
  // ============================
  async beginInstall(bot, chatId, lang) {
    const state = this.states[chatId];
    const srv = state.server;
    const data = state.data;

    try {
      // تحميل السكربت من GitHub
      const response = await axios.get(SCRIPT_URL);
      let script = response.data;

      // استبدال المتغيرات في السكربت
      script = script.replace(/{{DOMAIN}}/g, data.domain);
      script = script.replace(/{{DB_PASSWORD}}/g, data.dbpass);

      await bot.sendMessage(chatId, "🔌 جاري الاتصال بالسيرفر...");

      const conn = new Client();

      conn.on("ready", async () => {
        await bot.sendMessage(chatId, "✅ تم الاتصال بالسيرفر!");

        const workdir = `/home/${srv.user}/dash_install`;
        const scriptPath = `${workdir}/dash.sh`;

        try {
          // إنشاء المجلد ورفع السكربت
          await this.execCommand(conn, `rm -rf ${workdir} && mkdir -p ${workdir}`);
          await this.uploadScript(conn, script, scriptPath);
          await this.execCommand(conn, `chmod +x ${scriptPath}`);

          await bot.sendMessage(chatId, "🚀 بدء تثبيت الداش...");

          // إنشاء مجلد اللوجات
          const logDir = path.join(BASE_LOG_DIR, chatId.toString(), srv.name);
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const logFile = path.join(logDir, "dash.log");
          fs.writeFileSync(logFile, "");

          // تشغيل السكربت مع متابعة الإخراج
          const output = await this.execCommandWithOutput(conn, `cd ${workdir} && sudo bash ${scriptPath}`);

          // حفظ اللوج
          fs.appendFileSync(logFile, output);

          // تنظيف الملفات
          await this.execCommand(conn, `rm -rf ${workdir}`);

          conn.end();

          // إرسال النتيجة النهائية
          const lines = output.split('\n');
          const stepLines = lines.filter(line => line.startsWith('['));
          const lastLines = lines.slice(-20).join('\n');

          // إرسال خطوات التقدم
          for (const step of stepLines.slice(-5)) {
            await bot.sendMessage(chatId, `📌 ${step}`);
          }

          await bot.sendMessage(
            chatId,
            `🎉 **تم تثبيت الداش بنجاح!**\n\n` +
            `🌍 الرابط: https://${data.domain}/installer\n` +
            `🔐 **Database Password:** \`${data.dbpass}\`\n\n` +
            `➡️ **افتح الرابط وأكمل التثبيت من المتصفح.**\n\n` +
            `📄 **آخر 20 سطر:**\n\`\`\`\n${lastLines}\n\`\`\``,
            { parse_mode: "Markdown" }
          );

        } catch (error) {
          await bot.sendMessage(chatId, `❌ خطأ أثناء التثبيت: ${error.message}`);
          conn.end();
        }

        delete this.states[chatId];
      });

      conn.on('error', async (err) => {
        await bot.sendMessage(chatId, `❌ فشل الاتصال بالسيرفر: ${err.message}`);
        delete this.states[chatId];
      });

      conn.connect({
        host: srv.host,
        port: srv.port,
        username: srv.user,
        password: srv.pass,
        readyTimeout: 20000
      });

    } catch (error) {
      await bot.sendMessage(chatId, `❌ فشل تحميل السكربت: ${error.message}`);
      delete this.states[chatId];
    }
  },

  // ============================
  // دوال SSH مساعدة
  // ============================
  execCommand(conn, command) {
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        
        let output = '';
        stream.on('data', (data) => output += data.toString());
        stream.on('close', () => resolve(output));
        stream.stderr.on('data', (data) => output += data.toString());
      });
    });
  },

  execCommandWithOutput(conn, command) {
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        
        let output = '';
        stream.on('data', (data) => output += data.toString());
        stream.on('close', () => resolve(output));
        stream.stderr.on('data', (data) => output += data.toString());
      });
    });
  },

  uploadScript(conn, script, remotePath) {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.write(script);
        writeStream.end();
        writeStream.on('close', () => {
          sftp.end();
          resolve();
        });
        writeStream.on('error', reject);
      });
    });
  },

  // ============================
  // دوال التحقق
  // ============================
  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(domain);
  }
};