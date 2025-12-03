// src/plugins/installplatform.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");
const axios = require("axios");

const PANEL_SCRIPT_URL = "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/panel2.sh";
const WINGS_SCRIPT_URL = "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/wings-auto.sh";
const DASH_SCRIPT_URL = "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/dash-auto.sh";

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
  name: "installplatform",
  command: null,
  callback: /^installplatform:(start|server:\d+|confirm:(yes|no))$/i,

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

    const text = await autoTranslate("🖥 اختر السيرفر لتثبيت المنصة الكاملة:", lang);

    const keyboard = servers.map((srv, idx) => [
      {
        text: `${srv.name} (${srv.host})`,
        callback_data: `installplatform:server:${idx}`
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
        step: "ask_panel_domain",
        server: selectedServer,
        data: {}
      };

      return bot.sendMessage(
        chatId,
        await autoTranslate("✅ تم الاتصال بالسيرفر بنجاح!\n\n🌍 أرسل دومين البانل:\nمثال: panel.example.com", lang)
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
    // STEP 1 — PANEL DOMAIN
    // ------------------------
    if (currentStep === "ask_panel_domain") {
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الدومين غير صالح. يرجى إرسال دومين صحيح (مثال: panel.example.com):", lang)
        );
      }

      state.data.panel_domain = text;
      state.step = "ask_panel_email";

      return bot.sendMessage(
        chatId,
        await autoTranslate("📧 أرسل الإيميل:", lang)
      );
    }

    // ------------------------
    // STEP 2 — PANEL EMAIL
    // ------------------------
    if (currentStep === "ask_panel_email") {
      if (!this.isValidEmail(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الإيميل غير صالح. يرجى إرسال إيميل صحيح:", lang)
        );
      }

      state.data.panel_email = text;
      state.step = "ask_panel_admin_user";

      return bot.sendMessage(
        chatId,
        await autoTranslate("👤 أرسل اسم الأدمن:", lang)
      );
    }

    // ------------------------
    // STEP 3 — PANEL ADMIN USER
    // ------------------------
    if (currentStep === "ask_panel_admin_user") {
      if (!text || text.length < 3) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ اسم الأدمن يجب أن يكون 3 أحرف على الأقل:", lang)
        );
      }

      state.data.panel_admin_user = text;
      state.step = "ask_panel_admin_pass";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔐 أرسل باسورد الأدمن:", lang)
      );
    }

    // ------------------------
    // STEP 4 — PANEL ADMIN PASS
    // ------------------------
    if (currentStep === "ask_panel_admin_pass") {
      if (!text || text.length < 8) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ كلمة المرور يجب أن تكون 8 أحرف على الأقل:", lang)
        );
      }

      state.data.panel_admin_pass = text;
      state.step = "ask_wings_panel_url";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔗 أرسل Panel URL للوينجز:\nمثال: https://panel.example.com", lang)
      );
    }

    // ------------------------
    // STEP 5 — WINGS PANEL URL
    // ------------------------
    if (currentStep === "ask_wings_panel_url") {
      if (!this.isValidUrl(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ رابط Panel غير صالح. يرجى إرسال رابط صحيح (مثال: https://panel.example.com):", lang)
        );
      }

      state.data.wings_panel_url = text;
      state.step = "ask_wings_node_fqdn";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🌍 أرسل Node FQDN:\nمثال: node1.example.com", lang)
      );
    }

    // ------------------------
    // STEP 6 — WINGS NODE FQDN
    // ------------------------
    if (currentStep === "ask_wings_node_fqdn") {
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ FQDN غير صالح. يرجى إرسال FQDN صحيح (مثال: node1.example.com):", lang)
        );
      }

      state.data.wings_node_fqdn = text;
      state.step = "ask_wings_token";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔑 أرسل Wings Token:\nمثال: ptla_WZ3bA52sYq12M5...", lang)
      );
    }

    // ------------------------
    // STEP 7 — WINGS TOKEN
    // ------------------------
    if (currentStep === "ask_wings_token") {
      if (!text || text.length < 10) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ Token غير صالح. يرجى إرسال token صحيح:", lang)
        );
      }

      state.data.wings_token = text;
      state.step = "ask_wings_node_id";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🆔 أرسل Node ID:\nمثال: 1", lang)
      );
    }

    // ------------------------
    // STEP 8 — WINGS NODE ID
    // ------------------------
    if (currentStep === "ask_wings_node_id") {
      if (!this.isValidNodeId(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ Node ID غير صالح. يرجى إرسال رقم صحيح:", lang)
        );
      }

      state.data.wings_node_id = text;
      state.step = "ask_dash_domain";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🌍 أرسل دومين الداش:\nمثال: dash.example.com", lang)
      );
    }

    // ------------------------
    // STEP 9 — DASH DOMAIN
    // ------------------------
    if (currentStep === "ask_dash_domain") {
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الدومين غير صالح. يرجى إرسال دومين صحيح (مثال: dash.example.com):", lang)
        );
      }

      state.data.dash_domain = text;
      state.step = "ask_dash_dbpass";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔐 أرسل كلمة مرور قاعدة البيانات للداش:", lang)
      );
    }

    // ------------------------
    // STEP 10 — DASH DB PASSWORD
    // ------------------------
    if (currentStep === "ask_dash_dbpass") {
      if (!text || text.length < 6) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل:", lang)
        );
      }

      state.data.dash_dbpass = text;
      state.step = "confirm_install";

      // عرض تأكيد التثبيت
      const confirmText = await autoTranslate(
        `⚠️ **تأكيد تثبيت المنصة الكاملة**\n\n` +
        `**🛠 البانل:**\n` +
        `🌍 الدومين: ${state.data.panel_domain}\n` +
        `📧 الإيميل: ${state.data.panel_email}\n` +
        `👤 الأدمن: ${state.data.panel_admin_user}\n` +
        `🔐 الباسورد: ${'*'.repeat(state.data.panel_admin_pass.length)}\n\n` +
        `**🪽 الوينجز:**\n` +
        `🔗 Panel: ${state.data.wings_panel_url}\n` +
        `🌍 Node: ${state.data.wings_node_fqdn}\n` +
        `🔑 Token: ${state.data.wings_token.substring(0, 10)}...\n` +
        `🆔 Node ID: ${state.data.wings_node_id}\n\n` +
        `**📊 الداش:**\n` +
        `🌍 الدومين: ${state.data.dash_domain}\n` +
        `🔐 DB Pass: ${state.data.dash_dbpass}\n\n` +
        `هل تريد بدء التثبيت؟`,
        lang
      );

      const confirmKeyboard = {
        inline_keyboard: [
          [
            { 
              text: await autoTranslate("✅ نعم، ابدأ التثبيت", lang), 
              callback_data: `installplatform:confirm:yes` 
            },
            { 
              text: await autoTranslate("❌ إلغاء", lang), 
              callback_data: `installplatform:confirm:no` 
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
      await autoTranslate("🚀 بدء تثبيت المنصة الكاملة...", lang)
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
      await bot.sendMessage(chatId, "📡 جاري تحميل السكربتات...");

      // تحميل جميع السكربتات
      const [panelScript, wingsScript, dashScript] = await Promise.all([
        axios.get(PANEL_SCRIPT_URL),
        axios.get(WINGS_SCRIPT_URL),
        axios.get(DASH_SCRIPT_URL)
      ]);

      // تعديل السكربتات
      const panelScriptFinal = panelScript.data
        .replace(/yourPassword/g, data.panel_admin_pass)
        .replace(/DOMAIN=.*/, `DOMAIN="${data.panel_domain}"`);

      const wingsScriptFinal = wingsScript.data
        .replace(/{{PANEL_URL}}/g, data.wings_panel_url)
        .replace(/{{NODE_FQDN}}/g, data.wings_node_fqdn)
        .replace(/{{ADMIN_EMAIL}}/g, data.panel_email)
        .replace(/{{WINGS_TOKEN}}/g, data.wings_token)
        .replace(/{{NODE_ID}}/g, data.wings_node_id);

      const dashScriptFinal = dashScript.data
        .replace(/{{DOMAIN}}/g, data.dash_domain)
        .replace(/{{DB_PASSWORD}}/g, data.dash_dbpass);

      await bot.sendMessage(chatId, "🔌 جاري الاتصال بالسيرفر...");

      const conn = new Client();

      conn.on("ready", async () => {
        await bot.sendMessage(chatId, "✅ تم الاتصال بالسيرفر!");

        try {
          const workdir = `/home/${srv.user}/platform_install`;

          // إنشاء المجلد
          await this.execCommand(conn, `rm -rf ${workdir} && mkdir -p ${workdir}`);

          // ============================
          // 1. تثبيت البانل
          // ============================
          await bot.sendMessage(chatId, "🛠 بدء تثبيت البانل...");
          
          await this.uploadScript(conn, panelScriptFinal, `${workdir}/panel.sh`);
          await this.execCommand(conn, `chmod +x ${workdir}/panel.sh`);
          
          const panelOutput = await this.execCommandWithOutput(conn, `cd ${workdir} && sudo bash panel.sh`);
          await bot.sendMessage(chatId, "✅ تم تثبيت البانل بنجاح!");

          // ============================
          // 2. تثبيت الوينجز
          // ============================
          await bot.sendMessage(chatId, "🪽 بدء تثبيت الوينجز...");
          
          await this.uploadScript(conn, wingsScriptFinal, `${workdir}/wings.sh`);
          await this.execCommand(conn, `chmod +x ${workdir}/wings.sh`);
          
          const wingsOutput = await this.execCommandWithOutput(conn, `cd ${workdir} && sudo bash wings.sh`);
          await bot.sendMessage(chatId, "✅ تم تثبيت الوينجز بنجاح!");

          // ============================
          // 3. تثبيت الداش
          // ============================
          await bot.sendMessage(chatId, "📊 بدء تثبيت الداش...");
          
          await this.uploadScript(conn, dashScriptFinal, `${workdir}/dash.sh`);
          await this.execCommand(conn, `chmod +x ${workdir}/dash.sh`);
          
          const dashOutput = await this.execCommandWithOutput(conn, `cd ${workdir} && sudo bash dash.sh`);
          await bot.sendMessage(chatId, "✅ تم تثبيت الداش بنجاح!");

          // تنظيف الملفات
          await this.execCommand(conn, `rm -rf ${workdir}`);

          conn.end();

          // إرسال النتيجة النهائية
          await bot.sendMessage(
            chatId,
            `🎉 **تم تثبيت المنصة الكاملة بنجاح!**\n\n` +
            `**🛠 البانل:**\n` +
            `🌍 https://${data.panel_domain}\n` +
            `👤 ${data.panel_admin_user}\n` +
            `🔐 ${data.panel_admin_pass}\n\n` +
            `**🪽 الوينجز:**\n` +
            `🌍 ${data.wings_node_fqdn}\n` +
            `🔗 ${data.wings_panel_url}\n\n` +
            `**📊 الداش:**\n` +
            `🌍 https://${data.dash_domain}/installer\n` +
            `🔐 DB: ${data.dash_dbpass}\n\n` +
            `➡️ **افتح روابط الداش وأكمل التثبيت من المتصفح.**`,
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
      await bot.sendMessage(chatId, `❌ فشل تحميل السكربتات: ${error.message}`);
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