/**
 * Node.js 后端服务器
 * 提供用户认证、资料管理和知识图谱API代理
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// 加载 Backend 目录下的 .env 文件（不依赖运行时工作目录）
require('dotenv').config({
    path: path.join(__dirname, '.env'),
});

// 简单调试输出（不打印真实密码，只看是否加载到）
console.log('ENV DEBUG -> MYSQL_PASSWORD set:', !!process.env.MYSQL_PASSWORD);
console.log('ENV DEBUG -> NEO4J_PASSWORD set:', !!process.env.NEO4J_PASSWORD);
const mysql = require('mysql2/promise'); // MySQL连接
const neo4j = require('neo4j-driver'); // Neo4j连接

const app = express();
const PORT = process.env.PORT || 3001; // 改为3001端口

// 中间件
app.use(cors()); // 允许跨域
app.use(express.json()); // 解析JSON

// 配置文件路径
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');

// 确保data目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// 辅助函数：读取JSON文件（兼容数组和对象格式）
function readJSONFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            // 如果是数组格式，转换为对象格式（使用email作为key）
            if (Array.isArray(parsed)) {
                const obj = {};
                parsed.forEach(user => {
                    if (user.email) {
                        obj[user.email] = user;
                    }
                });
                return obj;
            }
            return parsed;
        }
    } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
    }
    return defaultValue;
}

// 辅助函数：写入JSON文件（保持对象格式）
function writeJSONFile(filePath, data) {
    try {
        // 确保data是对象格式，不是数组
        const dataToWrite = typeof data === 'object' && !Array.isArray(data) ? data : {};
        fs.writeFileSync(filePath, JSON.stringify(dataToWrite, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error(`写入文件失败 ${filePath}:`, error.message);
        return false;
    }
}

// ==================== 用户认证API ====================

// 用户注册
app.post('/api/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: '请填写所有必填字段'
            });
        }
        
        const users = readJSONFile(USERS_FILE, {});
        
        // 检查用户是否已存在
        if (users[email]) {
            return res.status(400).json({
                success: false,
                message: '该邮箱已被注册'
            });
        }
        
        // 创建新用户
        const userId = `user_${Date.now()}`;
        users[email] = {
            id: userId,
            name,
            email,
            password, // 实际生产环境应该加密
            createdAt: new Date().toISOString()
        };
        
        writeJSONFile(USERS_FILE, users);
        
        res.json({
            success: true,
            message: '注册成功',
            user: {
                id: userId,
                name,
                email
            }
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
});

// 用户登录
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: '请提供邮箱和密码'
            });
        }
        
        const users = readJSONFile(USERS_FILE, {});
        const user = users[email];
        
        if (!user) {
            console.log(`用户不存在: ${email}`);
            return res.status(401).json({
                success: false,
                message: '邮箱或密码错误'
            });
        }
        
        // 检查密码是否匹配
        let passwordMatch = false;
        if (user.password) {
            // 如果是哈希密码（bcrypt格式，以$2a$开头）
            if (user.password.startsWith('$2a$')) {
                // 尝试使用bcrypt验证（如果已安装）
                try {
                    const bcrypt = require('bcrypt');
                    passwordMatch = bcrypt.compareSync(password, user.password);
                } catch (bcryptError) {
                    // 如果没有安装bcrypt，提示用户
                    console.error('bcrypt未安装，无法验证哈希密码');
                    return res.status(500).json({
                        success: false,
                        message: '服务器配置错误：需要安装bcrypt包来验证密码'
                    });
                }
            } else {
                // 明文密码直接比较
                passwordMatch = user.password === password;
            }
        }
        
        if (!passwordMatch) {
            console.log(`密码不匹配: ${email}`);
            return res.status(401).json({
                success: false,
                message: '邮箱或密码错误'
            });
        }
        
        res.json({
            success: true,
            message: '登录成功',
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误: ' + error.message
        });
    }
});

// ==================== 用户资料API ====================

// 获取用户资料
app.get('/api/profile/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const profiles = readJSONFile(PROFILES_FILE, {});
        
        const profile = profiles[userId] || null;
        
        res.json({
            success: true,
            profile
        });
    } catch (error) {
        console.error('获取资料错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
});

// 保存用户资料
app.post('/api/profile/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const profileData = req.body;
        
        const profiles = readJSONFile(PROFILES_FILE, {});
        
        // 更新或创建资料
        profiles[userId] = {
            ...profileData,
            userId,
            updatedAt: new Date().toISOString()
        };
        
        writeJSONFile(PROFILES_FILE, profiles);
        
        res.json({
            success: true,
            message: '资料保存成功',
            profile: profiles[userId]
        });
    } catch (error) {
        console.error('保存资料错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
});

// ==================== 知识图谱API集成 ====================

// 知识图谱数据库服务配置（直接连接图谱2数据库服务）
const KG_DB_SERVICE_URL = process.env.KG_DB_SERVICE_URL || 'http://localhost:5000';

// ==================== MySQL（job_matching）配置 ====================

const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    // 密码必须通过环境变量提供，避免在代码中写死
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'job_matching',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 创建MySQL连接池
let mysqlPool = null;
try {
    mysqlPool = mysql.createPool(MYSQL_CONFIG);
    console.log('✅ MySQL连接池创建成功');
} catch (error) {
    console.error('❌ MySQL连接池创建失败:', error.message);
    console.log('⚠️  岗位浏览功能将使用备用数据源');
}

// ==================== Neo4j 配置 ====================
// 默认连接到本机 Neo4j（bolt 协议），用户名通过环境变量提供
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
// 密码必须通过环境变量提供，避免在代码中写死
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

let neo4jDriver = null;
try {
  neo4jDriver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  console.log('✅ Neo4j 连接驱动创建成功');
} catch (error) {
  console.error('❌ Neo4j 连接驱动创建失败:', error.message);
  console.log('⚠️  与知识图谱相关的直接 Neo4j 查询将不可用');
}

/**
 * 查询职位所需的技能（直接调用图谱2数据库服务）
 */
