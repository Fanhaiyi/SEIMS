// routes/index.js（最终修正版）
const express = require('express');
const router = express.Router();

// 导入各模块路由
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const jobRoutes = require('./jobRoutes');
const kgRoutes = require('./kgRoutes.js');
const llmRoutes = require('./doubaoRoutes');

// 关键：导入kgController（解决not defined报错）
const kgController = require('../controllers/kgController');

// 挂载路由
router.use('/', authRoutes); // /api/register /api/login
router.use('/', profileRoutes); // /api/profile/:userId
router.use('/', jobRoutes); // /api/jobs /api/jobs/:id
router.use('/kg', kgRoutes); // 图谱接口：/api/kg/*
router.use('/doubao', llmRoutes); // 豆包接口：/api/doubao/*

// 根路径
router.get('/', (req, res) => {
  res.json({
    message: '就业匹配平台后端API',
    version: '1.0.0',
    endpoints: [
      'POST /api/register - 用户注册',
      'POST /api/login - 用户登录',
      'GET /api/profile/:userId - 获取用户资料',
      'POST /api/profile/:userId - 保存用户资料',
      'POST /api/kg/query-job-skills - 查询职位技能（知识图谱）',
      'GET /api/jobs - 获取职位列表（MySQL）',
      'GET /api/kg/jobs - 获取职位列表（知识图谱）',
      'POST /api/kg/query-skills-to-jobs - 根据技能查询岗位',
      'GET /api/health - 健康检查',
      'GET /api/kg/health - 知识图谱健康检查',
      'GET /api/kg/pages - 知识图谱分页信息',
      'POST /api/doubao/chat - 通用Chat接口（豆包大模型）',
      'POST /api/doubao/job/skill-analysis - 岗位技能分析（豆包大模型）',
      'POST /api/doubao/skill/classify - 技能分类（豆包大模型）'
    ],
    kg_service_url: require('../config/db').KG_DB_SERVICE_URL
  });
});

// 全局健康检查（现在kgController已导入，不会报错）
router.get('/health', kgController.healthCheck);

module.exports = router;