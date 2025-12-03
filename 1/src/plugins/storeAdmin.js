// src/plugins/storeAdmin.js

const fs = require("fs");
const path = require("path");
const { safeSendMessage, safeEditMessage, safeAnswerCallback } = require("../utils/safeHandlers");

const dataDir = path.join(__dirname, "..", "data");
const productsFile = path.join(dataDir, "store_products.json");

const DEVELOPER_ID = 7712508848;

function loadProducts() {
  if (!fs.existsSync(productsFile)) return [];
  return JSON.parse(fs.readFileSync(productsFile));
}

function saveProducts(data) {
  fs.writeFileSync(productsFile, JSON.stringify(data, null, 2));
}

module.exports = {
  name: "storeadmin",
  command: /^\/storeadmin$/,
  callback: /^storeadmin:(.+)$/,

  async run(ctx) {
    const { bot, msg } = ctx;
    if (msg.from.id !== DEVELOPER_ID)
      return bot.sendMessage(msg.chat.id, "❌ غير مصرح لك.");
    return this.menu(bot, msg);
  },

  async callbackRun(ctx) {
    const { bot, query } = ctx;

    if (query.from.id !== DEVELOPER_ID) return;
    await safeAnswerCallback(bot, query.id);

    const [_, action, id] = query.data.split(":");

    if (action === "menu") return this.menu(bot, query.message);
    if (action === "list") return this.list(bot, query.message);
    if (action === "add") return this.addProduct(bot, query.message);
    if (action === "view" && id) return this.view(bot, query.message, id);
    if (action === "toggle" && id) return this.toggle(bot, query.message, id);
    if (action === "delete" && id) return this.delete(bot, query.message, id);
  },

  async menu(bot, msg) {
    return safeSendMessage(bot, msg.chat.id, "<b>🛠 إدارة المتجر</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ إضافة منتج", callback_data: "storeadmin:add" }],
          [{ text: "📦 عرض المنتجات", callback_data: "storeadmin:list" }]
        ]
      }
    });
  },

  async list(bot, msg) {
    const products = loadProducts();

    if (!products.length)
      return safeEditMessage(bot, {
        text: "📭 لا يوجد منتجات.",
        chat_id: msg.chat.id,
        message_id: msg.message_id,
      });

    let text = "<b>📦 المنتجات:</b>\n\n";
    const kb = [];

    for (const p of products) {
      text += `• ${p.name} — ${p.price}💰\n\n`;
      kb.push([{ text: p.name, callback_data: `storeadmin:view:${p.id}` }]);
    }

    kb.push([{ text: "↩️ رجوع", callback_data: "storeadmin:menu" }]);

    return safeEditMessage(bot, {
      text,
      parse_mode: "HTML",
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: { inline_keyboard: kb }
    });
  },

  async view(bot, msg, id) {
    const products = loadProducts();
    const p = products.find(x => x.id === id);

    const text =
      `📦 <b>${p.name}</b>\n` +
      `💰 السعر: ${p.price}\n` +
      `📄 الوصف: ${p.description}\n` +
      `📨 الرسالة: ${p.message}\n` +
      `📦 المخزون: ${p.stock}\n` +
      `🔘 ${p.active ? "نشط" : "متوقف"}`;

    return safeEditMessage(bot, {
      text,
      parse_mode: "HTML",
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: p.active ? "⛔ إيقاف" : "✅ تفعيل", callback_data: `storeadmin:toggle:${id}` }],
          [{ text: "🗑 حذف", callback_data: `storeadmin:delete:${id}` }],
          [{ text: "↩️ رجوع", callback_data: "storeadmin:list" }]
        ]
      }
    });
  },

  async addProduct(bot, msg) {
    const chatId = msg.chat.id;

    const product = {
      id: "",
      name: "",
      price: 0,
      description: "",
      emoji: "📦",
      message: "",
      stock: 0,
      deliveryType: "auto",
      active: true
    };

    bot.sendMessage(chatId, "📝 أرسل اسم المنتج:");

    bot.once("message", m1 => {
      product.name = m1.text;

      bot.sendMessage(chatId, "💰 أرسل السعر:");

      bot.once("message", m2 => {
        product.price = Number(m2.text);

        bot.sendMessage(chatId, "📄 أرسل الوصف:");

        bot.once("message", m3 => {
          product.description = m3.text;

          bot.sendMessage(chatId, "📨 أرسل رسالة التسليم الثابتة:");

          bot.once("message", m4 => {
            product.message = m4.text;

            bot.sendMessage(chatId, "🆔 أرسل ID المنتج:");

            bot.once("message", m5 => {
              product.id = m5.text;

              bot.sendMessage(chatId, "🔢 أرسل المخزون (عدد فقط):");

              bot.once("message", m6 => {
                product.stock = Number(m6.text);

                const products = loadProducts();
                products.push(product);
                saveProducts(products);

                bot.sendMessage(chatId, "✔️ تم حفظ المنتج.");
              });
            });
          });
        });
      });
    });
  },

  async toggle(bot, msg, id) {
    const p = loadProducts();
    const prod = p.find(x => x.id === id);
    prod.active = !prod.active;
    saveProducts(p);
    return this.view(bot, msg, id);
  },

  async delete(bot, msg, id) {
    const products = loadProducts().filter(p => p.id !== id);
    saveProducts(products);

    return safeEditMessage(bot, {
      text: "🗑 تم الحذف.",
      chat_id: msg.chat.id,
      message_id: msg.message_id,
    });
  }
};