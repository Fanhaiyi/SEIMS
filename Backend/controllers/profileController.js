// controllers/profileController.js
const { getProfile, saveProfile } = require('../services/profileService');
const { success, fail } = require('../utils/responseUtil');

// 获取用户资料
exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const profile = await getProfile(userId);
    success(res, { profile });
  } catch (error) {
    fail(res, error.message, 500);
  }
};

// 保存用户资料
exports.saveProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const profile = await saveProfile(userId, req.body);
    success(res, { profile }, '资料保存成功');
  } catch (error) {
    fail(res, error.message, 500);
  }
};