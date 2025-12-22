// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 注册/登录接口
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;