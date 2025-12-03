// src/plugins/installwings.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");
const axios = require("axios");

const WINGS_SCRIPT_URL = "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/wings-auto.sh";

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
  name: "installwings",
  command: null,
  callback: /^installwings:(start|server:\d+|confirm:(yes|no))$/i,

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

    const text = await autoTranslate("🛠 اختر السيرفر لتثبيت Wings:", lang);

    const keyboard = servers.map((srv, idx) => [
      {
        text: `${srv.name} (${srv.host})`,
        callback_data: `installwings:server:${idx}`
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
        step: "ask_panel_url",
        server: selectedServer,
        data: {}
      };

      return bot.sendMessage(
        chatId,
        await autoTranslate("✅ تم الاتصال بالسيرفر بنجاح!\n\n🔗 أرسل Panel URL:\nمثال: https://panel.example.com", lang)
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
    // STEP 1 — PANEL URL
    // ------------------------
    if (currentStep === "ask_panel_url") {
      if (!this.isValidUrl(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ رابط Panel غير صالح. يرجى إرسال رابط صحيح (مثال: https://panel.example.com):", lang)
        );
      }

      state.data.panel_url = text;
      state.step = "ask_node_fqdn";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🌍 أرسل Node FQDN:\nمثال: node1.example.com", lang)
      );
    }

    // ------------------------
    // STEP 2 — NODE FQDN
    // ------------------------
    if (currentStep === "ask_node_fqdn") {
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ FQDN غير صالح. يرجى إرسال FQDN صحيح (مثال: node1.example.com):", lang)
        );
      }

      state.data.node_fqdn = text;
      state.step = "ask_email";

      return bot.sendMessage(
        chatId,
        await autoTranslate("📧 أرسل Email الإدمن:\nمثال: admin@example.com", lang)
      );
    }

    // ------------------------
    // STEP 3 — ADMIN EMAIL
    // ------------------------
    if (currentStep === "ask_email") {
      if (!this.isValidEmail(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الإيميل غير صالح. يرجى إرسال إيميل صحيح:", lang)
        );
      }

      state.data.email = text;
      state.step = "ask_token";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔑 أرسل Wings Token:\nمثال: ptla_WZ3bA52sYq12M5... (من لوحة تحكم Pterodactyl)", lang)
      );
    }

    // ------------------------
    // STEP 4 — WINGS TOKEN
    // ------------------------
    if (currentStep === "ask_token") {
      if (!text || text.length < 10) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ Token غير صالح. يرجى إرسال token صحيح:", lang)
        );
      }

      state.data.token = text;
      state.step = "ask_node_id";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🆔 أرسل Node ID:\nمثال: 1", lang)
      );
    }

    // ------------------------
    // STEP 5 — NODE ID → تأكيد التثبيت
    // ------------------------
    if (currentStep === "ask_node_id") {
      if (!this.isValidNodeId(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ Node ID غير صالح. يرجى إرسال رقم صحيح:", lang)
        );
      }

      state.data.node_id = text;
      state.step = "confirm_install";

      // عرض تأكيد التثبيت
      const confirmText = await autoTranslate(
        `⚠️ **تأكيد تثبيت Wings**\n\n` +
        `🌍 Panel URL: ${state.data.panel_url}\n` +
        `🖥 Node FQDN: ${state.data.node_fqdn}\n` +
        `📧 الإيميل: ${state.data.email}\n` +
        `🔑 Token: ${state.data.token.substring(0, 10)}...\n` +
        `🆔 Node ID: ${state.data.node_id}\n\n` +
        `هل تريد بدء التثبيت؟`,
        lang
      );

      const confirmKeyboard = {
        inline_keyboard: [
          [
            { 
              text: await autoTranslate("✅ نعم، ابدأ التثبيت", lang), 
              callback_data: `installwings:confirm:yes` 
            },
            { 
              text: await autoTranslate("❌ إلغاء", lang), 
              callback_data: `installwings:confirm:no` 
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
      await autoTranslate("📡 جاري تحميل سكربت Wings من GitHub...", lang)
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
      const response = await axios.get(WINGS_SCRIPT_URL);
      let script = response.data;

      // استبدال المتغيرات في السكربت
      script = script.replace(/{{PANEL_URL}}/g, data.panel_url);
      script = script.replace(/{{NODE_FQDN}}/g, data.node_fqdn);
      script = script.replace(/{{ADMIN_EMAIL}}/g, data.email);
      script = script.replace(/{{WINGS_TOKEN}}/g, data.token);
      script = script.replace(/{{NODE_ID}}/g, data.node_id);

      await bot.sendMessage(chatId, "🔌 جاري الاتصال بالسيرفر...");

      const conn = new Client();

      conn.on("ready", async () => {
        await bot.sendMessage(chatId, "✅ تم الاتصال بالسيرفر!");

        const workdir = `/home/${srv.user}/wings_install`;
        const scriptPath = `${workdir}/wings_auto.sh`;

        try {
          // إنشاء المجلد ورفع السكربت
          await this.execCommand(conn, `rm -rf ${workdir} && mkdir -p ${workdir}`);
          await this.uploadScript(conn, script, scriptPath);
          await this.execCommand(conn, `chmod +x ${scriptPath}`);

          await bot.sendMessage(chatId, "⚙️ بدء تثبيت Wings...");

          // تشغيل السكربت مع متابعة الإخراج
          const output = await this.execCommandWithOutput(conn, `cd ${workdir} && sudo bash ${scriptPath}`);

          // تنظيف الملفات
          await this.execCommand(conn, `rm -rf ${workdir}`);

          conn.end();

          // إرسال النتيجة النهائية
          const lastLines = output.split('\n').slice(-40).join('\n');
          
          await bot.sendMessage(
            chatId,
            `🎉 **تم تثبيت Wings بنجاح!**\n\n` +
            `🌍 Panel: ${data.panel_url}\n` +
            `🖥 Node: ${data.node_fqdn}\n` +
            `📧 Email: ${data.email}\n` +
            `🆔 Node ID: ${data.node_id}\n\n` +
            `📝 آخر 40 سطر:\n\`\`\`\n${lastLines}\n\`\`\``,
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
  isValidUrl(url) {
    try {
      new URL(url);
      return url.startsWith('http');
    } catch {
      return false;
    }
  },

  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(domain);
  },

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isValidNodeId(id) {
    return /^\d+$/.test(id);
  }
};