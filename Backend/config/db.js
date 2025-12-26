// config/db.js
module.exports = {
  // MySQL配置
  MYSQL_CONFIG: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'job_matching',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  // 知识图谱服务地址
  KG_DB_SERVICE_URL: process.env.KG_DB_SERVICE_URL || 'http://localhost:5000'
};