app.post('/api/kg/query-job-skills', async (req, res) => {
    try {
        const { jobTitle } = req.body;
        
        if (!jobTitle || !jobTitle.trim()) {
            return res.status(400).json({
                success: false,
                message: '请提供职位名称'
            });
        }
        
        // 直接调用图谱2数据库服务
        const dbResponse = await fetch(`${KG_DB_SERVICE_URL}/api/query-job-skills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ job_title: jobTitle.trim() }),
            timeout: 10000
        });
        
        if (!dbResponse.ok) {
            return res.status(503).json({
                success: false,
                message: '数据库服务暂时不可用，请检查图谱2服务是否运行',
                fallback: true
            });
        }
        
        const dbData = await dbResponse.json();
        
        if (!dbData.success) {
            return res.status(400).json({
                success: false,
                message: dbData.message || '查询失败',
                fallback: true
            });
        }
        
        // 确保skills是数组格式，并保留category字段
        let skills = [];
        if (dbData.skills && Array.isArray(dbData.skills)) {
            skills = dbData.skills.map(item => {
                if (typeof item === 'string') {
                    return { skill: item, level: 3 };
                }
                if (typeof item === 'object' && item.skill) {
                    return {
                        skill: item.skill,
                        level: typeof item.level === 'number' ? item.level : 3,
                        category: item.category || '' // 保留category字段（硬实力/软实力）
                    };
                }
                return item;
            });
        }
        
        res.json({
            success: true,
            jobTitle: jobTitle.trim(),
            skills: skills,
            source: 'knowledge_graph'
        });
        
    } catch (error) {
        console.error('Database service query error:', error);
        res.status(503).json({
            success: false,
            message: '数据库服务连接失败',
            fallback: true,
            error: error.message
        });
    }
});

/**
 * 获取所有岗位列表（从MySQL数据库）
 * 注意：这个端点用于岗位浏览页面，只返回MySQL中的具体岗位，不返回Neo4j中的大类
 */
app.get('/api/jobs', async (req, res) => {
    try {
        // 只从MySQL获取具体岗位数据，不降级到Neo4j
        if (mysqlPool) {
            try {
                const [rows] = await mysqlPool.execute(
                    `SELECT id, title, company, city, description, 
                            min_salary, max_salary, requirements, benefits,
                            education, job_link, company_info, category
                     FROM jobs 
                     WHERE title IS NOT NULL 
                       AND title != '' 
                       AND TRIM(title) != ''
                       AND description IS NOT NULL 
                       AND description != '' 
                       AND LENGTH(TRIM(description)) > 50
                       AND company IS NOT NULL 
                       AND company != '' 
                       AND TRIM(company) != ''
                     ORDER BY created_at DESC`
                );
                
                // 转换数据格式以匹配前端需求
                const jobs = rows.map(row => ({
                    id: `mysql_${row.id}`, // 添加前缀以区分数据源
                    title: row.title,
                    company: row.company || '',
                    city: row.city || '',
                    desc: row.description || '',
                    min_salary: row.min_salary,
                    max_salary: row.max_salary,
                    salary: row.min_salary && row.max_salary 
                        ? `${row.min_salary}-${row.max_salary}K/月`
                        : row.min_salary 
                            ? `${row.min_salary}K/月以上`
                            : '面议',
                    requirements: row.requirements || '',
                    benefits: row.benefits || '',
                    education: row.education || '',
                    job_link: row.job_link || '',
                    company_info: row.company_info || '',
                    category: row.category || '',
                    skills: {} // MySQL中没有技能数据，技能数据从Neo4j获取
                }));
                
                return res.json({
                    success: true,
                    jobs: jobs,
                    source: 'mysql',
                    total: jobs.length
                });
            } catch (mysqlError) {
                console.error('MySQL查询错误:', mysqlError.message);
                // MySQL查询失败，返回空列表，不降级到Neo4j
                    return res.json({
                        success: true,
                    jobs: [],
                    source: 'mysql_error',
                    message: 'MySQL查询失败，请检查数据库连接和数据'
                    });
                }
        }
        
        // MySQL连接池未创建，返回空列表
        return res.json({
            success: true,
            jobs: [],
            source: 'mysql_not_configured',
            message: 'MySQL未配置，请检查数据库配置'
        });
        
    } catch (error) {
        console.error('获取岗位列表错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

/**
 * 获取单个岗位详情（从MySQL数据库）
 */
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const jobId = req.params.id;
        
        // 如果是MySQL的ID（格式：mysql_数字）
        if (jobId.startsWith('mysql_')) {
            const id = parseInt(jobId.replace('mysql_', ''));
            
            if (mysqlPool) {
                const [rows] = await mysqlPool.execute(
                    `SELECT id, title, company, city, description, 
                            min_salary, max_salary, requirements, benefits,
                            education, job_link, company_info, category
                     FROM jobs 
                     WHERE id = ?`,
                    [id]
                );
                
                if (rows.length > 0) {
                    const row = rows[0];
                    return res.json({
                        success: true,
                        job: {
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
                                : row.min_salary 
                                    ? `${row.min_salary}K/月以上`
                                    : '面议',
                            requirements: row.requirements || '',
                            benefits: row.benefits || '',
                            education: row.education || '',
                            job_link: row.job_link || '',
                            company_info: row.company_info || '',
                            category: row.category || '',
                            skills: {}
                        },
                        source: 'mysql'
                    });
                }
            }
        }
        
        return res.status(404).json({
            success: false,
            message: '岗位不存在'
        });
        
    } catch (error) {
        console.error('获取岗位详情错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

/**
 * 获取所有可用职位列表（从图谱2数据库）
 * 注意：这个端点用于知识图谱查询，保持原有功能不变
 */
app.get('/api/kg/jobs', async (req, res) => {
    try {
        // 优先尝试使用 /api/jobs 端点
        let dbResponse = await fetch(`${KG_DB_SERVICE_URL}/api/jobs`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 5000
        });
        
        let dbData;
        if (dbResponse.ok) {
            dbData = await dbResponse.json();
            if (dbData.success && dbData.jobs && Array.isArray(dbData.jobs)) {
                return res.json({
                    success: true,
                    jobs: dbData.jobs,
                    source: 'knowledge_graph'
                });
            }
        }
        
        // 如果 /api/jobs 不可用，尝试使用 /api/domains 端点（兼容旧版本）
        dbResponse = await fetch(`${KG_DB_SERVICE_URL}/api/domains`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 5000
        });
        
        if (!dbResponse.ok) {
            return res.status(503).json({
                success: false,
                message: '数据库服务暂时不可用',
                fallback: true
            });
        }
        
        dbData = await dbResponse.json();
        
        if (dbData.success && dbData.domains && Array.isArray(dbData.domains)) {
            res.json({
                success: true,
                jobs: dbData.domains,
                source: 'knowledge_graph'
            });
        } else {
        res.json({
            success: true,
                jobs: [],
            source: 'knowledge_graph'
        });
        }
        
    } catch (error) {
        console.error('Database service jobs list error:', error);
        res.status(503).json({
            success: false,
            message: '数据库服务连接失败',
            fallback: true,
            error: error.message
        });
    }
});

/**
 * 根据技能列表查询匹配的岗位（技能->岗位）
 * 先查询知识图谱获取岗位大类，然后从MySQL查询具体岗位
 */
app.post('/api/kg/query-skills-to-jobs', async (req, res) => {
    try {
        const { skills } = req.body;
        
        if (!skills || (Array.isArray(skills) && skills.length === 0) || (typeof skills === 'string' && !skills.trim())) {
            return res.status(400).json({
                success: false,
                message: '请提供至少一个技能'
            });
        }
        
        // 直接调用图谱2数据库服务获取岗位大类
        const dbResponse = await fetch(`${KG_DB_SERVICE_URL}/api/query-skills-to-jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ skills }),
            timeout: 10000
        });
        
        if (!dbResponse.ok) {
            return res.status(503).json({
                success: false,
                message: '数据库服务暂时不可用，请检查图谱2服务是否运行',
                fallback: true
            });
        }
        
        const dbData = await dbResponse.json();
        
        if (!dbData.success) {
            return res.status(400).json({
                success: false,
                message: dbData.message || '查询失败',
                fallback: true
            });
        }
        
        // 从MySQL查询具体岗位
        const categoryJobsMap = {}; // 按category分组的具体岗位
        const allJobs = []; // 所有具体岗位列表
        
        if (mysqlPool && dbData.jobs && dbData.jobs.length > 0) {
            try {
                // 获取所有岗位大类名称
                const categories = dbData.jobs.map(job => job.job_name);
                
                if (categories.length > 0) {
                    // 从MySQL查询这些大类下的具体岗位
                    const placeholders = categories.map(() => '?').join(',');
                    const [rows] = await mysqlPool.execute(
                        `SELECT id, title, company, city, description, 
                                min_salary, max_salary, requirements, benefits,
                                education, job_link, company_info, category
                         FROM jobs 
                         WHERE category IN (${placeholders})
                           AND title IS NOT NULL 
                           AND title != '' 
                           AND TRIM(title) != ''
                           AND description IS NOT NULL 
                           AND description != '' 
                           AND LENGTH(TRIM(description)) > 50
                           AND company IS NOT NULL 
                           AND company != '' 
                           AND TRIM(company) != ''
                         ORDER BY category, created_at DESC`,
                        categories
                    );
                    
                    // 按category分组
                    rows.forEach(row => {
                        const category = row.category || '其他';
                        if (!categoryJobsMap[category]) {
                            categoryJobsMap[category] = [];
                        }
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
                                : row.min_salary 
                                    ? `${row.min_salary}K/月以上`
                                    : '面议',
                            requirements: row.requirements || '',
                            benefits: row.benefits || '',
                            education: row.education || '',
                            job_link: row.job_link || '',
                            company_info: row.company_info || '',
                            category: category,
                            skills: {}
                        });
                    });
                    
                    // 为每个岗位大类添加对应的具体岗位列表
                    dbData.jobs.forEach(categoryJob => {
                        const categoryName = categoryJob.job_name;
                        const specificJobs = categoryJobsMap[categoryName] || [];
                        categoryJob.specific_jobs = specificJobs;
                        categoryJob.specific_jobs_count = specificJobs.length;
                        
                        // 将所有具体岗位添加到总列表
                        specificJobs.forEach(job => {
                            // 继承大类的匹配信息
                            allJobs.push({
                                ...job,
                                match_percentage: categoryJob.match_percentage,
                                match_count: categoryJob.match_count,
                                matched_skills: categoryJob.matched_skills,
                                total_weight: categoryJob.total_weight,
                                hard_skills_count: categoryJob.hard_skills_count,
                                soft_skills_count: categoryJob.soft_skills_count,
                                category_info: {
                                    name: categoryName,
                                    match_percentage: categoryJob.match_percentage,
                                    match_count: categoryJob.match_count
                                }
                            });
                        });
                    });
                }
            } catch (mysqlError) {
                console.error('MySQL查询具体岗位失败:', mysqlError.message);
                // MySQL查询失败不影响返回大类信息
            }
        }
        
        res.json({
            success: true,
            jobs: dbData.jobs || [], // 保留岗位大类信息
            specific_jobs: allJobs, // 新增：具体岗位列表
            input_skills: dbData.input_skills || [],
            input_skills_count: dbData.input_skills_count || 0,
            source: 'knowledge_graph',
            mysql_enabled: !!mysqlPool
        });
        
    } catch (error) {
        console.error('技能->岗位查询错误:', error);
        res.status(503).json({
            success: false,
            message: '数据库服务连接失败',
            fallback: true,
            error: error.message
        });
    }
});

