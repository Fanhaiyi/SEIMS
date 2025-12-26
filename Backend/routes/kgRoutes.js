// routes/kgRoutes.js
const express = require('express');
const router = express.Router();
const kgController = require('../controllers/kgController');

// 知识图谱接口
router.post('/query-job-skills', kgController.queryJobSkills);
router.get('/jobs', kgController.getAllKgJobs);
router.post('/query-skills-to-jobs', kgController.querySkillsToJobs);
router.get('/skills', kgController.getAllSkills);
router.get('/health', kgController.healthCheck); // 图谱健康检查
router.get('/pages', kgController.getKgPages); // 对应路径/api/kg/pages
router.post('/graph-visualization', kgController.getGraphVisualization);

module.exports = router;