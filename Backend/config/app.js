// config/app.js
module.exports = {
  PORT: process.env.PORT || 3001,
  CORS_OPTIONS: {
    origin: '*', // 生产环境建议限定具体域名
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
  }
};