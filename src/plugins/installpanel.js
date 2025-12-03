// src/plugins/installpanel.js

const { autoTranslate } = require("../translator");
const { getUser } = require("../userStore");
const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

const RAW_SCRIPT =
  "https://raw.githubusercontent.com/mohamedeldony3/install-petro-theme/main/panel2.sh";

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
  name: "installpanel",
  command: null,
  callback: /^installpanel:(start|server:\d+)$/i,

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

    const text = await autoTranslate("🛠 اختر السيرفر لتثبيت البانل:", lang);

    const keyboard = servers.map((srv, idx) => [
      {
        text: `${srv.name} (${srv.host})`,
        callback_data: `installpanel:server:${idx}`
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
  // CALLBACK
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
  },

  // ============================
  // فحص اتصال السيرفر
  // ============================
  async checkServerConnection(server) {
    return new Promise((resolve) => {
      const conn = new Client();
      let connected = false;

      // وقت انتظار 30 ثانية
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
        readyTimeout: 20000,
        algorithms: {
          kex: [
            'diffie-hellman-group1-sha1',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha1'
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes256-gcm@openssh.com',
            'aes256-cbc'
          ]
        }
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

    // ------------------------
    // STEP 1 — DOMAIN
    // ------------------------
    if (state.step === "ask_domain") {
      // تحقق من صحة الدومين
      if (!this.isValidDomain(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الدومين غير صالح. يرجى إرسال دومين صحيح (مثال: example.com):", lang)
        );
      }

      state.data.domain = text;
      state.step = "ask_email";

      return bot.sendMessage(
        chatId,
        await autoTranslate("📧 أرسل الإيميل:", lang)
      );
    }

    // ------------------------
    // STEP 2 — EMAIL
    // ------------------------
    if (state.step === "ask_email") {
      // تحقق من صحة الإيميل
      if (!this.isValidEmail(text)) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ الإيميل غير صالح. يرجى إرسال إيميل صحيح:", lang)
        );
      }

      state.data.email = text;
      state.step = "ask_admin_user";

      return bot.sendMessage(
        chatId,
        await autoTranslate("👤 أرسل اسم الأدمن:", lang)
      );
    }

    // ------------------------
    // STEP 3 — ADMIN USER
    // ------------------------
    if (state.step === "ask_admin_user") {
      if (!text || text.length < 3) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ اسم الأدمن يجب أن يكون 3 أحرف على الأقل:", lang)
        );
      }

      state.data.admin_user = text;
      state.step = "ask_admin_pass";

      return bot.sendMessage(
        chatId,
        await autoTranslate("🔐 أرسل باسورد الأدمن (يجب أن يكون قوياً):", lang)
      );
    }

    // ------------------------
    // STEP 4 — ADMIN PASS
    // ------------------------
    if (state.step === "ask_admin_pass") {
      if (!text || text.length < 8) {
        return bot.sendMessage(
          chatId,
          await autoTranslate("❌ كلمة المرور يجب أن تكون 8 أحرف على الأقل:", lang)
        );
      }

      state.data.admin_pass = text;
      state.step = "confirm_install";

      // عرض تأكيد التثبيت
      const confirmText = await autoTranslate(
        `⚠️ **تأكيد التثبيت**\n\n` +
        `🌍 الدومين: ${state.data.domain}\n` +
        `📧 الإيميل: ${state.data.email}\n` +
        `👤 الأدمن: ${state.data.admin_user}\n` +
        `🔐 الباسورد: ${'*'.repeat(state.data.admin_pass.length)}\n\n` +
        `هل تريد بدء التثبيت؟`,
        lang
      );

      const confirmKeyboard = {
        inline_keyboard: [
          [
            { 
              text: await autoTranslate("✅ نعم، ابدأ التثبيت", lang), 
              callback_data: `installpanel:confirm:yes` 
            },
            { 
              text: await autoTranslate("❌ إلغاء", lang), 
              callback_data: `installpanel:confirm:no` 
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
      await autoTranslate("⚙️ جاري بدء التثبيت…", lang)
    );

    return this.beginInstall(bot, chatId, lang);
  },

  // ============================
  // SSH INSTALLER
  // ============================
  async beginInstall(bot, chatId, lang) {
    const state = this.states[chatId];
    const srv = state.server;
    const data = state.data;

    const conn = new Client();

    conn.on("ready", async () => {
      await bot.sendMessage(chatId, "🔌 تم الاتصال بالسيرفر!");

      const workdir = `/home/${srv.user}/pane`;

      const commands = [
        `rm -rf ${workdir}`,
        `mkdir -p ${workdir}`,
        `cd ${workdir}`,
        `curl -o panel2.sh ${RAW_SCRIPT}`,
        `chmod +x panel2.sh`,
        // تعديل السكربت
        `sed -i "s|yourPassword|${data.admin_pass}|g" panel2.sh`,
        `sed -i "s|DOMAIN=.*|DOMAIN=\\"${data.domain}\\"|g" panel2.sh`,
        `sudo bash panel2.sh`
      ];

      conn.exec(commands.join(" && "), async (err, stream) => {
        if (err) {
          await bot.sendMessage(chatId, "❌ خطأ أثناء تشغيل التثبيت.");
          return conn.end();
        }

        let buffer = [];

        stream.on("data", async chunk => {
          const txt = chunk.toString();
          buffer.push(txt);

          if (txt.includes("PHP")) await bot.sendMessage(chatId, "⚙️ تثبيت PHP…");
          if (txt.includes("MariaDB")) await bot.sendMessage(chatId, "🛠 تهيئة MariaDB…");
          if (txt.includes("Nginx")) await bot.sendMessage(chatId, "🌐 إعداد Nginx…");
        });

        stream.on("close", async () => {
          const last10 = buffer.slice(-10).join("\n");

          conn.exec(`rm -rf ${workdir}`, () => conn.end());

          delete this.states[chatId];

          await bot.sendMessage(
            chatId,
            `🎉 **تم التثبيت بنجاح!**\n\n🌍 https://${data.domain}\n\n**آخر 10 أسطر:**\n\`\`\`\n${last10}\n\`\`\``,
            { parse_mode: "Markdown" }
          );
        });
      });
    });

    conn.on('error', async (err) => {
      await bot.sendMessage(
        chatId,
        `❌ فشل الاتصال بالسيرفر أثناء التثبيت: ${err.message}`
      );
    });

    conn.connect({
      host: srv.host,
      port: srv.port,
      username: srv.user,
      password: srv.pass
    });
  },

  // ============================
  // دوال التحقق
  // ============================
  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(domain);
  },

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
};