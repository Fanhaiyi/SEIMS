const { matchSkillsToJobs } = require('../services/matchService');
const neo4jDriver = require('../config/neo4j');

/**
 * 处理能力→岗位匹配的接口请求
 * @param {Request} req Express请求对象（req.body.skills 为用户输入的技能列表）
 * @param {Response} res Express响应对象
 */
async function handleSkillToJobMatch(req, res) {
  try {
    // 1. 获取用户输入的技能列表
    const { skills } = req.body;
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({
        code: 400,
        message: '参数错误：skills必须是数组',
        data: null
      });
    }

    // 2. 调用匹配算法
    const { jobs, inputSkillsCount, normalizedInputSkills } = await matchSkillsToJobs(neo4jDriver, skills);

    // 3. 返回结果（与现有后端结构保持一致）
    res.status(200).json({
      code: 200,
      message: '匹配成功',
      data: {
        jobs, // 匹配的岗位列表
        input_skills_count: inputSkillsCount,
        normalized_input_skills: normalizedInputSkills
      }
    });
  } catch (err) {
    console.error('技能匹配接口异常：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
}

module.exports = {
  handleSkillToJobMatch
};