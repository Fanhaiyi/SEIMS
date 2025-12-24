// controllers/authController.js
const { registerUser, loginUser } = require('../services/userService');
const { success, fail } = require('../utils/responseUtil');

// 注册
exports.register = async (req, res) => {
  try {
    const user = await registerUser(req.body);
    success(res, { user }, '注册成功');
  } catch (error) {
    const code = error.message === '该邮箱已被注册' ? 400 : 500;
    fail(res, error.message, code);
  }
};

// 登录
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await loginUser(email, password);
    success(res, { user }, '登录成功');
  } catch (error) {
    const code = error.message === '邮箱或密码错误' ? 401 : 500;
    fail(res, error.message, code);
  }
};