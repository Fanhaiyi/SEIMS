// services/mysqlService.js
const { MYSQL_CONFIG } = require('../config/db');
const mysql = require('mysql2/promise');

// 创建MySQL连接池（单例）
let mysqlPool = null;
async function getMysqlPool() {
  if (!mysqlPool) {
    try {
      mysqlPool = mysql.createPool(MYSQL_CONFIG);
      // 测试连接
      const [rows] = await mysqlPool.execute('SELECT 1');
      console.log('✅ MySQL连接池初始化成功');
    } catch (error) {
      console.error('❌ MySQL连接池创建失败:', error.message);
      throw new Error('数据库连接失败');
    }
  }
  return mysqlPool;
}

// 查询所有岗位
async function queryAllJobs() {
  const pool = await getMysqlPool();
  const [rows] = await pool.execute(
    `SELECT id, title, company, city, description, 
            min_salary, max_salary, requirements, benefits,
            education, job_link, company_info, category
     FROM jobs 
     WHERE title IS NOT NULL AND TRIM(title) != ''
       AND description IS NOT NULL AND LENGTH(TRIM(description)) > 50
       AND company IS NOT NULL AND TRIM(company) != ''
     ORDER BY created_at DESC`
  );

  // 格式化数据
  return rows.map(row => ({
    id: `mysql_${row.id}`,
    title: row.title,
    company: row.company || '',
    city: row.city || '',
    desc: row.description || '',
    min_salary: row.min_salary,
    max_salary: row.max_salary,
    salary: row.min_salary && row.max_salary 
      ? `${row.min_salary}-${row.max_salary}K/月`
      : row.min_salary ? `${row.min_salary}K/月以上` : '面议',
    requirements: row.requirements || '',
    benefits: row.benefits || '',
    education: row.education || '',
    job_link: row.job_link || '',
    company_info: row.company_info || '',
    category: row.category || '',
    skills: {}
  }));
}

// 查询单个岗位
async function queryJobById(jobId) {
  if (!jobId.startsWith('mysql_')) return null;
  
  const id = parseInt(jobId.replace('mysql_', ''));
  const pool = await getMysqlPool();
  const [rows] = await pool.execute(
    `SELECT id, title, company, city, description, 
            min_salary, max_salary, requirements, benefits,
            education, job_link, company_info, category
     FROM jobs WHERE id = ?`,
    [id]
  );

  if (rows.length === 0) return null;
  
  const row = rows[0];
  return {
    id: `mysql_${row.id}`,
    title: row.title,
    company: row.company || '',
    city: row.city || '',
    desc: row.description || '',
    description: row.description || '',
    min_salary: row.min_salary,
    max_salary: row.max_salary,
    salary: row.min_salary && row.max_salary 
      ? `${row.min_salary}-${row.max_salary}K/月`
      : row.min_salary ? `${row.min_salary}K/月以上` : '面议',
    requirements: row.requirements || '',
    benefits: row.benefits || '',
    education: row.education || '',
    job_link: row.job_link || '',
    company_info: row.company_info || '',
    category: row.category || '',
    skills: {}
  };
}

// 按分类查询岗位
async function queryJobsByCategory(categories) {
  if (!categories || categories.length === 0) return [];
  
  const pool = await getMysqlPool();
  const placeholders = categories.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, title, company, city, description, 
            min_salary, max_salary, requirements, benefits,
            education, job_link, company_info, category
     FROM jobs 
     WHERE category IN (${placeholders})
       AND title IS NOT NULL AND TRIM(title) != ''
       AND description IS NOT NULL AND LENGTH(TRIM(description)) > 50
       AND company IS NOT NULL AND TRIM(company) != ''
     ORDER BY category, created_at DESC`,
    categories
  );

  // 格式化并分组
  const categoryJobsMap = {};
  rows.forEach(row => {
    const category = row.category || '其他';
    if (!categoryJobsMap[category]) categoryJobsMap[category] = [];
    categoryJobsMap[category].push({
      id: `mysql_${row.id}`,
      title: row.title,
      company: row.company || '',
      city: row.city || '',
      desc: row.description || '',
      description: row.description || '',
      min_salary: row.min_salary,
      max_salary: row.max_salary,
      salary: row.min_salary && row.max_salary 
        ? `${row.min_salary}-${row.max_salary}K/月`
        : row.min_salary ? `${row.min_salary}K/月以上` : '面议',
      requirements: row.requirements || '',
      benefits: row.benefits || '',
      education: row.education || '',
      job_link: row.job_link || '',
      company_info: row.company_info || '',
      category: category,
      skills: {}
    });
  });

  return categoryJobsMap;
}

module.exports = { getMysqlPool, queryAllJobs, queryJobById, queryJobsByCategory };