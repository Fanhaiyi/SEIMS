// routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// 资料接口
router.get('/profile/:userId', profileController.getProfile);
router.post('/profile/:userId', profileController.saveProfile);

module.exports = router;