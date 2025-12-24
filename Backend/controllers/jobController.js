// controllers/jobController.js
const { queryAllJobs, queryJobById } = require('../services/mysqlService');
const { success, fail } = require('../utils/responseUtil');

// 获取所有岗位
exports.getAllJobs = async (req, res) => {
  try {
    let jobs = [];
    let source = 'mysql_not_configured';
    let message = 'MySQL未配置，请检查数据库连接';

    try {
      jobs = await queryAllJobs();
      source = 'mysql';
      message = '';
    } catch (mysqlError) {
      console.error('MySQL查询失败:', mysqlError.message);
      source = 'mysql_error';
      message = 'MySQL查询失败，请检查数据库连接和数据';
    }

    success(res, {
      jobs,
      source,
      total: jobs.length,
      message
    });
  } catch (error) {
    fail(res, error.message, 500);
  }
};

// 获取单个岗位
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await queryJobById(id);

    if (!job) {
      return fail(res, '岗位不存在', 404);
    }

    success(res, { job, source: 'mysql' });
  } catch (error) {
    fail(res, error.message, 500);
  }
};