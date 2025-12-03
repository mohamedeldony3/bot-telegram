// ======================= userStore.js =======================
//       تخزين المستخدمين وإدارة بياناتهم بالكامل
// ===========================================================

const fs = require("fs");
const path = require("path");
const USERS_FILE = path.join(__dirname, "..", "users.json");

// ----------------------- تحميل المستخدمين -----------------------
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "{}");
    return {};
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

// ----------------------- حفظ المستخدمين -----------------------
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ----------------------- إنشاء مستخدم جديد -----------------------
function createUser(userId, data = {}) {
  const users = loadUsers();
  
  const newUser = {
    id: userId,
    email: null,
    lang: "ar",
    balance: 0,
    isRegistered: false,
    referredBy: null,
    referralRewardReceived: false,
    subdomains: [],

    // ================= Cloudflare Fields =================
    awaitSubName: false,
    awaitRecordType: false,
    awaitIP: false,
    awaitCnameTarget: false,
    tempSubName: null,
    tempRecordType: null,

    // ================= Registration Fields =================
    awaitEmailRegister: false,

    // ================= Extras =================
    registrationDate: null,
    lastLogin: null,

    ...data
  };

  users[userId] = newUser;
  saveUsers(users);
  return newUser;
}

// ----------------------- جلب مستخدم -----------------------
function getUser(userId) {
  const users = loadUsers();
  return users[userId] || null;
}

// ----------------------- تحديث مستخدم -----------------------
function updateUser(userId, newData) {
  const users = loadUsers();
  
  if (!users[userId]) return createUser(userId, newData);

  users[userId] = { ...users[userId], ...newData };
  saveUsers(users);

  return users[userId];
}

// ----------------------- حذف مستخدم -----------------------
function deleteUser(userId) {
  const users = loadUsers();
  delete users[userId];
  saveUsers(users);
}

// ----------------------- التحقق من التسجيل -----------------------
function isUserRegistered(userId) {
  const user = getUser(userId);
  return user?.isRegistered || false;
}

// ----------------------- إضافة رصيد -----------------------
function addBalance(userId, amount) {
  const user = getUser(userId);
  if (!user) return 0;

  const newBalance = user.balance + amount;
  updateUser(userId, { balance: newBalance });

  return newBalance;
}

// ----------------------- خصم رصيد -----------------------
function deductBalance(userId, amount) {
  const user = getUser(userId);
  if (!user || user.balance < amount) return false;

  updateUser(userId, { balance: user.balance - amount });
  return true;
}

module.exports = {
  loadUsers,
  saveUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  isUserRegistered,
  addBalance,
  deductBalance
};