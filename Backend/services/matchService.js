const neo4j = require('neo4j-driver');

/**
 * 规范化技能名称（对应Python的_normalize_skill_name）
 * @param {string} name 原始技能名
 * @returns {string} 归一化后的技能名
 */
function normalizeSkillName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase();
}

/**
 * 能力→岗位匹配核心算法（对应Python的match_skills_to_jobs）
 * @param {neo4j.Driver} neo4jDriver Neo4j驱动实例（全局初始化）
 * @param {string[]} skills 用户输入的技能列表
 * @returns {Promise<{jobs: Array, inputSkillsCount: number, normalizedInputSkills: string[]}>}
 */
async function matchSkillsToJobs(neo4jDriver, skills) {
  // 边界处理：空技能直接返回
  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    return { jobs: [], inputSkillsCount: 0, normalizedInputSkills: [] };
  }

  // 1. 归一化用户输入技能
  const normalizedInput = skills
    .map(skill => normalizeSkillName(skill))
    .filter(skill => skill); // 过滤空字符串
  const inputSkillsCount = normalizedInput.length;
  if (inputSkillsCount === 0) {
    return { jobs: [], inputSkillsCount: 0, normalizedInputSkills: [] };
  }

  // 2. 从Neo4j读取岗位-技能图谱数据（Cypher语句与Python一致）
  const cypher = `
    MATCH (d:领域)-[:包含]->(c:一级分类)-[r:包含]->(s:二级分类)
    RETURN d.name as job_name,
           collect({
               skill: s.name,
               weight: coalesce(r.weight, 0.0),
               category: c.name
           }) as skills
  `;

  // 执行Cypher查询（Neo4j驱动需异步调用）
  const session = neo4jDriver.session();
  let records;
  try {
    const result = await session.run(cypher);
    records = result.records.map(record => record.toObject()); // 转为JS对象
  } catch (err) {
    console.error('Neo4j查询失败：', err);
    return { jobs: [], inputSkillsCount, normalizedInputSkills };
  } finally {
    await session.close(); // 必须关闭session
  }

  // 3. 遍历岗位，计算匹配度
  const jobs = [];
  for (const row of records) {
    const jobName = row.job_name;
    const allSkills = row.skills || [];

    // 计算该岗位所有技能的权重总和（归一化分母）
    let totalWeightAll = 0.0;
    for (const info of allSkills) {
      const weight = parseFloat(info.weight || 0.0);
      if (!isNaN(weight)) {
        totalWeightAll += weight;
      }
    }
    if (totalWeightAll <= 0) continue; // 无有效权重，跳过

    // 匹配用户技能，计算匹配权重/分类统计
    const matchedSkills = [];
    let totalWeightMatched = 0.0;
    let hardCount = 0;
    let softCount = 0;

    for (const info of allSkills) {
      const skillName = info.skill;
      const normSkillName = normalizeSkillName(skillName);
      if (!normSkillName) continue;

      // 技能匹配：归一化后完全相同则匹配
      if (normalizedInput.includes(normSkillName)) {
        const weight = parseFloat(info.weight || 0.0);
        if (isNaN(weight) || weight <= 0) continue;

        // 累加匹配权重，统计硬/软实力
        totalWeightMatched += weight;
        const category = info.category || '';
        if (category === '硬实力') hardCount++;
        else if (category === '软实力') softCount++;

        // 记录匹配的技能详情
        matchedSkills.push({
          skill: skillName,
          weight: weight,
          category: category
        });
      }
    }

    // 无匹配技能，跳过该岗位
    const matchCount = matchedSkills.length;
    if (matchCount === 0) continue;

    // 计算最终匹配得分（四舍五入为整数）
    const matchPercentage = Math.round(100 * (totalWeightMatched / totalWeightAll));

    // 组装岗位匹配结果
    jobs.push({
      job_name: jobName,
      match_count: matchCount,
      match_percentage: matchPercentage,
      total_weight: totalWeightMatched,
      matched_skills: matchedSkills,
      hard_skills_count: hardCount,
      soft_skills_count: softCount
    });
  }

  // 4. 按匹配度降序排序（匹配度相同则按权重和降序）
  jobs.sort((a, b) => {
    if (b.match_percentage !== a.match_percentage) {
      return b.match_percentage - a.match_percentage;
    }
    return b.total_weight - a.total_weight;
  });

  // 返回结果（与Python结构对齐，适配现有后端）
  return {
    jobs,
    inputSkillsCount,
    normalizedInputSkills: skills // 保持原始输入（与Python返回一致）
  };
}

// 导出方法，供控制器调用
module.exports = {
  matchSkillsToJobs,
  normalizeSkillName
};