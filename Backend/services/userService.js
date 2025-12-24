// services/userService.js
const path = require('path');
const { readJSONFile, writeJSONFile } = require('../utils/fileUtil');
const USERS_FILE = path.join(__dirname, '../data/users.json');

// 注册用户
async function registerUser(userData) {
  const { name, email, password } = userData;
  
  // 校验参数
  if (!name || !email || !password) {
    throw new Error('请填写所有必填字段');
  }

  const users = readJSONFile(USERS_FILE, {});
  
  // 检查用户是否存在
  if (users[email]) {
    throw new Error('该邮箱已被注册');
  }

  // 创建新用户
  const userId = `user_${Date.now()}`;
  users[email] = {
    id: userId,
    name,
    email,
    password, // 生产环境需加密
    createdAt: new Date().toISOString()
  };

  writeJSONFile(USERS_FILE, users);
  return { id: userId, name, email };
}

// 用户登录
async function loginUser(email, password) {
  // 校验参数
  if (!email || !password) {
    throw new Error('请提供邮箱和密码');
  }

  const users = readJSONFile(USERS_FILE, {});
  const user = users[email];

  // 检查用户是否存在
  if (!user) {
    throw new Error('邮箱或密码错误');
  }

  // 密码验证
  let passwordMatch = false;
  if (user.password.startsWith('$2a$')) {
    // 哈希密码验证（需安装bcrypt：npm install bcrypt）
    try {
      const bcrypt = require('bcrypt');
      passwordMatch = bcrypt.compareSync(password, user.password);
    } catch (err) {
      throw new Error('服务器配置错误：缺少bcrypt依赖');
    }
  } else {
    // 明文密码验证（仅测试用）
    passwordMatch = user.password === password;
  }

  if (!passwordMatch) {
    throw new Error('邮箱或密码错误');
  }

  return { id: user.id, name: user.name, email: user.email };
}

module.exports = { registerUser, loginUser };