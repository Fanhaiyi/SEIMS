const neo4j = require('neo4j-driver');

// Neo4j连接配置（替换为你的实际地址/账号/密码）
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '20041028';

// 创建全局Neo4j驱动实例（单例模式）
const neo4jDriver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

// 测试连接（可选）
neo4jDriver.verifyConnectivity()
  .then(() => console.log('Neo4j连接成功'))
  .catch(err => console.error('Neo4j连接失败：', err));

module.exports = neo4jDriver;