/**
 * 获取知识图谱中的所有技能列表（分硬实力 / 软实力）
 */
app.get('/api/kg/skills', async (req, res) => {
    try {
        const response = await fetch(`${KG_DB_SERVICE_URL}/api/all-skills`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 8000
        });

        if (!response.ok) {
            return res.status(503).json({
                success: false,
                message: '数据库服务暂时不可用',
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('获取技能列表错误:', error);
        res.status(503).json({
            success: false,
            message: '数据库服务连接失败',
            error: error.message
        });
    }
});

// ==================== 健康检查 ====================

app.get('/api/health', (req, res) => {
    // 并行检查：图谱2数据库服务、MySQL、Neo4j
    const kgHealthPromise = fetch(`${KG_DB_SERVICE_URL}/api/health`, { 
        method: 'GET',
        timeout: 3000 
    }).then(response => response.ok ? 'available' : 'unavailable')
      .catch(() => 'unavailable');

    const mysqlHealthPromise = (async () => {
        if (!mysqlPool) return 'unavailable';
        try {
            const [rows] = await mysqlPool.query('SELECT 1 AS ok');
            return rows && rows.length > 0 ? 'available' : 'unavailable';
        } catch {
            return 'unavailable';
        }
    })();

    const neo4jHealthPromise = (async () => {
        if (!neo4jDriver) return 'unavailable';
        try {
            const session = neo4jDriver.session();
            await session.run('RETURN 1 AS ok');
            await session.close();
            return 'available';
        } catch {
            return 'unavailable';
        }
    })();

    Promise.all([kgHealthPromise, mysqlHealthPromise, neo4jHealthPromise])
        .then(([kgStatus, mysqlStatus, neo4jStatus]) => {
            res.json({ 
                success: true, 
                message: '服务器运行正常',
                kg_service: kgStatus,
                mysql: mysqlStatus,
                neo4j: neo4jStatus,
                timestamp: new Date().toISOString()
            });
        })
        .catch(() => {
            res.json({ 
                success: true, 
                message: '服务器运行正常（健康检查部分失败）',
                kg_service: 'unknown',
                mysql: 'unknown',
                neo4j: 'unknown',
                timestamp: new Date().toISOString()
            });
        });
});

// 根路径
app.get('/', (req, res) => {
    res.json({ 
        message: '就业匹配平台后端API',
        version: '1.0.0',
        endpoints: [
            'POST /api/register - 用户注册',
            'POST /api/login - 用户登录',
            'GET /api/profile/:userId - 获取用户资料',
            'POST /api/profile/:userId - 保存用户资料',
            'POST /api/kg/query-job-skills - 查询职位技能（知识图谱）',
            'GET /api/kg/jobs - 获取职位列表（知识图谱）',
            'POST /api/kg/query-skills-to-jobs - 根据技能查询岗位（知识图谱）',
            'GET /api/health - 健康检查'
        ],
        kg_service_url: KG_DB_SERVICE_URL
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 就业匹配平台后端服务器启动成功');
    console.log('='.repeat(60));
    console.log(`📡 服务器地址: http://localhost:${PORT}`);
    console.log(`📚 API文档: http://localhost:${PORT}`);
    console.log(`🔗 数据库服务: ${KG_DB_SERVICE_URL}`);
    console.log('='.repeat(60));
});
