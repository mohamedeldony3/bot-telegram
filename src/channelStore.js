// src/channelStore.js

const fs = require('fs');
const path = require('path');

const CHANNELS_FILE = path.join(__dirname, '..', 'channels.json');

// تحميل القنوات من الملف
function loadChannels() {
  try {
    if (!fs.existsSync(CHANNELS_FILE)) {
      fs.writeFileSync(CHANNELS_FILE, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(CHANNELS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading channels:', error);
    return [];
  }
}

// حفظ القنوات في الملف
function saveChannels(channels) {
  try {
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
  } catch (error) {
    console.error('Error saving channels:', error);
  }
}

// إضافة قناة جديدة
function addChannel(channel) {
  const channels = loadChannels();
  
  // التحقق من عدم وجود القناة مسبقاً
  if (!channels.some(c => c.id === channel.id)) {
    channels.push({
      id: channel.id,
      username: channel.username,
      title: channel.title,
      addedAt: new Date().toISOString()
    });
    saveChannels(channels);
    return true;
  }
  return false;
}

// حذف قناة
function removeChannel(channelId) {
  const channels = loadChannels();
  const filtered = channels.filter(c => c.id !== channelId);
  
  if (filtered.length !== channels.length) {
    saveChannels(filtered);
    return true;
  }
  return false;
}

// الحصول على جميع القنوات
function getChannels() {
  return loadChannels();
}

// التحقق من اشتراك المستخدم في القنوات
async function checkUserSubscription(bot, userId) {
  const channels = loadChannels();
  
  if (channels.length === 0) {
    return { subscribed: true, missing: [] }; // لا توجد قنوات مطلوبة
  }

  const missing = [];

  for (const channel of channels) {
    try {
      const chatMember = await bot.getChatMember(channel.id, userId);
      
      // التحقق إذا كان المستخدم مشتركاً (member, administrator, creator)
      if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
        missing.push(channel);
      }
    } catch (error) {
      console.error(`Error checking subscription for channel ${channel.id}:`, error);
      missing.push(channel);
    }
  }

  return {
    subscribed: missing.length === 0,
    missing: missing
  };
}

module.exports = {
  loadChannels,
  saveChannels,
  addChannel,
  removeChannel,
  getChannels,
  checkUserSubscription
};