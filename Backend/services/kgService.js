// services/kgService.js
const { KG_DB_SERVICE_URL } = require('../config/db');

// 查询职位所需技能
async function queryJobSkills(jobTitle) {
  if (!jobTitle || !jobTitle.trim()) {
    throw new Error('请提供职位名称');
  }

  const response = await fetch(`${KG_DB_SERVICE_URL}/api/query-job-skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_title: jobTitle.trim() }),
    timeout: 10000
  });

  if (!response.ok) {
    throw new Error('数据库服务暂时不可用，请检查图谱服务是否运行');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || '查询失败');
  }

  // 格式化技能数据
  let skills = [];
  if (data.skills && Array.isArray(data.skills)) {
    skills = data.skills.map(item => {
      if (typeof item === 'string') {
        return { skill: item, level: 3 };
      }
      if (typeof item === 'object' && item.skill) {
        return {
          skill: item.skill,
          level: typeof item.level === 'number' ? item.level : 3,
          category: item.category || ''
        };
      }
      return item;
    });
  }

  return {
    jobTitle: jobTitle.trim(),
    skills,
    source: 'knowledge_graph'
  };
}

// 获取所有职位（知识图谱）
async function getAllKgJobs() {
  try {
    // 先尝试/api/jobs
    let response = await fetch(`${KG_DB_SERVICE_URL}/api/jobs`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    let data = await response.json();
    if (response.ok && data.success && data.jobs && Array.isArray(data.jobs)) {
      return data.jobs;
    }

    // 兼容旧版本/api/domains
    response = await fetch(`${KG_DB_SERVICE_URL}/api/domains`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (!response.ok) return [];
    data = await response.json();
    return data.success && data.domains && Array.isArray(data.domains) ? data.domains : [];
  } catch (error) {
    console.error('获取图谱职位失败:', error.message);
    return [];
  }
}

// 技能匹配岗位
async function querySkillsToJobs(skills) {
  if (!skills || (Array.isArray(skills) && skills.length === 0) || (typeof skills === 'string' && !skills.trim())) {
    throw new Error('请提供至少一个技能');
  }

  const response = await fetch(`${KG_DB_SERVICE_URL}/api/query-skills-to-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skills }),
    timeout: 10000
  });

  if (!response.ok) {
    throw new Error('数据库服务暂时不可用，请检查图谱服务是否运行');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || '查询失败');
  }

  return data;
}

// 获取所有技能（分硬/软）
async function getAllSkills() {
  const response = await fetch(`${KG_DB_SERVICE_URL}/api/all-skills`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error('数据库服务暂时不可用');
  }

  return await response.json();
}

// 健康检查
async function healthCheck() {
  try {
    const response = await fetch(`${KG_DB_SERVICE_URL}/api/health`, {
      method: 'GET',
      timeout: 3000
    });
    return response.ok ? 'available' : 'unavailable';
  } catch (error) {
    return 'unavailable';
  }
}

module.exports = {
  queryJobSkills,
  getAllKgJobs,
  querySkillsToJobs,
  getAllSkills,
  healthCheck
};