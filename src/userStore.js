// ===================== userStore.js =====================
// نظام إدارة المستخدمين + الإحالات + الرصيد
// ========================================================

const fs = require("fs");
const path = "./src/database/users.json";

if (!fs.existsSync(path)) {
  fs.writeFileSync(path, JSON.stringify({ users: [] }, null, 2));
}

function load() {
  return JSON.parse(fs.readFileSync(path));
}

function save(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ===================== جلب مستخدم =====================
function getUser(id) {
  const db = load();
  return db.users.find(u => u.id === id);
}

// ===================== تحديث بيانات مستخدم =====================
function updateUser(id, newData) {
  const db = load();

  let user = db.users.find(u => u.id === id);

  if (!user) {
    user = { id, balance: 0, referrals: 0, refUsed: false };
    db.users.push(user);
  }

  Object.assign(user, newData);

  save(db);
  return user;
}

// ===================== التحقق من التسجيل =====================
function isUserRegistered(id) {
  const user = getUser(id);
  return user && user.email;
}

// ===================== الرصيد =====================
function addBalance(id, amount) {
  const db = load();
  const user = db.users.find(u => u.id === id);

  if (!user) return false;

  user.balance = (user.balance || 0) + amount;

  save(db);
  return true;
}

// ===================== نظام الإحالات =====================
function hasUsedReferral(id) {
  const user = getUser(id);
  return user?.refUsed === true;
}

function markReferralUsed(id) {
  updateUser(id, { refUsed: true });
}

function addReferralBonus(ownerId) {
  const db = load();
  const user = db.users.find(u => u.id === ownerId);

  if (!user) return false;

  user.balance = (user.balance || 0) + 1; // مكافأة
  user.referrals = (user.referrals || 0) + 1;

  save(db);
  return true;
}

// ===================== التصدير =====================
module.exports = {
  getUser,
  updateUser,
  isUserRegistered,

  addBalance,

  hasUsedReferral,
  markReferralUsed,
  addReferralBonus
};