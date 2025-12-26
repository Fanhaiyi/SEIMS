const axios = require('axios'); // 调用5000端口知识图谱服务
const { KG_DB_SERVICE_URL } = require('../config/db'); // 导入图谱服务地址
const { queryJobsByCategory } = require('../services/mysqlService');
const { success, fail } = require('../utils/responseUtil');
const llmService = require('../services/llmService'); // 导入豆包大模型服务

// -------------------------- 适配FastAPI的完整代码 --------------------------
// 查询职位技能（适配FastAPI的/api/query-job-skills接口 + 对齐文档返回格式）
exports.queryJobSkills = async (req, res) => {
  try {
    // 修复：正确获取前端传递的jobTitle参数
    const { jobTitle } = req.body;
    // 入参校验：岗位名称不能为空
    if (!jobTitle || jobTitle.trim() === '') {
      return fail(res, '岗位名称不能为空', 400, {
        success: false,
        jobTitle: '',
        skills: []
      });
    }

    // 调用FastAPI的/api/query-job-skills接口
    const response = await axios.post(
      `${KG_DB_SERVICE_URL}/api/query-job-skills`,
      { job_title: jobTitle }, // FastAPI接收的参数名是job_title
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    
    // 调用大模型解析岗位技能（补充语义化描述）
    let skillAnalysis = { suggestion: '暂无技能提升建议' };
    try {
      const skillList = response.data?.skills?.map(skill => skill.skill) || [];
      if (skillList.length > 0) {
        skillAnalysis = await llmService.generateSkillAnalysis(jobTitle, skillList);
      }
    } catch (llmError) {
      console.error('豆包大模型岗位技能分析失败:', llmError.message);
    }

    // 严格对齐文档返回格式
    success(res, {
      success: true,
      jobTitle: jobTitle,
      skills: response.data?.skills || []
    });
  } catch (error) {
    console.error('调用知识图谱服务失败（queryJobSkills）:', error.response?.status, error.response?.data || error.message);
    fail(res, '知识图谱服务暂不可用，已降级处理', 503, { 
      success: false,
      jobTitle: req.body.jobTitle || '',
      skills: [],
      fallback: true 
    });
  }
};

// 获取所有图谱职位（适配FastAPI的/api/jobs接口 + 对齐文档返回格式）
exports.getAllKgJobs = async (req, res) => {
  try {
    const response = await axios.get(
      `${KG_DB_SERVICE_URL}/api/jobs`,
      { timeout: 15000 }
    );

    // 格式化数据为文档要求的结构：[{id, title}]
    const formatJobs = (response.data?.jobs || []).map((job, index) => ({
      id: job.id || String(index + 1), // 确保id存在
      title: job.title || job.job_name || ''
    })).filter(job => job.title); // 过滤空标题

    // 严格对齐文档返回格式
    success(res, { 
      success: true,
      jobs: formatJobs
    });
  } catch (error) {
    console.error('调用知识图谱服务失败（getAllKgJobs）:', error.response?.status, error.response?.data || error.message);
    fail(res, '知识图谱服务暂不可用，已降级处理', 503, { 
      success: false,
      jobs: [],
      fallback: true 
    });
  }
};

// 技能匹配岗位（适配FastAPI的/api/query-skills-to-jobs接口 + 对齐文档返回格式）
exports.querySkillsToJobs = async (req, res) => {
  try {
    let { skills, skill_levels = {} } = req.body;
    // 严格入参校验（对齐文档）
    if (!skills || !Array.isArray(skills) || skills.length === 0 || skills.every(s => !s.trim())) {
      return fail(res, '技能列表不能为空（需包含有效技能）', 400, {
        success: false,
        specific_jobs: [],
        jobs: []
      });
    }

    // -------------------------- 豆包大模型语义解析 --------------------------
    let parsedSkills = skills.map(s => s.trim()).filter(Boolean);
    let llmEnabled = true;
    try {
      // 调用豆包解析（合并同义词/去冗余）
      parsedSkills = await llmService.parseUserSkills(parsedSkills.join(','));
      console.log('豆包解析后的核心技能:', parsedSkills);
    } catch (llmError) {
      console.error('豆包大模型技能解析失败:', llmError.message);
      llmEnabled = false;
      parsedSkills = [...new Set(parsedSkills)]; // 仅去重
    }

    // -------------------------- 调用FastAPI的技能匹配接口 --------------------------
    const kgResponse = await axios.post(
      `${KG_DB_SERVICE_URL}/api/query-skills-to-jobs`,
      { skills: parsedSkills, skill_levels }, // 透传文档要求的参数
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    const kgData = kgResponse.data;

    // -------------------------- 合并MySQL岗位数据 --------------------------
    const specific_jobs = [];
    let mysqlEnabled = true;

    try {
      if (kgData.success && kgData.jobs && kgData.jobs.length > 0) {
        const categories = kgData.jobs.map(job => job.title || job.job_name || '');
        const jobMap = await queryJobsByCategory(categories.filter(Boolean));
        
        // 遍历匹配的岗位，补充MySQL数据（对齐文档格式）
        for (const categoryJob of kgData.jobs) {
          const categoryName = categoryJob.title || categoryJob.job_name || '';
          const mysqlJobs = jobMap[categoryName] || [];
          
          mysqlJobs.forEach(job => {
            specific_jobs.push({
              id: job.id || `job_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              title: job.title || '',
              company: job.company || '',
              city: job.city || '',
              salary: job.salary || '',
              match_percentage: categoryJob.match_percentage || categoryJob.score || 0,
              category: categoryName || '未知分类'
            });
          });
        }
      }
    } catch (mysqlError) {
      console.error('MySQL查询具体岗位失败:', mysqlError.message);
      mysqlEnabled = false;
    }

    // 格式化kg jobs（对齐文档格式）
    const jobs = (kgData.jobs || []).map((job, index) => ({
      id: job.id || `kg_${index + 1}`,
      title: job.title || '',
      match_percentage: job.match_percentage || job.score || 0
    }));

    // -------------------------- 返回最终结果（严格对齐文档） --------------------------
    success(res, {
      success: true,
      specific_jobs: specific_jobs,
      jobs: jobs
    });
  } catch (error) {
    console.error('调用知识图谱服务失败（querySkillsToJobs）:', error.response?.status, error.response?.data || error.message);
    fail(res, '技能匹配服务暂不可用，已降级处理', 503, { 
      success: false,
      specific_jobs: [],
      jobs: [],
      fallback: true, 
      error: error.message 
    });
  }
};

// 获取所有技能（适配FastAPI的/api/all-skills接口 + 严格对齐文档返回格式）
exports.getAllSkills = async (req, res) => {
  try {
    // 调用FastAPI的/api/all-skills接口（核心适配）
    const url = `${KG_DB_SERVICE_URL}/api/all-skills`;
    console.log('调用知识图谱接口:', url);
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('接口返回数据:', JSON.stringify(response.data, null, 2));

    const allSkillsData = response.data;
    // 放宽校验：仅判断数据是否为空，不强制要求success字段
    if (!allSkillsData || (!allSkillsData.hard_skills && !allSkillsData.soft_skills)) {
      throw new Error('获取技能列表为空');
    }

    // 严格对齐文档返回格式
    success(res, {
      success: true,
      hard_skills: allSkillsData.hard_skills || [], // 数组格式
      soft_skills: allSkillsData.soft_skills || []  // 数组格式
    });
  } catch (error) {
    console.error('调用知识图谱服务失败（getAllSkills）:', error.response?.status, error.response?.data || error.message);
    fail(res, '知识图谱服务暂不可用，已降级处理', 503, {
      success: false,
      hard_skills: [],
      soft_skills: []
    });
  }
};

// 健康检查（严格对齐文档返回格式：{status: "ok", timestamp: 毫秒数}）
exports.healthCheck = async (req, res) => {
  try {
    // 检查FastAPI知识图谱服务（可选，不影响文档格式）
    await axios.get(`${KG_DB_SERVICE_URL}/api/health`, { timeout: 5000 });

    // 严格按文档返回格式
    success(res, {
      status: "ok",
      timestamp: Date.now() // 毫秒级时间戳
    });
  } catch (error) {
    console.error('知识图谱服务健康检查失败:', error.message);
    // 失败时仍按文档格式返回（status为error）
    fail(res, '服务健康检查失败', 500, {
      status: "error",
      timestamp: Date.now()
    });
  }
};

// 获取知识图谱中的Page节点（对齐接口文档）
exports.getKgPages = async (req, res) => {
  try {
    // 调用FastAPI的/api/pages接口（需FastAPI实现对应接口）
    const response = await axios.get(`${KG_DB_SERVICE_URL}/api/pages`, { timeout: 15000 });
    // 严格对齐文档返回格式
    success(res, {
      success: true,
      pages: response.data?.pages || []
    });
  } catch (error) {
    console.error('调用知识图谱Page接口失败:', error.message);
    fail(res, '知识图谱Page列表加载失败', 503, {
      success: false,
      pages: []
    });
  }
};

// 图谱可视化接口（转发到FastAPI）- 完整修复版
exports.getGraphVisualization = async (req, res) => {
  try {
    // 修复1：接收前端传递的page_id参数（与前端传参名一致）
    const { page_id } = req.body;
    
    // 修复2：严格的参数校验
    // 校验1：参数不能为空
    if (!page_id || page_id.trim() === '') {
      return fail(res, '岗位大类ID不能为空', 400, {
        success: false,
        nodes: [],
        edges: []
      });
    }
    // 校验2：必须是数字字符串（匹配FastAPI的toInteger要求）
    if (isNaN(Number(page_id.trim()))) {
      return fail(res, '岗位大类ID必须是数字格式', 400, {
        success: false,
        nodes: [],
        edges: []
      });
    }

    // 修复3：调用FastAPI的图谱接口，传递正确的page_id
    const response = await axios.post(
      `${KG_DB_SERVICE_URL}/api/graph-visualization`,
      { page_id: page_id.trim() }, // 传递清洗后的数字字符串
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000 // 超时处理
      }
    );

    // 修复4：增加响应数据校验
    if (!response.data) {
      throw new Error('图谱服务返回空数据');
    }

    // 适配前端数据格式（nodes/edges）
    success(res, {
      success: true,
      nodes: response.data?.nodes || [],
      edges: response.data?.edges || []
    });
  } catch (error) {
    // 修复5：完善错误日志，便于调试
    console.error('图谱可视化接口失败:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // 返回标准化错误响应
    fail(res, '图谱加载失败', 503, {
      success: false,
      nodes: [],
      edges: [],
      error: error.message || '未知错误'
    });
  }
};