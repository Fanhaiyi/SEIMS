// services/profileService.js
const path = require('path');
const { readJSONFile, writeJSONFile } = require('../utils/fileUtil');
const PROFILES_FILE = path.join(__dirname, '../data/profiles.json');

// 获取用户资料
async function getProfile(userId) {
  if (!userId) {
    throw new Error('用户ID不能为空');
  }
  const profiles = readJSONFile(PROFILES_FILE, {});
  return profiles[userId] || null;
}

// 保存用户资料
async function saveProfile(userId, profileData) {
  if (!userId) {
    throw new Error('用户ID不能为空');
  }
  const profiles = readJSONFile(PROFILES_FILE, {});
  
  // 更新/创建资料
  profiles[userId] = {
    ...profileData,
    userId,
    updatedAt: new Date().toISOString()
  };

  writeJSONFile(PROFILES_FILE, profiles);
  return profiles[userId];
}

module.exports = { getProfile, saveProfile };