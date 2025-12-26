const axios = require('axios');
require('dotenv').config();

// 🔥 配置修正：替换为你控制台的真实API Key + 补全地域头（关键）
const DOUBAO_CONFIG = {
  API_KEY: process.env.ARK_API_KEY || '', 
  BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  MODEL: 'doubao-1-5-pro-32k-250115',
  TIMEOUT: 15000,
  RETRY_TIMES: 2, // 增加重试次数
  REGION: 'cn-beijing' // 补全地域头，避免401
};

// 核心：基础调用函数（增加重试 + 地域头）
async function callLLM(prompt, systemPrompt = '你是专业的就业匹配专家，输出简洁准确') {
  let retryCount = 0;
  while (retryCount < DOUBAO_CONFIG.RETRY_TIMES) {
    try {
      const response = await axios.post(
        DOUBAO_CONFIG.BASE_URL,
        {
          model: DOUBAO_CONFIG.MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          enable_thinking: true
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DOUBAO_CONFIG.API_KEY}`,
            'X-Volc-Region': DOUBAO_CONFIG.REGION // 补全地域头
          },
          timeout: DOUBAO_CONFIG.TIMEOUT
        }
      );

      const choices = response.data?.choices || [];
      const message = choices[0]?.message || {};
      if (message.reasoning_content) {
        console.log('豆包大模型思维链:', message.reasoning_content);
      }
      const result = message.content?.trim() || '';
      
      if (!result) throw new Error('豆包大模型返回空结果');
      return result;
    } catch (error) {
      retryCount++;
      console.error(`豆包大模型调用失败（第${retryCount}次重试）:`, {
        status: error.response?.status,
        errorMsg: error.response?.data?.error?.message || error.message,
        authHeader: `Bearer ${DOUBAO_CONFIG.API_KEY.substring(0, 10)}...`
      });
      if (retryCount >= DOUBAO_CONFIG.RETRY_TIMES) {
        throw error; // 重试耗尽，抛错
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // 重试间隔
    }
  }
}

// 🔥 补全：解析用户技能（合并同义词/去冗余）
async function parseUserSkills(userInput) {
  const prompt = `
    请将以下技能列表去重、合并同义词，仅返回核心技能的数组（JSON格式，无其他文字）：
    输入：${userInput}
    要求：
    1. 同义词合并（如"Python编程"和"Python"合并为"Python"）；
    2. 去除无意义词汇（如"熟练掌握"）；
    3. 仅返回JSON数组，示例：["Python", "Java", "MySQL"]
  `;
  try {
    const result = await callLLM(prompt);
    // 容错：解析JSON失败则返回原始去重列表
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : userInput.split(',').map(s => s.trim()).filter(Boolean);
  } catch (error) {
    console.error('解析用户技能失败:', error.message);
    // 降级：仅去重
    return [...new Set(userInput.split(',').map(s => s.trim()).filter(Boolean))];
  }
}

// 🔥 补全：生成技能分析（含提升建议）
async function generateSkillAnalysis(jobTitle, skillList) {
  const prompt = `
    分析${jobTitle}岗位的核心技能：${skillList.join(',')}
    要求：
    1. 输出JSON格式，包含"core_skills"（核心技能数组）、"suggestion"（提升建议）；
    2. 建议简洁，不超过100字；
    3. 仅返回JSON，无其他文字。
  `;
  try {
    const result = await callLLM(prompt);
    return JSON.parse(result);
  } catch (error) {
    console.error('生成技能分析失败:', error.message);
    // 降级：返回默认值
    return {
      core_skills: skillList,
      suggestion: '暂无技能提升建议'
    };
  }
}

// 🔥 补全：技能分类（硬技能/软技能）
async function classifySkills(allSkills) {
  const prompt = `
    将以下技能分为硬技能（hard_skills）和软技能（soft_skills），返回JSON格式：
    技能列表：${allSkills.join(',')}
    要求：仅返回JSON，示例：{"hard_skills":["Python"],"soft_skills":["沟通"]}
  `;
  try {
    const result = await callLLM(prompt);
    return JSON.parse(result);
  } catch (error) {
    console.error('技能分类失败:', error.message);
    // 降级：全部归为硬技能
    return { hard_skills: allSkills, soft_skills: [] };
  }
}

// 🔥 补全：生成匹配报告
async function generateMatchReport(userSkills, matchResult) {
  const prompt = `
    根据用户技能${userSkills.join(',')}和岗位匹配结果${JSON.stringify(matchResult)}，生成简洁的匹配报告（不超过200字），仅返回文字内容。
  `;
  try {
    return await callLLM(prompt);
  } catch (error) {
    console.error('生成匹配报告失败:', error.message);
    return '暂无匹配报告（服务暂不可用）';
  }
}

// 🔥 补全：健康检查
async function healthCheck() {
  try {
    await axios.post(
      DOUBAO_CONFIG.BASE_URL,
      {
        model: DOUBAO_CONFIG.MODEL,
        messages: [{ role: 'user', content: '健康检查' }],
        max_tokens: 10
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_CONFIG.API_KEY}`,
          'X-Volc-Region': DOUBAO_CONFIG.REGION
        },
        timeout: 5000
      }
    );
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

module.exports = {
  callLLM,
  parseUserSkills,
  generateSkillAnalysis,
  classifySkills,
  generateMatchReport,
  healthCheck
};