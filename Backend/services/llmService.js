const axios = require('axios');
require('dotenv').config();

// 火山方舟-豆包大模型配置（从火山方舟平台获取）
const DOUBAO_CONFIG = {
  API_KEY: process.env.ARK_API_KEY || '替换为火山方舟的API Key', // 必换
  BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', // 官方HTTP地址
  MODEL: 'doubao-1-5-pro-32k-250115', // 与Python示例一致的模型名
  TIMEOUT: 15000,
  RETRY_TIMES: 1
};

// 核心：HTTP调用火山方舟-豆包大模型（替代SDK）
async function callLLM(prompt, systemPrompt = '你是专业的就业匹配专家，输出简洁准确') {
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
        // 可选：开启深度思考（与Python示例一致）
        enable_thinking: true 
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_CONFIG.API_KEY}` // 火山方舟鉴权方式
        },
        timeout: DOUBAO_CONFIG.TIMEOUT
      }
    );

    // 解析响应（兼容深度思考返回格式）
    const choices = response.data?.choices || [];
    const message = choices[0]?.message || {};
    // 打印思维链（与Python示例一致）
    if (message.reasoning_content) {
      console.log('豆包大模型思维链:', message.reasoning_content);
    }
    const result = message.content?.trim() || '';
    
    if (!result) throw new Error('豆包大模型返回空结果');
    return result;
  } catch (error) {
    console.error('豆包大模型调用失败:', {
      status: error.response?.status,
      errorMsg: error.response?.data?.error?.message || error.message,
      requestUrl: DOUBAO_CONFIG.BASE_URL
    });
    throw error;
  }
}

// 以下保持原有场景逻辑（仅替换callLLM实现）
async function parseUserSkills(userInput) {
  const prompt = `
    请严格按照以下要求处理用户输入的技能文本：
    1. 提取核心职场技能，合并同义词（如"Python开发"→"Python"、"沟通能力"→"沟通"）；
    2. 过滤无关内容（如"我想找工作"、"薪资15k"）；
    3. 去重后返回JSON数组，仅返回数组，无任何其他文字；
    用户输入：${userInput}
  `;

  try {
    const result = await callLLM(prompt, '仅返回JSON数组，无其他文字');
    const cleanResult = result.replace(/[\n\t]/g, '');
    return JSON.parse(cleanResult);
  } catch (error) {
    console.error('技能解析失败，降级处理:', error.message);
    return userInput.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
  }
}

async function generateSkillAnalysis(jobTitle, skillList) {
  const prompt = `
    针对${jobTitle}岗位的核心技能${JSON.stringify(skillList)}，给出3条简短的技能提升建议：
    1. 每条不超过20字，口语化；
    2. 返回JSON：{"suggestion":"建议1；建议2；建议3"}；
    3. 仅返回JSON，无其他文字。
  `;

  try {
    const result = await callLLM(prompt, '仅返回JSON，无其他文字');
    const cleanResult = result.replace(/[\n\t]/g, '');
    return JSON.parse(cleanResult);
  } catch (error) {
    console.error('岗位技能分析失败:', error.message);
    return { suggestion: '暂无技能提升建议' };
  }
}

async function classifySkills(allSkills) {
  const prompt = `
    将技能列表分为硬技能/软技能，返回JSON：{"hard":["Python"],"soft":["沟通"]}，仅返回JSON：
    ${JSON.stringify(allSkills)}
  `;

  try {
    const result = await callLLM(prompt, '仅返回JSON，无其他文字');
    const cleanResult = result.replace(/[\n\t]/g, '');
    return JSON.parse(cleanResult);
  } catch (error) {
    console.error('技能分类失败，降级处理:', error.message);
    const hardKeywords = ['python', 'java', 'sql', '前端', '后端'];
    return {
      hard: allSkills.filter(s => hardKeywords.some(k => s.toLowerCase().includes(k))),
      soft: allSkills.filter(s => !hardKeywords.some(k => s.toLowerCase().includes(k)))
    };
  }
}

async function generateMatchReport(userSkills, matchResult) {
  const prompt = `
    生成100字以内的匹配度分析报告（口语化、有建议）：
    用户技能：${JSON.stringify(userSkills)}
    匹配岗位：${matchResult.job_name}（匹配度${matchResult.match_percentage}%）
    匹配技能：${JSON.stringify(matchResult.matched_skills?.map(s => s.skill) || [])}
    未匹配技能：${JSON.stringify(matchResult.unmatched_skills || [])}
  `;

  try {
    return await callLLM(prompt);
  } catch (error) {
    console.error('匹配报告生成失败:', error.message);
    return `你的技能与${matchResult.job_name}匹配度${matchResult.match_percentage}%，建议补充核心技能。`;
  }
}

async function healthCheck() {
  const testPrompt = '健康检查，仅返回"ok"一个单词';
  const result = await callLLM(testPrompt, '仅返回"ok"，无其他文字');
  if (result !== 'ok') throw new Error('大模型响应异常');
  return 'ok';
}

module.exports = {
  callLLM,
  parseUserSkills,
  generateSkillAnalysis,
  classifySkills,
  generateMatchReport,
  healthCheck
};