// ======================= src/plugins/store.js =======================

const { autoTranslate } = require("../translator");
const { 
  getUser, 
  getUserBalance, 
  deductBalance 
} = require("../userStore");

const { 
  safeEditMessage, 
  safeAnswerCallback, 
  safeSendMessage 
} = require("../utils/safeHandlers");

const store = require("../storeStore");

module.exports = {
  name: "store",
  command: null,
  callback: /^store:(open|back|product:[0-9]+|buy:[0-9]+|orders)$/i,

  // ============= فتح القائمة من start.js =============
  async openMainMenu(bot, msg, lang, edit = false) {
    return this.showMain(bot, msg, lang, edit);
  },

  // ============= راوتر الكول باك =============
  async callbackRun(ctx) {
    const { bot, query } = ctx;
    const lang = getUser(query.from.id)?.lang || "ar";

    await safeAnswerCallback(bot, query.id);

    const data = query.data.split(":");
    const action = data[1];
    const argument = data[2];

    if (action === "open" || action === "back")
      return this.showMain(bot, query.message, lang, true);

    if (action.startsWith("product"))
      return this.showProduct(bot, query.message, lang, argument);

    if (action.startsWith("buy"))
      return this.buy(bot, query.message, lang, query.from.id, argument);

    if (action === "orders")
      return this.showOrders(bot, query.message, lang, query.from.id);
  },

  // ====================== القائمة الرئيسية ======================
  async showMain(bot, message, lang, edit = false) {
    const products = store.getProducts();

    const title = await autoTranslate("🛒 اختر منتجاً:", lang);
    const ordersTxt = await autoTranslate("🧾 طلباتي", lang);
    const backTxt = await autoTranslate("↩️ رجوع", lang);

    const keyboard = [];

    for (const p of products) {
      keyboard.push([
        { 
          text: `${p.emoji} ${p.name} — ${p.price}💰`, 
          callback_data: `store:product:${p.id}` 
        }
      ]);
    }

    // طلباتي
    keyboard.push([{ text: ordersTxt, callback_data: "store:orders" }]);

    // رجوع
    keyboard.push([{ text: backTxt, callback_data: "start:back" }]);

    const extra = {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    };

    if (edit) {
      return safeEditMessage(bot, {
        text: title,
        chat_id: message.chat.id,
        message_id: message.message_id,
        ...extra
      });
    }

    return safeSendMessage(bot, message.chat.id, title, extra);
  },

  // ====================== صفحة المنتج ======================
  async showProduct(bot, message, lang, id) {
    const p = store.getProductById(id);

    if (!p) {
      const txt = await autoTranslate("❌ المنتج غير موجود.", lang);
      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id
      });
    }

    const txt = await autoTranslate(
      `📦 <b>${p.name}</b>\n` +
      `💰 السعر: ${p.price}\n` +
      `📨 نوع التسليم: ${p.deliveryType === "auto" ? "تلقائي" : "يدوي"}\n\n` +
      `${p.description}`,
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛒 شراء", callback_data: `store:buy:${id}` }],
          [{ text: await autoTranslate("↩️ رجوع", lang), callback_data: "store:back" }]
        ]
      }
    });
  },

  // ====================== الشراء ======================
  async buy(bot, message, lang, userId, id) {
    const user = getUser(userId);
    const p = store.getProductById(id);

    if (!p) {
      const txt = await autoTranslate("❌ المنتج غير موجود.", lang);
      return safeEditMessage(bot, {
        text: txt, chat_id: message.chat.id, message_id: message.message_id
      });
    }

    const balance = getUserBalance(userId);

    if (balance < p.price) {
      const txt = await autoTranslate(
        `❌ رصيدك غير كافٍ.\nرصيدك: ${balance} — السعر: ${p.price}`,
        lang
      );

      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 شحن", callback_data: "start:balance" }]
          ]
        }
      });
    }

    // خصم الرصيد
    deductBalance(userId, p.price);

    // إنشاء الطلب
    const order = store.createOrder({ userId, productId: id });

    const txt = await autoTranslate(
      `✅ تم الشراء بنجاح!\n\n` +
      `🛒 المنتج: ${p.name}\n` +
      `💰 السعر: ${p.price}\n\n` +
      `📨 <b>${order.message}</b>`,
      lang
    );

    return safeEditMessage(bot, {
      text: txt,
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "HTML"
    });
  },

  // ====================== صفحة الطلبات ======================
  async showOrders(bot, message, lang, userId) {
    const orders = store.listUserOrders(userId);

    if (!orders.length) {
      const txt = await autoTranslate("📭 لا يوجد لديك طلبات.", lang);
      return safeEditMessage(bot, {
        text: txt,
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: await autoTranslate("↩️ رجوع", lang), callback_data: "start:back" }]
          ]
        }
      });
    }

    let out = "🧾 <b>طلباتك:</b>\n\n";

    for (const o of orders) {
      const p = store.getProductById(o.productId);
      out += `• <b>${p.name}</b>\n`;
      out += `💰 السعر: ${p.price}\n`;
      out += `📨 ${o.message}\n\n`;
    }

    return safeEditMessage(bot, {
      text: out,
      parse_mode: "HTML",
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: await autoTranslate("↩️ رجوع", lang), callback_data: "start:back" }]
        ]
      }
    });
  }
};