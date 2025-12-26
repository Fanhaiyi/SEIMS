// utils/fileUtil.js
const fs = require('fs');
const path = require('path');

// 确保data目录存在
function ensureDataDir() {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 读取JSON文件（兼容数组/对象格式）
function readJSONFile(filePath, defaultValue = {}) {
  ensureDataDir();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      // 数组转对象（email为key）
      if (Array.isArray(parsed)) {
        const obj = {};
        parsed.forEach(item => item.email && (obj[item.email] = item));
        return obj;
      }
      return parsed;
    }
  } catch (error) {
    console.error(`读取文件失败 ${filePath}:`, error.message);
  }
  return defaultValue;
}

// 写入JSON文件（确保对象格式）
function writeJSONFile(filePath, data) {
  ensureDataDir();
  try {
    const dataToWrite = typeof data === 'object' && !Array.isArray(data) ? data : {};
    fs.writeFileSync(filePath, JSON.stringify(dataToWrite, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`写入文件失败 ${filePath}:`, error.message);
    return false;
  }
}

module.exports = { readJSONFile, writeJSONFile, ensureDataDir };