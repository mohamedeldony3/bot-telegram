// ======================= BETTER TRANSLATOR =======================
// أسرع نظام ترجمة – مع كاش دائم + كاش لحظي + fallback بدون توقف

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "translation_cache.json");

// تحميل كاش من الملف
let persistentCache = {};
try {
  if (fs.existsSync(CACHE_FILE)) {
    persistentCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  }
} catch (err) {
  persistentCache = {};
}

// كاش مؤقت في الذاكرة لسرعة فائقة
const memoryCache = new Map();

// مدة الكاش المؤقت (20 دقيقة)
const MEMORY_CACHE_TIME = 20 * 60 * 1000;

// حفظ الترجمة في ملف JSON
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(persistentCache, null, 2));
}

// ترجمة باستخدام MyMemory + حماية
async function translate(text, lang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ar|${lang}`;

  try {
    const res = await axios.get(url, { timeout: 2000 });

    return res.data?.responseData?.translatedText || text;
  } catch (err) {
    console.log("⚠️ Translation Fallback:", err.message);
    return text; // رجوع للنص الأصلي بدل التوقف
  }
}

async function autoTranslate(text, lang = "ar") {
  if (!text || lang === "ar") return text;

  const key = `${text}_${lang}`;

  // 1️⃣ فحص الكاش الدائم (أسرع وأهم)
  if (persistentCache[key]) return persistentCache[key];

  // 2️⃣ فحص كاش الذاكرة السريع
  const record = memoryCache.get(key);
  const now = Date.now();
  if (record && now - record.time < MEMORY_CACHE_TIME) return record.value;

  // 3️⃣ الترجمة الفعلية لأول مرة
  const translated = await translate(text, lang);

  // 4️⃣ التخزين في كاش الذاكرة
  memoryCache.set(key, { value: translated, time: now });

  // 5️⃣ تخزين دائم في ملف JSON
  persistentCache[key] = translated;
  saveCache();

  return translated;
}

module.exports = { autoTranslate };