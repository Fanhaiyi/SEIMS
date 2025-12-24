// routes/doubao.js 豆包接口路由
const express = require('express');
const router = express.Router();
const llmService = require('../services/llmService');

// 🔥 通用Chat接口（前端调用这个接口）
router.post('/chat', async (req, res, next) => {
  try {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'prompt不能为空'
      });
    }
    // 调用llmService的callLLM方法
    const result = await llmService.callLLM(prompt, systemPrompt);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error); // 交给全局错误处理
  }
});

// 🔥 业务封装：岗位技能分析接口
router.post('/job/skill-analysis', async (req, res, next) => {
  try {
    const { jobTitle, skillList } = req.body;
    if (!jobTitle || !skillList) {
      return res.status(400).json({
        success: false,
        message: '职位名称和技能列表不能为空'
      });
    }
    const result = await llmService.generateSkillAnalysis(jobTitle, skillList);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 🔥 业务封装：技能分类接口
router.post('/skill/classify', async (req, res, next) => {
  try {
    const { skills } = req.body;
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        message: '请传入数组格式的技能列表'
      });
    }
    const result = await llmService.classifySkills(skills);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 健康检查接口
router.get('/health', async (req, res, next) => {
  try {
    const result = await llmService.healthCheck();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;