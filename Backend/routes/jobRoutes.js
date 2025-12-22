// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// 岗位接口
router.get('/jobs', jobController.getAllJobs);
router.get('/jobs/:id', jobController.getJobById);

module.exports = router;