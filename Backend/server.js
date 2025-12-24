// server.js（优化后入口）
const express = require('express');
const cors = require('cors');
const { PORT, CORS_OPTIONS } = require('./config/app');
const router = require('./routes/index');
const { getMysqlPool } = require('./services/mysqlService');

// 初始化应用
const app = express();

// 中间件
app.use(cors(CORS_OPTIONS)); // 跨域
app.use(express.json()); // JSON解析

// 挂载路由
app.use('/api', router);

// 初始化MySQL连接池
(async () => {
  try {
    const mysqlPool = await getMysqlPool();
    app.set('mysqlPool', mysqlPool); // 挂载到app供全局使用
  } catch (error) {
    console.warn('⚠️ MySQL连接池初始化失败，岗位相关功能将受限');
  }

  // 启动服务器
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 就业匹配平台后端服务器启动成功（优化版）');
    console.log('='.repeat(60));
    console.log(`📡 服务器地址: http://localhost:${PORT}`);
    console.log(`📚 API文档: http://localhost:${PORT}/api`);
    console.log(`🔗 图谱服务: ${require('./config/db').KG_DB_SERVICE_URL}`);
    console.log('='.repeat(60));
  });
})();

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : ''
  });
});