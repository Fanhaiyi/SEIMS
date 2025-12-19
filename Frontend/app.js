// Simple SPA for Job Matching Platform (Demo)
// Features: auth (mock), profile management, job browse/search, skill→job match, job→skills recommendation, radar visualization

(function () {
    const appEl = document.getElementById('app');
    const authBtn = document.getElementById('authBtn');

    // --- API Configuration ---
    const API_BASE_URL = 'http://localhost:3001/api'; // 后端服务器端口为3001
    let useBackend = true; // 是否使用后端API，如果后端不可用会自动降级到localStorage
    
    // 测试后端连接
    async function testBackendConnection() {
        try {
            const response = await fetch('http://localhost:3001/api/health', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                console.log('✅ 后端服务器连接成功');
                useBackend = true;
                return true;
            }
        } catch (error) {
            console.warn('⚠️  后端服务器连接失败:', error.message);
            console.warn('💡 提示：请确保后端服务器已启动（运行 node server.js）');
            useBackend = false;
            return false;
        }
    }

    // --- API Helper Functions ---
    async function apiRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                let errorMessage = `请求失败 (HTTP ${response.status})`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    // 如果响应不是JSON，尝试获取文本
                    try {
                        const text = await response.text();
                        if (text) errorMessage = text.substring(0, 100);
                    } catch (e2) {
                        // 忽略
                    }
                }
                throw new Error(errorMessage);
            }
            
            return await response.json();
        } catch (error) {
            // 如果后端不可用，降级到localStorage
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                console.warn('后端不可用，使用本地存储模式');
                useBackend = false;
                throw new Error('后端服务不可用，请检查服务器是否运行');
            }
            throw error;
        }
    }

    // --- Mock database ---
    const skillsUniverse = [
        'JavaScript', 'HTML', 'CSS', 'React', 'Node.js', 'Python', 'Java', 'SQL', 'Data Analysis', 'Machine Learning',
        'Communication', 'Teamwork', 'Problem Solving', 'Algorithms', 'Docker', 'Kubernetes', 'Cloud', 'Linux'
    ];

    const jobs = [
        { id: 'fe_dev', title: '前端工程师', company: '星火科技', city: '上海',
          skills: { 'JavaScript': 5, 'HTML': 4, 'CSS': 4, 'React': 5, 'Node.js': 3, 'Communication': 3 },
          desc: '负责Web前端开发，参与设计系统组件与交互体验。' },
        { id: 'be_dev', title: '后端工程师', company: '云启网络', city: '北京',
          skills: { 'Node.js': 5, 'SQL': 4, 'Docker': 3, 'Linux': 4, 'Communication': 3 },
          desc: '构建高可用后端服务与API，优化数据库性能。' },
        { id: 'ds', title: '数据分析师', company: '衡智数据', city: '深圳',
          skills: { 'Python': 4, 'SQL': 5, 'Data Analysis': 5, 'Machine Learning': 3, 'Communication': 4 },
          desc: '业务数据分析与可视化，产出洞察报告与策略建议。' },
        { id: 'ml', title: '算法工程师', company: '极目智能', city: '杭州',
          skills: { 'Python': 5, 'Machine Learning': 5, 'Algorithms': 4, 'Data Analysis': 4 },
          desc: '参与核心算法研发与模型落地。' },
    ];

    // --- State ---
    const state = {
        route: 'home',
        user: load('jm_user') || null, // {id, name, email}
        profile: load('jm_profile') || { 
            fullName: '', 
            gender: '', 
            age: '', 
            phone: '', 
            photo: '', // 证件照 base64
            workExperience: '',
            education: '', // 教育经历
            skills: {}, 
            city: '', 
            intro: '' 
        },
        resume: load('jm_resume') || null, // 生成的简历
        selectedJobId: null,
        selectedJobDetail: null, // 选中的岗位详情（用于缓存从API加载的详情）
        selectedApplicationIndex: null, // 选中的投递记录索引
        chart: null,
        favorites: load('jm_favorites') || [], // 收藏的岗位ID列表
        applications: load('jm_applications') || [], // 投递记录 [{jobId, appliedAt, resumeSnapshot}]
        kgJobData: null, // 知识图谱返回的职位数据 {title, skills, source}
        kgJobTitles: null, // 从知识图谱获取的职位列表
        jobs: [], // 从数据库加载的岗位列表
        jobEducationFilter: null, // 岗位筛选：学历要求
        jobSalaryMinFilter: null, // 岗位筛选：最低薪资
        jobCityFilter: null, // 岗位筛选：城市
        jobSearchKeyword: '', // 岗位搜索关键词
        hardSkillOptions: [], // 从知识图谱获取的硬实力技能列表
        softSkillOptions: [], // 从知识图谱获取的软实力技能列表
    };

    // --- Storage Functions (with backend support) ---
    function save(key, value) { 
        localStorage.setItem(key, JSON.stringify(value)); 
    }
    function load(key) { 
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } 
    }

    // 从后端加载技能选项（岗位到能力知识图谱）
    async function loadSkillOptionsFromBackend() {
        try {
            const data = await apiRequest('/kg/skills', { method: 'GET' });
            if (data && (data.hard_skills || data.soft_skills)) {
                state.hardSkillOptions = data.hard_skills || [];
                state.softSkillOptions = data.soft_skills || [];
                console.log('✅ 从知识图谱加载技能列表成功:', state.hardSkillOptions.length, state.softSkillOptions.length);
                return;
            }
            console.warn('⚠️ 技能列表接口返回为空，使用默认技能集合');
        } catch (e) {
            console.warn('⚠️ 获取技能列表失败，使用默认技能集合:', e.message);
        }
        // 出现任何异常时，使用静态技能集合作为兜底
        state.hardSkillOptions = skillsUniverse;
        state.softSkillOptions = [];
    }

    // 异步加载技能选项（不阻塞后续渲染）
    loadSkillOptionsFromBackend().catch(() => {});

    // 从后端加载用户资料
    async function loadProfileFromBackend(userId) {
        if (!useBackend || !userId) return null;
        try {
            const result = await apiRequest(`/profile/${userId}`);
            if (result.success && result.profile) {
                // 移除后端字段，只保留前端需要的字段
                const { userId: _, updatedAt: __, ...profile } = result.profile;
                return profile;
            }
        } catch (error) {
            console.error('加载用户资料失败:', error);
        }
        return null;
    }

    // 保存用户资料到后端
    async function saveProfileToBackend(userId, profileData) {
        if (!useBackend || !userId) return false;
        try {
            const result = await apiRequest(`/profile/${userId}`, {
                method: 'POST',
                body: JSON.stringify(profileData)
            });
            return result.success;
        } catch (error) {
            console.error('保存用户资料失败:', error);
            return false;
        }
    }

    // --- Router ---
    function navigate(route) {
        state.route = route;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function topNavInit() {
        document.querySelectorAll('[data-route]').forEach(btn => {
            btn.addEventListener('click', () => navigate(btn.getAttribute('data-route')));
        });
        
        // 下拉菜单功能
        const dropdown = document.querySelector('.dropdown');
        const dropdownToggle = document.querySelector('.dropdown-toggle');
        
        if (dropdown && dropdownToggle) {
            // 点击切换下拉菜单
            dropdownToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });
            
            // 点击菜单项后关闭下拉菜单
            const dropdownMenu = dropdown.querySelector('.dropdown-menu');
            if (dropdownMenu) {
                dropdownMenu.addEventListener('click', () => {
                    dropdown.classList.remove('active');
                });
            }
            
            // 点击页面其他地方关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }
    }

    // --- Views ---
    function viewHome() {
        return `
        <section class="hero">
            <div class="hero-left">
                <h1>海量优质岗位，在线直达</h1>
                <p class="muted">完善个人画像，智能匹配岗位；或从岗位反推能力清单，明确成长路径。</p>
                
                <div class="hero-actions">
                    <button class="btn btn-primary" data-route="jobs">浏览岗位</button>
                    <button class="btn btn-outline" data-route="match">开始匹配</button>
                </div>
                <div class="kpi">
                    <div class="tile"><div class="value">${jobs.length}</div><div class="label">在招岗位</div></div>
                    <div class="tile"><div class="value">${skillsUniverse.length}</div><div class="label">技能维度</div></div>
                    <div class="tile"><div class="value">${Object.keys(state.profile.skills).length}</div><div class="label">你的技能条数</div></div>
                </div>
                
                <!-- 信任背书 -->
                <div class="logos-strip">
                    <span class="logos-title">合作与数据来源</span>
                    <div class="logos">
                        <span class="logo-badge">招聘平台</span>
                        <span class="logo-badge">企业数据</span>
                        <span class="logo-badge">高校画像</span>
                        <span class="logo-badge">行业报告</span>
                    </div>
                </div>
            </div>
            <div class="hero-right">
                <img class="hero-side-img" src="assets/hero.svg" alt="illustration">
            </div>
        </section>

        <!-- 功能优势 -->
        <section class="features container">
            <div class="feature-card">
                <div class="feature-icon">🎯</div>
                <h3>精准匹配</h3>
                <p>基于岗位-技能知识图谱，量化匹配度，先看是否合适再投递。</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🧠</div>
                <h3>能力反推</h3>
                <p>从目标岗位反推能力清单与等级，补齐差距，明确提升路径。</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">📈</div>
                <h3>数据驱动</h3>
                <p>岗位数据来自 MySQL，图谱查询由 Neo4j 提供，实时响应。</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🔒</div>
                <h3>隐私安全</h3>
                <p>个人画像保存在本地并可同步到服务器，可随时删除与导出。</p>
            </div>
        </section>

        <!-- 行动横幅 -->
        <section class="cta container">
            <div class="cta-text">
                <h3>开启你的下一份理想工作</h3>
                <p>3 步完成画像，获得专属岗位推荐与能力清单。</p>
            </div>
            <div class="cta-actions">
                <button class="btn btn-primary" data-route="profile">完善个人信息</button>
                <button class="btn btn-outline" data-route="jobs">浏览技能岗位</button>
            </div>
        </section>
        `;
    }

    function getSkillOptionsHtml(category, selectedName) {
        const list = category === '软实力'
            ? (state.softSkillOptions.length ? state.softSkillOptions : skillsUniverse)
            : (state.hardSkillOptions.length ? state.hardSkillOptions : skillsUniverse);

        return list.map(s => `<option ${s === selectedName ? 'selected' : ''}>${s}</option>`).join('');
    }

    function skillInputRow(name, value = 0, category = '硬实力') {
        // 如果技能已经在软实力列表中，则自动标为软实力
        if (state.softSkillOptions && state.softSkillOptions.includes(name)) {
            category = '软实力';
        }

        return `
        <div class="row skill-row">
            <div class="col-4">
                <label>能力类型</label>
                <select class="skill-category">
                    <option value="硬实力" ${category === '硬实力' ? 'selected' : ''}>硬实力</option>
                    <option value="软实力" ${category === '软实力' ? 'selected' : ''}>软实力</option>
                </select>
            </div>
            <div class="col-4">
                <label>技能名称</label>
                <input class="skill-name" type="text" placeholder="请输入技能名称" value="${name || ''}">
            </div>
            <div class="col-4">
                <label>熟练度 (0-5)</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input class="skill-level" type="number" min="0" max="5" value="${value}">
                    <button class="icon-btn icon-del remove-skill" title="删除技能">-</button>
                </div>
            </div>
        </div>`;
    }

    function viewProfile() {
        const skillRows = Object.entries(state.profile.skills).map(([n, v]) => skillInputRow(n, v)).join('');
        const hasResume = !!state.resume;
        return `
        <section class="card">
            <h2>个人信息管理</h2>
            
            <h3>证件照</h3>
            <div style="display:flex; gap:20px; align-items:start; margin-bottom:20px;">
                <div style="flex:0 0 auto;">
                    <div id="photoPreview" style="width:120px; height:160px; border:2px dashed rgba(11,27,58,.2); border-radius:8px; display:flex; align-items:center; justify-content:center; background:#f8f9fa; overflow:hidden;">
                        ${state.profile.photo ? 
                            `<img src="${state.profile.photo}" style="width:100%; height:100%; object-fit:cover;">` : 
                            '<div style="text-align:center; color:var(--muted); font-size:12px; padding:10px;">未上传<br>照片</div>'
                        }
                    </div>
                </div>
                <div style="flex:1;">
                    <label>上传证件照</label>
                    <input type="file" id="photoUpload" accept="image/*" style="margin-bottom:8px;">
                    <div class="muted" style="font-size:12px;">建议上传一寸或二寸证件照，支持 JPG、PNG 格式</div>
                    ${state.profile.photo ? '<button class="btn btn-outline" id="removePhoto" style="margin-top:8px; font-size:13px; padding:8px 12px;">删除照片</button>' : ''}
                </div>
            </div>
            
            <h3>基本信息</h3>
            <div class="row">
                <div class="col-6">
                    <label>姓名</label>
                    <input id="fullName" placeholder="请输入真实姓名" value="${state.profile.fullName||''}">
                </div>
                <div class="col-6">
                    <label>性别</label>
                    <select id="gender">
                        <option value="">请选择</option>
                        <option value="男" ${state.profile.gender==='男'?'selected':''}>男</option>
                        <option value="女" ${state.profile.gender==='女'?'selected':''}>女</option>
                    </select>
                </div>
            </div>
            
            <div class="row">
                <div class="col-6">
                    <label>年龄</label>
                    <input id="age" type="number" min="16" max="100" placeholder="如：25" value="${state.profile.age||''}">
                </div>
                <div class="col-6">
                    <label>联系电话</label>
                    <input id="phone" type="tel" placeholder="如：13800138000" value="${state.profile.phone||''}">
                </div>
            </div>
            
            <div class="row">
                <div class="col-6">
                    <label>所在城市</label>
                    <input id="city" placeholder="如：上海" value="${state.profile.city||''}">
                </div>
                <div class="col-6">
                    <label>一句话简介</label>
                    <input id="intro" placeholder="擅长方向、求职意向" value="${state.profile.intro||''}">
                </div>
            </div>
            
            <h3 style="margin-top:24px;">教育经历</h3>
            <textarea id="education" placeholder="请描述您的教育经历&#10;&#10;例如：&#10;2016.09 - 2020.06  某某大学  计算机科学与技术  本科" rows="4" style="width:100%; padding:12px; border:1px solid rgba(11,27,58,.1); border-radius:4px; font-family:inherit; resize:vertical;">${state.profile.education||''}</textarea>
            
            <h3 style="margin-top:24px;">工作经历</h3>
            <textarea id="workExperience" placeholder="请描述您的工作经历，包括公司名称、职位、工作时间、主要职责等&#10;&#10;例如：&#10;2020.06 - 2023.05  某科技公司  前端工程师&#10;- 负责公司核心产品的前端开发&#10;- 参与技术选型和架构设计" rows="6" style="width:100%; padding:12px; border:1px solid rgba(11,27,58,.1); border-radius:4px; font-family:inherit; resize:vertical;">${state.profile.workExperience||''}</textarea>

            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:24px;">
                <h3 style="margin:0;">技能画像</h3>
                <button class="icon-btn" id="addSkillIcon" title="新增技能">+</button>
            </div>
            <div id="skillsWrap">${skillRows || skillInputRow((state.hardSkillOptions[0] || skillsUniverse[0]), 3)}</div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-outline" id="addSkill">+ 添加技能</button>
                <button class="btn btn-primary" id="saveProfile">保存信息</button>
                <button class="btn btn-primary" id="generateResume" style="background:linear-gradient(135deg, #10b981, #34d399);">
                    ${hasResume ? '📄 重新生成简历' : '📄 生成简历'}
                </button>
                ${hasResume ? '<button class="btn btn-outline" id="viewResume">👁️ 预览简历</button>' : ''}
            </div>
        </section>`;
    }

    function viewJobs() {
        // 使用从数据库加载的岗位数据，如果没有则使用本地数据
        const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
        
        // 应用筛选条件
        let availableJobs = [...allJobs];
        
        // 学历要求筛选
        if (state.jobEducationFilter) {
            availableJobs = availableJobs.filter(job => 
                job.education && job.education.includes(state.jobEducationFilter)
            );
        }
        
        // 最低薪资筛选
        if (state.jobSalaryMinFilter !== null && state.jobSalaryMinFilter !== undefined) {
            availableJobs = availableJobs.filter(job => {
                const jobMin = job.min_salary;
                const jobMax = job.max_salary;
                
                // 如果岗位有薪资信息
                if (jobMin !== null || jobMax !== null) {
                    // 岗位的最高薪资必须 >= 筛选的最低薪资
                    const jobMaxSalary = jobMax !== null ? jobMax : jobMin;
                    return jobMaxSalary >= state.jobSalaryMinFilter;
                }
                // 如果岗位没有薪资信息，不显示
                return false;
            });
        }
        
        // 城市筛选
        if (state.jobCityFilter) {
            availableJobs = availableJobs.filter(job => 
                job.city && job.city.includes(state.jobCityFilter)
            );
        }
        
        // 关键词搜索
        if (state.jobSearchKeyword) {
            const keyword = state.jobSearchKeyword.toLowerCase();
            availableJobs = availableJobs.filter(job =>
                (job.title && job.title.toLowerCase().includes(keyword)) ||
                (job.company && job.company.toLowerCase().includes(keyword)) ||
                (job.city && job.city.toLowerCase().includes(keyword)) ||
                (job.description && job.description.toLowerCase().includes(keyword)) ||
                (job.desc && job.desc.toLowerCase().includes(keyword))
            );
        }
        
        const list = availableJobs.map(job => {
            const jobDesc = job.desc || job.description || '';
            const shortDesc = jobDesc.length > 150 ? jobDesc.substring(0, 150) + '...' : jobDesc;
            const salaryDisplay = job.salary || (job.min_salary && job.max_salary ? `${job.min_salary}-${job.max_salary}K/月` : job.min_salary ? `${job.min_salary}K/月起` : job.max_salary ? `最高${job.max_salary}K/月` : '');
            
            return `
            <div class="list-item">
                <div style="flex:1;">
                    <h4 class="job-title-link" data-job="${job.id}" style="cursor:pointer; color:var(--primary); font-weight:600;">
                        ${job.title}
                        ${job.company ? ` · ${job.company}` : ''}
                    </h4>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        ${job.city ? `<span class="chip">${job.city}</span>` : ''}
                        ${salaryDisplay ? `<span class="chip" style="background:#4CAF50; color:white;">💰 ${salaryDisplay}</span>` : ''}
                        ${job.education ? `<span class="chip">📚 ${job.education}</span>` : ''}
                    </div>
                    ${shortDesc ? `<p class="muted" style="margin-top:8px; line-height:1.5;">${shortDesc}</p>` : ''}
                    ${job.skills && Object.keys(job.skills).length > 0 ? `<div style="margin-top:8px;">${Object.entries(job.skills).map(([s,l])=>`<span class="chip">${s} Lv.${l}</span>`).join('')}</div>` : ''}
                </div>
                <div style="margin-left:auto; display:flex; align-items:center; gap:8px; flex-direction:column;">
                    <button class="btn btn-primary" data-job="${job.id}" data-action="detail" style="white-space:nowrap;">查看详情</button>
                    ${state.favorites.includes(job.id) ? 
                        '<button class="btn btn-outline" data-job="' + job.id + '" data-action="unfavorite" style="white-space:nowrap;">★ 已收藏</button>' : 
                        '<button class="btn btn-outline" data-job="' + job.id + '" data-action="favorite" style="white-space:nowrap;">☆ 收藏</button>'}
                    ${state.applications.some(app => app.jobId === job.id) ? 
                        '<button class="btn btn-outline" disabled style="white-space:nowrap;">✓ 已投递</button>' : 
                        '<button class="btn btn-outline" data-job="' + job.id + '" data-action="apply" style="white-space:nowrap;">📨 投递</button>'}
                </div>
            </div>`;
        }).join('');

        return `
        <section class="card">
            <h2>岗位浏览与搜索</h2>
            
            <!-- 筛选条件 -->
            <div style="margin-bottom:24px; padding:20px; background:#f8f9fa; border-radius:10px;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:12px; align-items:end; flex-wrap:wrap;">
                    <!-- 学历要求 -->
                    <div>
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#555;">📚 学历要求</label>
                        <input type="text" id="jobEducationFilter" 
                               placeholder="例如：本科、硕士、博士"
                               value="${state.jobEducationFilter || ''}"
                               style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid rgba(11,27,58,.16); font-size:14px;">
                    </div>
                    
                    <!-- 最低薪资 -->
                    <div>
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#555;">💰 最低薪资 (K/月)</label>
                        <input type="number" id="jobSalaryMin" 
                               placeholder="例如：10"
                               value="${state.jobSalaryMinFilter || ''}"
                               min="0"
                               style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid rgba(11,27,58,.16); font-size:14px;">
                    </div>
                    
                    <!-- 城市筛选 -->
                    <div>
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#555;">📍 所在城市</label>
                        <input type="text" id="jobCityFilter" 
                               placeholder="例如：北京、上海"
                               value="${state.jobCityFilter || ''}"
                               style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid rgba(11,27,58,.16); font-size:14px;">
                    </div>
                    
                    <!-- 操作按钮 -->
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary" id="searchJobs" style="white-space:nowrap;">🔍 搜索</button>
                        <button class="btn btn-outline" id="resetJobFilters" style="white-space:nowrap;">重置</button>
                    </div>
                </div>
            </div>
            
            <!-- 关键词搜索（可选） -->
            <div class="row" style="margin-bottom:12px;">
                <div class="col-8">
                    <input id="q" placeholder="输入关键词搜索岗位名称、公司、描述...">
                </div>
                <div class="col-4">
                    <button class="btn btn-primary" id="doSearch">关键词搜索</button>
                </div>
            </div>
            
            <div style="margin-bottom:12px; padding:12px; background:#e3f2fd; border-radius:8px; color:#1565c0;">
                📊 共找到 <strong>${availableJobs.length}</strong> 个岗位${allJobs.length !== availableJobs.length ? `（共 ${allJobs.length} 个，已筛选 ${availableJobs.length} 个）` : ''}
            </div>
            
            <div class="list" id="jobList">${list}</div>
        </section>`;
    }

    function skillInputRow(category, index, skillName = '', level = 3) {
        const containerId = category === 'hard' ? 'hardSkillsContainer' : 'softSkillsContainer';
        return `
        <div class="skill-input-row" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <input type="text" 
                   class="skill-name-input" 
                   placeholder="技能名称" 
                   value="${skillName}"
                   style="flex:1; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
            <select class="skill-level-select" 
                    style="width:100px; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
                ${[0,1,2,3,4,5].map(l => `<option value="${l}" ${l === level ? 'selected' : ''}>${l}分</option>`).join('')}
            </select>
            <button type="button" 
                    class="remove-skill-btn" 
                    style="width:32px; height:32px; border-radius:6px; border:1px solid #ef4444; background:#fee2e2; color:#dc2626; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:bold;"
                    title="删除技能">−</button>
        </div>`;
    }

    function viewMatch() {
        return `
        <section class="card">
            <h2>能力 → 岗位匹配</h2>
            <p class="muted">输入您的技能信息，系统将为您推荐最匹配的岗位。</p>
            
            <h3 style="margin-top:16px;">💡 输入您的技能</h3>
            <div class="row">
                <div class="col-6">
                    <label>我的硬实力</label>
                    <div id="hardSkillsContainer" style="margin-bottom:8px;">
                        ${skillInputRow('hard', 0)}
                    </div>
                    <button type="button" class="btn btn-outline" id="addHardSkillBtn" style="font-size:13px; padding:6px 12px;">+ 添加硬实力</button>
                </div>
                <div class="col-6">
                    <label>我的软实力</label>
                    <div id="softSkillsContainer" style="margin-bottom:8px;">
                        ${skillInputRow('soft', 0)}
                    </div>
                    <button type="button" class="btn btn-outline" id="addSoftSkillBtn" style="font-size:13px; padding:6px 12px;">+ 添加软实力</button>
                </div>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <button class="btn btn-primary" id="queryMatchBtn">🔍 查询匹配岗位</button>
                <button class="btn btn-outline" id="quickFilterBtn" style="display:none;">⚡ 快速筛选（本地）</button>
                <span class="muted" style="font-size:12px;">${useBackend ? '连接数据库查询匹配岗位' : '后端不可用，使用本地数据'}</span>
            </div>

            <div id="matchResults" style="display:none; margin-top:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="margin:0;">🎯 匹配结果</h3>
                    <span id="matchCount" class="muted"></span>
                </div>
                <div id="matchLoading" style="display:none; text-align:center; padding:20px;">
                    <div class="muted">正在查询匹配岗位...</div>
                </div>
                <div class="list" id="matchJobsList"></div>
            </div>
        </section>`;
    }

    // 判断技能是硬实力还是软实力
    // 严格依赖数据库返回的category字段，不使用关键词匹配
    function isHardSkill(skillName, category = null) {
        // 必须使用数据库提供的category字段
        if (category !== null && category !== undefined && category !== '') {
            return category === '硬实力';
        }
        
        // 如果没有category信息，返回null表示未知，不要猜测
        // 这样前端可以显示警告或使用默认处理
        return null;
    }
    
    function getSkillChipStyle(skillName, level, category = null) {
        const isHard = isHardSkill(skillName, category);
        if (isHard === true) {
            // 硬实力：蓝色系（与主题色一致）
            return 'background:linear-gradient(135deg, #e0f2fe, #bae6fd); border:1px solid #7dd3fc; color:#0c4a6e;';
        } else if (isHard === false) {
            // 软实力：绿色系（与成功色一致）
            return 'background:linear-gradient(135deg, #dcfce7, #bbf7d0); border:1px solid #86efac; color:#14532d;';
        } else {
            // 未知分类：灰色系（表示数据有问题）
            return 'background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border:1px solid #d1d5db; color:#374151;';
        }
    }

    function viewInverse() {
        // 优先使用知识图谱数据，否则使用本地数据
        const kgJobData = state.kgJobData;
        const selectedJob = state.selectedJobId ? jobs.find(j => j.id === state.selectedJobId) : null;
        // 优先使用知识图谱职位列表，否则使用本地
        const jobTitles = state.kgJobTitles && state.kgJobTitles.length > 0 
            ? state.kgJobTitles 
            : jobs.map(j => j.title);
        
        // 判断是否有数据显示
        const hasJobData = kgJobData || selectedJob;
        const currentJobTitle = kgJobData ? kgJobData.title : (selectedJob ? selectedJob.title : '');
        const currentSkills = kgJobData ? kgJobData.skills : (selectedJob ? selectedJob.skills : {});
        const isKgSource = !!kgJobData;
        
        // 处理知识图谱返回的技能格式（可能是数组或对象）
        // 保存技能信息和category（硬实力/软实力）
        let skillsDisplay = {};
        let skillsCategoryMap = {}; // 存储技能名称到category的映射
        if (Array.isArray(currentSkills)) {
            // 如果是数组格式 [{skill: 'xxx', level: 5, category: '硬实力'}, ...]
            currentSkills.forEach(item => {
                if (typeof item === 'string') {
                    skillsDisplay[item] = 3; // 默认级别
                } else if (item.skill || item.name) {
                    const skillName = item.skill || item.name;
                    skillsDisplay[skillName] = item.level || item.weight || 3;
                    // 保存category信息
                    if (item.category) {
                        skillsCategoryMap[skillName] = item.category;
                    }
                }
            });
        } else if (typeof currentSkills === 'object' && currentSkills !== null) {
            skillsDisplay = currentSkills;
        }
        
        // 统计硬实力和软实力数量（严格使用数据库的category信息）
        const hardSkills = [];
        const softSkills = [];
        const unknownSkills = []; // 没有category信息的技能
        
        Object.keys(skillsDisplay).forEach(skill => {
            const category = skillsCategoryMap[skill];
            const isHard = isHardSkill(skill, category);
            
            if (isHard === true) {
                hardSkills.push(skill);
            } else if (isHard === false) {
                softSkills.push(skill);
            } else {
                // category为null/undefined，说明数据有问题
                unknownSkills.push(skill);
            }
        });
        
        // 如果有未知分类的技能，显示警告
        const hasUnknownSkills = unknownSkills.length > 0;
        
        return `
        <section class="card">
            <h2>岗位 → 能力推荐</h2>
            <p class="muted">输入职位名称，系统将为您展示该职位所需的所有技能要求。</p>
            
            <h3 style="margin-top:24px;">📝 输入职位名称</h3>
            <div style="display:flex; gap:12px; margin-bottom:20px;">
                <div style="flex:1;">
                    <input type="text" id="jobNameInput" placeholder="例如：前端工程师、后端工程师、数据分析师" 
                           list="jobTitlesList" 
                           value="${currentJobTitle}"
                           style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid rgba(11,27,58,.16);">
                    <datalist id="jobTitlesList">
                        ${jobTitles.map(title => `<option value="${title}">`).join('')}
                    </datalist>
                </div>
                <button class="btn btn-primary" id="searchJobSkills" style="white-space:nowrap;">🔍 查询技能</button>
            </div>
            
            <div id="jobSkillsResult" style="display:${hasJobData ? 'block' : 'none'};">
                ${hasJobData ? `
                    <div style="display:flex; align-items:center; gap:8px; margin-top:24px;">
                        <h3 style="margin:0;">💡 职位所需技能</h3>
                        <button id="skillLevelHelpBtn" class="help-icon-btn" title="点击查看技能等级说明" style="width:24px; height:24px; border-radius:50%; border:1px solid rgba(43,102,255,.3); background:#eaf6ff; color:var(--primary); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; transition:all .2s;">
                            ?
                        </button>
                    </div>
                    <p class="muted">岗位「${currentJobTitle}」的技能要求：</p>
                    ${hasUnknownSkills && isKgSource ? `
                        <div class="alert alert-info" style="margin:12px 0; padding:12px; background:#fef3c7; color:#92400e; border-radius:8px; border:1px solid #f59e0b;">
                            ⚠️ <strong>警告：</strong>以下技能缺少分类信息：${unknownSkills.join('、')}。请检查数据库中的分类设置。
                        </div>
                    ` : ''}
                        ${Object.keys(skillsDisplay).length > 0 ? `
                        <!-- 图例说明 -->
                        <div style="display:flex; gap:16px; margin:12px 0; padding:12px; background:#f8f9fa; border-radius:8px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="chip" style="background:linear-gradient(135deg, #e0f2fe, #bae6fd); border:1px solid #7dd3fc; color:#0c4a6e;">硬实力</span>
                                <span style="font-size:13px; color:var(--muted);">技术技能</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="chip" style="background:linear-gradient(135deg, #dcfce7, #bbf7d0); border:1px solid #86efac; color:#14532d;">软实力</span>
                                <span style="font-size:13px; color:var(--muted);">通用能力</span>
                            </div>
                            <div style="font-size:12px; color:var(--muted); margin-left:auto;">
                                共 ${hardSkills.length} 项硬实力，${softSkills.length} 项软实力
                            </div>
                        </div>
                    ` : ''}
                    <div style="margin:16px 0;">
                        ${Object.keys(skillsDisplay).length > 0 ? `
                            <div class="skills-columns" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                                <!-- 硬实力列 -->
                                <div style="padding:16px; background:#f8f9fa; border-radius:10px; border-left:4px solid #3b82f6;">
                                    <h4 style="margin:0 0 12px 0; color:#1e40af; font-size:15px; display:flex; align-items:center; gap:6px;">
                                        <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:linear-gradient(135deg, #e0f2fe, #bae6fd); border:2px solid #7dd3fc;"></span>
                                        硬实力（${hardSkills.length}项）
                                    </h4>
                                    ${hardSkills.length > 0 ? `
                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                            ${hardSkills.map(skill => `
                                                <span class="chip" style="${getSkillChipStyle(skill, skillsDisplay[skill], skillsCategoryMap[skill])}">
                                                    ${skill} <strong>Lv.${skillsDisplay[skill]}</strong>
                                    </span>
                                `).join('')}
                                        </div>
                                    ` : '<div style="color:var(--muted); font-size:13px; padding:8px;">暂无硬实力要求</div>'}
                                </div>
                                
                                <!-- 软实力列 -->
                                <div style="padding:16px; background:#f8f9fa; border-radius:10px; border-left:4px solid #10b981;">
                                    <h4 style="margin:0 0 12px 0; color:#065f46; font-size:15px; display:flex; align-items:center; gap:6px;">
                                        <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:linear-gradient(135deg, #dcfce7, #bbf7d0); border:2px solid #86efac;"></span>
                                        软实力（${softSkills.length}项）
                                    </h4>
                                    ${softSkills.length > 0 ? `
                                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                            ${softSkills.map(skill => `
                                                <span class="chip" style="${getSkillChipStyle(skill, skillsDisplay[skill], skillsCategoryMap[skill])}">
                                                    ${skill} <strong>Lv.${skillsDisplay[skill]}</strong>
                                                </span>
                                            `).join('')}
                                        </div>
                                    ` : '<div style="color:var(--muted); font-size:13px; padding:8px;">暂无软实力要求</div>'}
                                </div>
                            </div>
                        ` : '<div class="empty">该职位暂无技能要求数据</div>'}
                    </div>
                    ${selectedJob ? `
                        <div style="margin-top:16px;">
                            <h4 style="margin-bottom:8px;">岗位详情</h4>
                            <p><strong>公司：</strong>${selectedJob.company}</p>
                            <p><strong>城市：</strong>${selectedJob.city}</p>
                            <p><strong>描述：</strong>${selectedJob.desc}</p>
                        </div>
                    ` : ''}
                    ${state.profile && Object.keys(state.profile.skills || {}).length > 0 && Object.keys(skillsDisplay).length > 0 ? `
                        <h3 style="margin-top:24px;">📊 技能对比分析</h3>
                        ${(() => {
                            const missing = diffSkills(state.profile.skills, skillsDisplay);
                            return missing.length > 0 ? `
                                <div style="margin-top:12px;">
                                    <p class="muted">您还需要提升以下技能：</p>
                                    <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
                                        ${missing.map(m => `
                                            <span class="chip" style="${getSkillChipStyle(m.skill, m.required, skillsCategoryMap[m.skill])} opacity:0.9;">
                                                ${m.skill} 需≥Lv.${m.required}（您当前：${m.current || 0}）
                                            </span>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : '<div class="empty" style="margin-top:12px;">✅ 恭喜！您的技能满足该岗位要求</div>';
                        })()}
                    ` : ''}
                    ${selectedJob ? `
                        <div style="margin-top:20px;">
                            <button class="btn btn-outline" data-job="${selectedJob.id}" data-action="detail">查看岗位详情</button>
                        </div>
                    ` : ''}
                ` : ''}
            </div>
            
            <div id="jobSkillsEmpty" style="display:${hasJobData ? 'none' : 'block'}; margin-top:32px;">
                <div class="empty">
                    <p>👆 请在上方输入职位名称，然后点击"查询技能"按钮</p>
                    <p class="muted" style="margin-top:8px; font-size:13px;">✨ 智能匹配，精准推荐，助您找到理想岗位</p>
                    <p class="muted" style="margin-top:8px; font-size:13px;">🚀 实时数据，权威分析，让职业规划更清晰</p>
                </div>
            </div>
            
            <!-- 技能等级说明模态框 -->
            <div id="skillLevelModal" class="modal-overlay" style="display:none;">
                <div class="modal-content">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h3 style="margin:0; color:var(--primary);">📊 技能等级说明</h3>
                        <button id="closeSkillLevelModal" class="modal-close-btn" style="width:32px; height:32px; border-radius:50%; border:none; background:#f0f0f0; color:#666; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center; transition:all .2s;">&times;</button>
                    </div>
                    <div style="line-height:1.8;">
                        <p class="muted" style="margin-bottom:16px;">技能等级（Lv.）表示该岗位对各项技能的要求程度，范围是 <strong>0-5级</strong>：</p>
                        <div style="padding:12px; background:#eff6ff; border-radius:8px; border-left:4px solid #3b82f6; margin-bottom:16px;">
                            <p style="margin:0; font-size:13px; color:#1e40af; line-height:1.6;">
                                <strong>📌 等级划分依据：</strong><br>
                                技能等级来源于知识图谱数据库中职位与技能之间关系的<strong>权重值（weight）</strong>。
                                权重值反映了该技能在该岗位中的重要程度，系统会根据以下规则将权重值转换为等级：<br>
                                • 如果权重值在 0-1 范围内：等级 = 权重 × 10（映射到1-10级）<br>
                                • 如果权重值 ≥ 1：等级 = min(权重值, 10)（直接取整数，最高10级）<br>
                                • 最终显示的等级范围会根据实际数据调整，通常为 1-5 级<br><br>
                                <strong>权重越高，等级越高</strong>，表示该技能对该岗位越重要。
                            </p>
                        </div>
                        <div style="display:grid; gap:12px;">
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #94a3b8;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#475569; min-width:50px;">Lv.0</span>
                                    <span>不需要</span>
                                </div>
                            </div>
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #60a5fa;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#3b82f6; min-width:50px;">Lv.1</span>
                                    <span>基础/入门级别</span>
                                </div>
                            </div>
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #3b82f6;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#2563eb; min-width:50px;">Lv.2</span>
                                    <span>初级级别</span>
                                </div>
                            </div>
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #2563eb;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#1d4ed8; min-width:50px;">Lv.3</span>
                                    <span>中级级别（默认等级）</span>
                                </div>
                            </div>
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #1d4ed8;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#1e40af; min-width:50px;">Lv.4</span>
                                    <span>高级级别</span>
                                </div>
                            </div>
                            <div style="padding:12px; background:#f8f9fa; border-radius:8px; border-left:4px solid #1e40af;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                    <span style="font-weight:bold; color:#1e3a8a; min-width:50px;">Lv.5</span>
                                    <span>专家级别</span>
                                </div>
                            </div>
                        </div>
                        <p class="muted" style="margin-top:20px; font-size:13px;">
                            💡 <strong>提示：</strong>数字越大，表示该岗位对该技能的要求越高。例如，Lv.4表示需要高级技能水平，Lv.1表示只需基础了解即可。
                        </p>
                    </div>
                </div>
            </div>
        </section>`;
    }

    function viewGraphVisualization() {
        return `
        <section class="card" style="max-width:none; width:100%; margin-left:calc(-20px - 1px); margin-right:calc(-20px - 1px); padding-left:20px; padding-right:20px;">
            <h2>知识图谱可视化</h2>
            
            <div style="margin-top:20px; margin-bottom:20px;">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                    <label style="font-weight:600;">岗位大类名称:</label>
                    <select 
                        id="graphPageNameSelect" 
                        style="flex:1; min-width:200px; padding:10px 14px; border-radius:8px; border:1px solid rgba(11,27,58,.16); font-size:14px; background:#fff; cursor:pointer;"
                    >
                        <option value="">请选择岗位大类...</option>
                    </select>
                    <button 
                        id="loadGraphBtn" 
                        class="btn btn-primary"
                        style="white-space:nowrap;"
                    >
                        🔍 加载图谱
                    </button>
                </div>
            </div>
            
            <div id="graphLoading" style="display:none; text-align:center; padding:40px;">
                <div style="color:var(--primary); font-size:16px;">正在加载图谱数据...</div>
            </div>
            
            <div id="graphError" style="display:none; padding:16px; background:#fee2e2; border:1px solid #ef4444; border-radius:8px; color:#dc2626; margin-bottom:20px;"></div>
            
            <div id="graphContainer" style="width:100%; min-width:100%; height:600px; border:1px solid rgba(11,27,58,.1); border-radius:8px; background:#ffffff; position:relative; box-shadow:0 10px 30px rgba(15,23,42,.08); overflow:visible;">
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:var(--muted);">
                    <p style="font-size:16px; margin-bottom:8px;">👆 请选择岗位大类名称并点击"加载图谱"按钮</p>
                    <p style="font-size:13px;">图谱将显示Page节点、Category节点和Skill节点之间的关系</p>
                </div>
            </div>
            
        </section>`;
    }

    function viewFavorites() {
        if (!state.user) {
            return `
            <section class="card">
                <h2>我的收藏</h2>
                <div class="empty">请先登录后查看收藏的岗位</div>
                <button class="btn btn-primary" style="margin-top:16px;" data-route="home">前往登录</button>
            </section>`;
        }
        
        // 合并从API加载的岗位和硬编码岗位
        const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
        // 确保favorites是数组
        if (!Array.isArray(state.favorites)) {
            state.favorites = [];
        }
        const favoriteJobs = allJobs.filter(j => j && j.id && state.favorites.includes(j.id));
        
        if (favoriteJobs.length === 0) {
            return `
            <section class="card">
                <h2>我的收藏</h2>
                <div class="empty">还没有收藏任何岗位</div>
                <button class="btn btn-primary" style="margin-top:16px;" data-route="jobs">去浏览岗位</button>
            </section>`;
        }
        
        return `
        <section class="card">
            <h2>我的收藏</h2>
            <p class="muted">共收藏 ${favoriteJobs.length} 个岗位</p>
            <div class="list" id="favoritesList">
                ${favoriteJobs.map(job => {
                    const isApplied = state.applications.some(app => app.jobId === job.id);
                    const jobDesc = job.desc || job.description || '';
                    const shortDesc = jobDesc.length > 150 ? jobDesc.substring(0, 150) + '...' : jobDesc;
                    const salaryDisplay = job.salary || (job.min_salary && job.max_salary ? `${job.min_salary}-${job.max_salary}K/月` : job.min_salary ? `${job.min_salary}K/月起` : job.max_salary ? `最高${job.max_salary}K/月` : '');
                    
                    return `
                    <div class="list-item">
                        <div style="flex:1;">
                            <h4 class="job-title-link" data-job="${job.id}" style="cursor:pointer; color:var(--primary); font-weight:600;">
                                ${job.title}
                                ${job.company ? ` · ${job.company}` : ''}
                            </h4>
                            <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                                ${job.city ? `<span class="chip">${job.city}</span>` : ''}
                                ${salaryDisplay ? `<span class="chip" style="background:#4CAF50; color:white;">💰 ${salaryDisplay}</span>` : ''}
                                ${job.education ? `<span class="chip">📚 ${job.education}</span>` : ''}
                                ${isApplied ? '<span class="chip" style="background:#d1fae5; color:#065f46;">✓ 已投递</span>' : ''}
                            </div>
                            ${shortDesc ? `<p class="muted" style="margin-top:8px; line-height:1.5;">${shortDesc}</p>` : ''}
                            ${job.skills && Object.keys(job.skills).length > 0 ? `<div style="margin-top:8px;">${Object.entries(job.skills).map(([s,l])=>`<span class="chip">${s} Lv.${l}</span>`).join('')}</div>` : ''}
                        </div>
                        <div style="margin-left:auto; display:flex; align-items:center; gap:8px; flex-direction:column;">
                            <button class="btn btn-primary" data-job="${job.id}" data-action="detail" style="white-space:nowrap;">查看详情</button>
                            <button class="btn btn-outline" data-job="${job.id}" data-action="remove" style="white-space:nowrap;">取消收藏</button>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </section>`;
    }

    function viewResume() {
        if (!state.resume) {
            return `
            <section class="card">
                <h2>简历预览</h2>
                <div class="empty">还没有生成简历，请先在"我的信息"页面生成简历</div>
                <button class="btn btn-primary" style="margin-top:16px;" data-route="profile">前往个人信息</button>
            </section>`;
        }
        
        const resume = state.resume;
        return `
        <section class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2>个人简历</h2>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-outline" id="backToProfile">返回编辑</button>
                    <button class="btn btn-primary" id="downloadResume">下载简历</button>
                </div>
            </div>
            
            <div id="resumeContent" style="background:#fff; padding:40px; border:1px solid rgba(11,27,58,.1); border-radius:12px; max-width:800px; margin:0 auto;">
                <!-- 简历头部 -->
                <div style="display:flex; gap:30px; align-items:start; margin-bottom:30px; padding-bottom:20px; border-bottom:2px solid var(--primary);">
                    ${resume.photo ? `
                        <div style="flex:0 0 auto;">
                            <img src="${resume.photo}" style="width:100px; height:133px; object-fit:cover; border:2px solid #ddd; border-radius:4px;">
                        </div>
                    ` : ''}
                    <div style="flex:1;">
                        <h1 style="margin:0 0 10px; font-size:28px; color:#1a1a1a;">${resume.fullName || '未填写姓名'}</h1>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; color:#666; font-size:14px;">
                            ${resume.gender ? `<div>👤 性别：${resume.gender}</div>` : ''}
                            ${resume.age ? `<div>🎂 年龄：${resume.age}岁</div>` : ''}
                            ${resume.phone ? `<div>📱 电话：${resume.phone}</div>` : ''}
                            ${resume.city ? `<div>📍 城市：${resume.city}</div>` : ''}
                        </div>
                        ${resume.intro ? `<div style="margin-top:12px; color:#444; font-style:italic;">"${resume.intro}"</div>` : ''}
                    </div>
                </div>
                
                <!-- 教育经历 -->
                ${resume.education ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">🎓 教育经历</h3>
                        <div style="white-space:pre-wrap; line-height:1.8; color:#333;">${resume.education}</div>
                    </div>
                ` : ''}
                
                <!-- 工作经历 -->
                ${resume.workExperience ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">💼 工作经历</h3>
                        <div style="white-space:pre-wrap; line-height:1.8; color:#333;">${resume.workExperience}</div>
                    </div>
                ` : ''}
                
                <!-- 专业技能 -->
                ${resume.skills && Object.keys(resume.skills).length > 0 ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">💡 专业技能</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;">
                            ${Object.entries(resume.skills).map(([skill, level]) => `
                                <div style="background:linear-gradient(135deg, #eaf6ff, #d4e9ff); padding:8px 16px; border-radius:20px; border:1px solid #b8daff;">
                                    <span style="font-weight:600; color:#0c5ba0;">${skill}</span>
                                    <span style="color:#666; margin-left:4px;">★${level}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-top:30px; padding-top:20px; border-top:1px solid #eee; text-align:center; color:#999; font-size:12px;">
                    生成时间：${new Date(resume.generatedAt).toLocaleString('zh-CN')}
                </div>
            </div>
        </section>`;
    }

    function viewApplications() {
        if (!state.user) {
            return `
            <section class="card">
                <h2>我的投递</h2>
                <div class="empty">请先登录后查看投递记录</div>
                <button class="btn btn-primary" style="margin-top:16px;" data-route="home">前往登录</button>
            </section>`;
        }
        
        // 确保applications是数组
        if (!Array.isArray(state.applications)) {
            state.applications = [];
        }
        
        if (state.applications.length === 0) {
            return `
            <section class="card">
                <h2>我的投递</h2>
                <div class="empty">还没有投递任何岗位</div>
                <button class="btn btn-primary" style="margin-top:16px;" data-route="jobs">去浏览岗位</button>
            </section>`;
        }
        
        // 按投递时间倒序排列
        const sortedApplications = [...state.applications].sort((a, b) => 
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );
        
        return `
        <section class="card">
            <h2>我的投递</h2>
            <p class="muted">共投递 ${state.applications.length} 个岗位</p>
            
            <div class="list" id="applicationsList">
                ${sortedApplications.map(app => {
                    // 合并从API加载的岗位和硬编码岗位
                    const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
                    const job = allJobs.find(j => j && j.id === app.jobId);
                    if (!job) {
                        // 如果找不到岗位，显示基本信息
                        return `
                        <div class="list-item">
                            <div style="flex:1;">
                                <h4 style="color:var(--muted);">岗位ID: ${app.jobId}</h4>
                                <div class="muted" style="margin-top:8px; font-size:13px;">
                                    📅 投递时间：${new Date(app.appliedAt).toLocaleString('zh-CN')}
                                </div>
                                ${app.resumeSnapshot ? '<div class="muted" style="margin-top:4px; font-size:13px;">📄 已附简历快照</div>' : ''}
                            </div>
                            <div style="margin-left:auto; display:flex; flex-direction:column; gap:8px;">
                                ${app.resumeSnapshot ? '<button class="btn btn-outline" data-app-index="' + sortedApplications.indexOf(app) + '" data-action="viewResume" style="white-space:nowrap;">查看简历</button>' : ''}
                            </div>
                        </div>`;
                    }
                    
                    const isFavorited = state.favorites.includes(job.id);
                    const applyDate = new Date(app.appliedAt);
                    const formatDate = applyDate.toLocaleString('zh-CN', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    // 计算投递天数
                    const daysSinceApply = Math.floor((Date.now() - applyDate) / (1000 * 60 * 60 * 24));
                    let statusText = '待处理';
                    let statusColor = '#fef3c7';
                    let statusTextColor = '#92400e';
                    
                    if (daysSinceApply < 1) {
                        statusText = '刚刚投递';
                        statusColor = '#dbeafe';
                        statusTextColor = '#1e40af';
                    } else if (daysSinceApply < 3) {
                        statusText = '审核中';
                        statusColor = '#fef3c7';
                        statusTextColor = '#92400e';
                    } else if (daysSinceApply < 7) {
                        statusText = '等待回复';
                        statusColor = '#e0e7ff';
                        statusTextColor = '#3730a3';
                    } else {
                        statusText = '已投递';
                        statusColor = '#f3f4f6';
                        statusTextColor = '#6b7280';
                    }
                    
                    return `
                    <div class="list-item">
                        <div style="flex:1;">
                            <h4 class="job-title-link" data-job="${job.id}" style="cursor:pointer; color:var(--primary);">
                                ${job.title} · ${job.company} 
                                <span class="chip">${job.city}</span>
                                <span class="chip" style="background:${statusColor}; color:${statusTextColor};">${statusText}</span>
                            </h4>
                            <div class="muted">${job.desc}</div>
                            <div class="muted" style="margin-top:6px; font-size:13px;">
                                📅 投递时间：${formatDate} ${daysSinceApply > 0 ? `(${daysSinceApply}天前)` : ''}
                            </div>
                            ${app.resumeSnapshot ? '<div class="muted" style="margin-top:4px; font-size:13px;">📄 已附简历</div>' : ''}
                            <div style="margin-top:6px;">${Object.entries(job.skills).map(([s,l])=>`<span class="chip">${s} Lv.${l}</span>`).join('')}</div>
                        </div>
                        <div style="margin-left:auto; display:flex; flex-direction:column; gap:8px;">
                            <button class="btn btn-outline" data-job="${job.id}" data-action="detail">查看岗位</button>
                            ${app.resumeSnapshot ? '<button class="btn btn-outline" data-app-index="' + sortedApplications.indexOf(app) + '" data-action="viewResume">查看简历</button>' : ''}
                            ${!isFavorited ? '<button class="btn btn-outline" data-job="' + job.id + '" data-action="favorite">收藏</button>' : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        </section>`;
    }

    function viewApplicationResume() {
        const appIndex = state.selectedApplicationIndex;
        if (appIndex === null || appIndex === undefined || !state.applications[appIndex]) {
            return `
            <section class="card">
                <h2>简历查看</h2>
                <div class="empty">找不到该投递记录</div>
                <button class="btn btn-primary" style="margin-top:16px;" id="backToAppsFromError">返回我的投递</button>
            </section>`;
        }
        
        const app = state.applications[appIndex];
        const resume = app.resumeSnapshot;
        const job = jobs.find(j => j.id === app.jobId);
        
        if (!resume) {
            return `
            <section class="card">
                <h2>简历查看</h2>
                <div class="empty">该投递记录未保存简历</div>
                <button class="btn btn-primary" style="margin-top:16px;" id="backToAppsFromError">返回我的投递</button>
            </section>`;
        }
        
        return `
        <section class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <div>
                    <h2>投递简历查看</h2>
                    <p class="muted">投递岗位：${job ? job.title + ' · ' + job.company : '未知岗位'} | 投递时间：${new Date(app.appliedAt).toLocaleString('zh-CN')}</p>
                </div>
                <button class="btn btn-outline" id="backToApplications">返回投递列表</button>
            </div>
            
            <div id="resumeContent" style="background:#fff; padding:40px; border:1px solid rgba(11,27,58,.1); border-radius:12px; max-width:800px; margin:0 auto;">
                <!-- 简历头部 -->
                <div style="display:flex; gap:30px; align-items:start; margin-bottom:30px; padding-bottom:20px; border-bottom:2px solid var(--primary);">
                    ${resume.photo ? `
                        <div style="flex:0 0 auto;">
                            <img src="${resume.photo}" style="width:100px; height:133px; object-fit:cover; border:2px solid #ddd; border-radius:4px;">
                        </div>
                    ` : ''}
                    <div style="flex:1;">
                        <h1 style="margin:0 0 10px; font-size:28px; color:#1a1a1a;">${resume.fullName || '未填写姓名'}</h1>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; color:#666; font-size:14px;">
                            ${resume.gender ? `<div>👤 性别：${resume.gender}</div>` : ''}
                            ${resume.age ? `<div>🎂 年龄：${resume.age}岁</div>` : ''}
                            ${resume.phone ? `<div>📱 电话：${resume.phone}</div>` : ''}
                            ${resume.city ? `<div>📍 城市：${resume.city}</div>` : ''}
                        </div>
                        ${resume.intro ? `<div style="margin-top:12px; color:#444; font-style:italic;">"${resume.intro}"</div>` : ''}
                    </div>
                </div>
                
                <!-- 教育经历 -->
                ${resume.education ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">🎓 教育经历</h3>
                        <div style="white-space:pre-wrap; line-height:1.8; color:#333;">${resume.education}</div>
                    </div>
                ` : ''}
                
                <!-- 工作经历 -->
                ${resume.workExperience ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">💼 工作经历</h3>
                        <div style="white-space:pre-wrap; line-height:1.8; color:#333;">${resume.workExperience}</div>
                    </div>
                ` : ''}
                
                <!-- 专业技能 -->
                ${resume.skills && Object.keys(resume.skills).length > 0 ? `
                    <div style="margin-bottom:25px;">
                        <h3 style="color:var(--primary); border-left:4px solid var(--primary); padding-left:10px; margin-bottom:12px;">💡 专业技能</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;">
                            ${Object.entries(resume.skills).map(([skill, level]) => `
                                <div style="background:linear-gradient(135deg, #eaf6ff, #d4e9ff); padding:8px 16px; border-radius:20px; border:1px solid #b8daff;">
                                    <span style="font-weight:600; color:#0c5ba0;">${skill}</span>
                                    <span style="color:#666; margin-left:4px;">★${level}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-top:30px; padding-top:20px; border-top:1px solid #eee; text-align:center; color:#999; font-size:12px;">
                    简历生成时间：${new Date(resume.generatedAt).toLocaleString('zh-CN')}
                </div>
            </div>
        </section>`;
    }

    function viewJobDetail() {
        // 优先从数据库加载的岗位数据中查找，否则从本地数据中查找
        const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
        let job = allJobs.find(j => j.id === state.selectedJobId);
        
        // 如果找到了岗位，使用缓存或已加载的数据
        if (job) {
            state.selectedJobDetail = job;
        } else if (state.selectedJobDetail) {
            // 使用之前加载的详情
            job = state.selectedJobDetail;
        } else {
            // 尝试从API加载岗位详情
            if (useBackend && state.selectedJobId) {
                // 异步加载岗位详情（在bindEventsForRoute中处理）
                return `
                <section class="card">
                    <div style="text-align:center; padding:40px;">
                        <div class="muted">正在加载岗位详情...</div>
                    </div>
                </section>`;
            }
            return '<section class="card"><h2>岗位不存在</h2><button class="btn btn-outline" id="backToJobs">← 返回列表</button></section>';
        }
        
        if (!job) {
            return '<section class="card"><h2>岗位不存在</h2><button class="btn btn-outline" id="backToJobs">← 返回列表</button></section>';
        }
        
        const isFavorited = state.favorites.includes(job.id);
        const isApplied = state.applications.some(app => app.jobId === job.id);
        const application = state.applications.find(app => app.jobId === job.id);
        
        const jobDesc = job.desc || job.description || '';
        const salaryDisplay = job.salary || (job.min_salary && job.max_salary ? `${job.min_salary}-${job.max_salary}K/月` : job.min_salary ? `${job.min_salary}K/月起` : job.max_salary ? `最高${job.max_salary}K/月` : '面议');
        
        return `
        <section class="card">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px; flex-wrap:wrap; gap:12px;">
                <div style="flex:1;">
                    <h2 style="margin-bottom:8px;">${job.title}</h2>
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                        ${job.company ? `<span style="color:var(--muted); font-size:16px;">${job.company}</span>` : ''}
                        ${job.city ? `<span class="chip">📍 ${job.city}</span>` : ''}
                        ${salaryDisplay ? `<span class="chip" style="background:#4CAF50; color:white;">💰 ${salaryDisplay}</span>` : ''}
                        ${job.education ? `<span class="chip">📚 ${job.education}</span>` : ''}
                    </div>
                    ${job.category ? `<div style="margin-top:8px;"><span class="chip" style="background:#e0e7ff; color:#3730a3;">${job.category}</span></div>` : ''}
                </div>
                <button class="btn btn-outline" id="backToJobs" style="white-space:nowrap;">← 返回列表</button>
            </div>
            
            ${jobDesc ? `
            <div class="row" style="margin-bottom:24px;">
                <div class="col-12">
                    <h3 style="margin-bottom:12px; color:#333; border-left:4px solid var(--primary); padding-left:10px;">📝 岗位描述</h3>
                    <div style="line-height:1.8; color:#555; white-space:pre-wrap;">${jobDesc}</div>
                </div>
            </div>
            ` : ''}
            
            ${job.requirements ? `
            <div class="row" style="margin-bottom:24px;">
                <div class="col-12">
                    <h3 style="margin-bottom:12px; color:#333; border-left:4px solid var(--primary); padding-left:10px;">💼 任职要求</h3>
                    <div style="line-height:1.8; color:#555; white-space:pre-wrap;">${job.requirements}</div>
                </div>
            </div>
            ` : ''}
            
            ${job.benefits ? `
            <div class="row" style="margin-bottom:24px;">
                <div class="col-12">
                    <h3 style="margin-bottom:12px; color:#333; border-left:4px solid var(--primary); padding-left:10px;">🎁 福利待遇</h3>
                    <div style="line-height:1.8; color:#555; white-space:pre-wrap;">${job.benefits}</div>
                </div>
            </div>
            ` : ''}
            
            ${job.company_info ? `
            <div class="row" style="margin-bottom:24px;">
                <div class="col-12">
                    <h3 style="margin-bottom:12px; color:#333; border-left:4px solid var(--primary); padding-left:10px;">🏢 公司信息</h3>
                    <div style="line-height:1.8; color:#555; white-space:pre-wrap;">${job.company_info}</div>
                </div>
            </div>
            ` : ''}
            
            ${job.skills && Object.keys(job.skills).length > 0 ? `
            <div class="row" style="margin-bottom:24px;">
                <div class="col-12">
                    <h3 style="margin-bottom:12px; color:#333; border-left:4px solid var(--primary); padding-left:10px;">💡 技能要求</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">${Object.entries(job.skills).map(([s,l])=>`<span class="chip">${s} Lv.${l}</span>`).join('')}</div>
                </div>
            </div>
            ` : ''}
            
            ${isApplied ? `
                <div class="alert alert-success" style="margin-bottom:16px; padding:12px; background:#d4edda; border:1px solid #c3e6cb; border-radius:6px; color:#155724;">
                    ✓ 你已于 ${new Date(application.appliedAt).toLocaleString('zh-CN')} 投递此岗位
                </div>
            ` : ''}
            
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:24px; padding-top:24px; border-top:1px solid #eee;">
                <button class="btn btn-primary" id="applyJob" ${isApplied ? 'disabled' : ''} style="min-width:120px;">
                    ${isApplied ? '✓ 已投递' : '📨 投递简历'}
                </button>
                <button class="btn btn-outline" id="favoriteJob" style="min-width:120px;">
                    ${isFavorited ? '★ 已收藏' : '☆ 收藏岗位'}
                </button>
                ${job.job_link ? `
                <a href="${job.job_link}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="min-width:120px; text-decoration:none; display:inline-block;">
                    🔗 查看原链接
                </a>
                ` : ''}
            </div>
        </section>`;
    }

    function viewAuth() {
        if (state.user) {
            return `
            <section class="card">
                <h2>已登录</h2>
                <p>你好，${state.user.name}（${state.user.email}）</p>
                <button class="btn btn-danger" id="logout">退出登录</button>
            </section>`;
        }
        return `
        <section class="card">
            <h2>用户注册/登录</h2>
            <div class="row">
                <div class="col-6">
                    <label>姓名</label>
                    <input id="name">
                </div>
                <div class="col-6">
                    <label>邮箱</label>
                    <input id="email" type="email">
                </div>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px;">
                <button class="btn btn-primary" id="register">注册并登录</button>
            </div>
        </section>`;
    }

    function render() {
        const html = (
            state.route === 'home' ? viewHome() :
            state.route === 'profile' ? viewProfile() :
            state.route === 'jobs' ? viewJobs() :
            state.route === 'match' ? viewMatch() :
            state.route === 'inverse' ? viewInverse() :
            state.route === 'graph' ? viewGraphVisualization() :
            state.route === 'jobDetail' ? viewJobDetail() :
            state.route === 'favorites' ? viewFavorites() :
            state.route === 'applications' ? viewApplications() :
            state.route === 'resume' ? viewResume() :
            state.route === 'applicationResume' ? viewApplicationResume() :
            viewAuth()
        );
        appEl.innerHTML = html;
        bindEventsForRoute();
        updateAuthButton();
    }

    // --- Logic helpers ---
    function rankJobsByMatch(userSkills) {
        return jobs.map(job => {
            const keys = new Set([...Object.keys(userSkills||{}), ...Object.keys(job.skills)]);
            let overlap = 0, required = 0, covered = [];
            keys.forEach(k => {
                const u = userSkills[k] || 0;
                const r = job.skills[k] || 0;
                required += r;
                overlap += Math.min(u, r);
                if (u > 0 && r > 0) covered.push(k);
            });
            const score = required ? overlap / required : 0;
            return { job, score, covered };
        }).sort((a,b)=>b.score-a.score);
    }

    function diffSkills(user, req) {
        return Object.entries(req).filter(([s, l]) => (user[s]||0) < l)
            .map(([skill, required]) => ({ skill, required, current: user[skill]||0 }));
    }

    // --- Bindings ---
    function bindEventsForRoute() {
        if (state.route === 'home') {
            const toJobs = document.querySelector('.hero [data-route="jobs"]');
            const toMatch = document.querySelector('.hero [data-route="match"]');
            if (toJobs) toJobs.addEventListener('click', () => navigate('jobs'));
            if (toMatch) toMatch.addEventListener('click', () => navigate('match'));
            const regBtn = document.getElementById('homeRegister');
            const loginBtn = document.getElementById('homeLogin');
            const authMessage = document.getElementById('homeAuthMessage');
            
            if (regBtn) {
                regBtn.addEventListener('click', async () => {
                    const name = document.getElementById('homeName').value.trim();
                    const email = document.getElementById('homeEmail').value.trim();
                    const password = document.getElementById('homePassword').value.trim();
                    
                    if (!name || !email || !password) { 
                        if (authMessage) authMessage.textContent = '请填写姓名、邮箱和密码';
                        return; 
                    }
                    
                    if (password.length < 6) {
                        if (authMessage) authMessage.textContent = '密码至少需要6位';
                        return;
                    }
                    
                    regBtn.disabled = true;
                    if (authMessage) authMessage.textContent = '注册中...';
                    
                    try {
                        if (useBackend) {
                            const result = await apiRequest('/register', {
                                method: 'POST',
                                body: JSON.stringify({ name, email, password })
                            });
                            
                            if (result.success) {
                                state.user = result.user;
                                save('jm_user', state.user);
                                
                                // 从后端加载用户资料
                                const profile = await loadProfileFromBackend(state.user.id);
                                if (profile) {
                                    // 合并远端资料，避免覆盖本地未同步的头像等字段
                                    state.profile = { ...state.profile, ...profile };
                                    save('jm_profile', state.profile);
                                }
                                
                                if (authMessage) authMessage.textContent = '';
                                render();
                                navigate('profile');
                            }
                        } else {
                            // 降级到localStorage模式（无需密码）
                    state.user = { id: Date.now().toString(36), name, email };
                    save('jm_user', state.user);
                            if (authMessage) authMessage.textContent = '';
                    render();
                    navigate('profile');
                        }
                    } catch (error) {
                        if (authMessage) authMessage.textContent = error.message || '注册失败，请重试';
                        console.error('注册失败:', error);
                    } finally {
                        regBtn.disabled = false;
                    }
                });
            }
            
            if (loginBtn) {
                loginBtn.addEventListener('click', async () => {
                    const email = document.getElementById('homeEmail').value.trim();
                    const password = document.getElementById('homePassword').value.trim();
                    
                    if (!email || !password) { 
                        if (authMessage) authMessage.textContent = '请填写邮箱和密码';
                        return; 
                    }
                    
                    loginBtn.disabled = true;
                    if (authMessage) authMessage.textContent = '登录中...';
                    
                    try {
                        if (useBackend) {
                            const result = await apiRequest('/login', {
                                method: 'POST',
                                body: JSON.stringify({ email, password })
                            });
                            
                            if (result.success) {
                                state.user = result.user;
                                save('jm_user', state.user);
                                
                                // 从后端加载用户资料
                                const profile = await loadProfileFromBackend(state.user.id);
                                if (profile) {
                                    state.profile = { ...state.profile, ...profile };
                                    save('jm_profile', state.profile);
                                }
                                
                                if (authMessage) authMessage.textContent = '';
                                render();
                                navigate('profile');
                            }
                        } else {
                            if (authMessage) authMessage.textContent = '后端服务不可用，请先启动服务器';
                        }
                    } catch (error) {
                        if (authMessage) authMessage.textContent = error.message || '登录失败，请检查邮箱和密码';
                        console.error('登录失败:', error);
                    } finally {
                        loginBtn.disabled = false;
                    }
                });
            }
            const logoutHome = document.getElementById('logoutHome');
            if (logoutHome) logoutHome.addEventListener('click', () => { state.user = null; save('jm_user', null); render(); });
            const goProfile = document.getElementById('goProfile');
            if (goProfile) goProfile.addEventListener('click', () => navigate('profile'));
            
            // 处理CTA部分的按钮（完善个人信息、浏览技能岗位）
            const ctaProfileBtn = document.querySelector('.cta [data-route="profile"]');
            const ctaJobsBtn = document.querySelector('.cta [data-route="jobs"]');
            if (ctaProfileBtn) {
                ctaProfileBtn.addEventListener('click', () => navigate('profile'));
            }
            if (ctaJobsBtn) {
                ctaJobsBtn.addEventListener('click', () => navigate('jobs'));
            }
        }
        if (state.route === 'profile') {
            // 照片上传
            const photoUpload = document.getElementById('photoUpload');
            if (photoUpload) {
                photoUpload.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    if (!file.type.startsWith('image/')) {
                        alert('请上传图片文件');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        state.profile.photo = event.target.result; // base64 持久化
                        // 1) 本地缓存，刷新也能看到
                        save('jm_profile', state.profile);
                        // 2) 已登录且后端可用时，同步到服务器，换设备/浏览器也可见
                        if (useBackend && state.user && state.user.id) {
                            try {
                                await saveProfileToBackend(state.user.id, state.profile);
                            } catch (err) {
                                console.warn('头像同步服务器失败，仅保存在本地：', err?.message || err);
                            }
                        }
                        render();
                    };
                    reader.readAsDataURL(file);
                });
            }
            
            // 删除照片
            const removePhoto = document.getElementById('removePhoto');
            if (removePhoto) {
                removePhoto.addEventListener('click', () => {
                    if (confirm('确定要删除照片吗？')) {
                        state.profile.photo = '';
                        save('jm_profile', state.profile);
                            if (useBackend && state.user && state.user.id) {
                                saveProfileToBackend(state.user.id, state.profile).catch(()=>{});
                            }
                        render();
                    }
                });
            }
            
            document.getElementById('addSkill').addEventListener('click', () => {
                const wrap = document.getElementById('skillsWrap');
                wrap.insertAdjacentHTML('beforeend', skillInputRow(skillsUniverse[0], 3));
            });
            const addSkillIcon = document.getElementById('addSkillIcon');
            if (addSkillIcon) addSkillIcon.addEventListener('click', () => {
                const wrap = document.getElementById('skillsWrap');
                wrap.insertAdjacentHTML('beforeend', skillInputRow(skillsUniverse[0], 3));
            });
            // remove skill by delegation
            const wrap = document.getElementById('skillsWrap');
            wrap.addEventListener('click', (e) => {
                const btn = e.target.closest('.remove-skill');
                if (!btn) return;
                const rows = wrap.querySelectorAll('.skill-row');
                const row = btn.closest('.skill-row');
                if (!row) return;
                if (rows.length > 1) {
                    row.remove();
                } else {
                    // if only one row, just reset fields
                    const nameSelect = row.querySelector('.skill-name');
                    const levelInput = row.querySelector('.skill-level');
                    if (nameSelect) nameSelect.selectedIndex = 0;
                    if (levelInput) levelInput.value = 0;
                }
            });
            
            // 保存个人信息
            document.getElementById('saveProfile').addEventListener('click', async () => {
                if (!state.user) {
                    alert('请先登录');
                    return;
                }
                
                const skills = {};
                document.querySelectorAll('#skillsWrap .row').forEach(r => {
                    const name = r.querySelector('.skill-name').value;
                    const level = Number(r.querySelector('.skill-level').value || 0);
                    if (Number.isFinite(level)) skills[name] = Math.max(0, Math.min(5, level));
                });
                state.profile = {
                    fullName: document.getElementById('fullName').value.trim(),
                    gender: document.getElementById('gender').value,
                    age: document.getElementById('age').value.trim(),
                    phone: document.getElementById('phone').value.trim(),
                    photo: state.profile.photo || '',
                    education: document.getElementById('education').value.trim(),
                    workExperience: document.getElementById('workExperience').value.trim(),
                    skills,
                    city: document.getElementById('city').value.trim(),
                    intro: document.getElementById('intro').value.trim(),
                };
                
                // 保存到localStorage（前端缓存）
                save('jm_profile', state.profile);
                
                // 保存到后端
                if (useBackend && state.user && state.user.id) {
                    const saved = await saveProfileToBackend(state.user.id, state.profile);
                    if (saved) {
                        alert('已保存个人信息（已同步到服务器）');
                    } else {
                        alert('已保存个人信息（本地存储，服务器同步失败）');
                    }
                } else {
                alert('已保存个人信息');
                }
            });
            
            // 生成简历
            const generateResumeBtn = document.getElementById('generateResume');
            if (generateResumeBtn) {
                generateResumeBtn.addEventListener('click', () => {
                    // 先保存当前信息
                    const skills = {};
                    document.querySelectorAll('#skillsWrap .row').forEach(r => {
                        const name = r.querySelector('.skill-name').value;
                        const level = Number(r.querySelector('.skill-level').value || 0);
                        if (Number.isFinite(level)) skills[name] = Math.max(0, Math.min(5, level));
                    });
                    state.profile = {
                        fullName: document.getElementById('fullName').value.trim(),
                        gender: document.getElementById('gender').value,
                        age: document.getElementById('age').value.trim(),
                        phone: document.getElementById('phone').value.trim(),
                        photo: state.profile.photo || '',
                        education: document.getElementById('education').value.trim(),
                        workExperience: document.getElementById('workExperience').value.trim(),
                        skills,
                        city: document.getElementById('city').value.trim(),
                        intro: document.getElementById('intro').value.trim(),
                    };
                    save('jm_profile', state.profile);
                    
                    // 生成简历
                    state.resume = {
                        ...state.profile,
                        generatedAt: new Date().toISOString()
                    };
                    save('jm_resume', state.resume);
                    alert('✓ 简历生成成功！');
                    render();
                });
            }
            
            // 预览简历
            const viewResumeBtn = document.getElementById('viewResume');
            if (viewResumeBtn) {
                viewResumeBtn.addEventListener('click', () => {
                    navigate('resume');
                });
            }
        }
        if (state.route === 'jobs') {
            const listEl = document.getElementById('jobList');
            if (listEl) {
                listEl.addEventListener('click', (e) => {
                    // 处理岗位标题点击
                    const titleLink = e.target.closest('.job-title-link');
                    if (titleLink) {
                        state.selectedJobId = titleLink.getAttribute('data-job');
                        state.selectedJobDetail = null;
                        navigate('jobDetail');
                        return;
                    }
                    
                    // 处理按钮点击
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const jobId = btn.getAttribute('data-job');
                    const action = btn.getAttribute('data-action');
                    
                    if (action === 'detail') {
                        state.selectedJobId = jobId;
                        state.selectedJobDetail = null;
                        navigate('jobDetail');
                    } else if (action === 'favorite') {
                        // 添加收藏
                        if (!state.favorites.includes(jobId)) {
                            state.favorites.push(jobId);
                            save('jm_favorites', state.favorites);
                            alert('收藏成功！');
                            render(); // 重新渲染以更新按钮状态
                        }
                    } else if (action === 'unfavorite') {
                        // 取消收藏
                        const index = state.favorites.indexOf(jobId);
                        if (index > -1) {
                            state.favorites.splice(index, 1);
                            save('jm_favorites', state.favorites);
                            alert('已取消收藏');
                            render(); // 重新渲染以更新按钮状态
                        }
                    } else if (action === 'apply') {
                        // 投递简历
                        if (!state.user) {
                            alert('请先登录后再投递简历');
                            navigate('auth');
                            return;
                        }
                        
                        // 检查是否已生成简历
                        if (!state.resume) {
                            if (confirm('您还没有生成简历，是否前往生成？')) {
                                navigate('profile');
                            }
                            return;
                        }
                        
                        // 检查是否已投递
                        const alreadyApplied = state.applications.some(app => app.jobId === jobId);
                        if (alreadyApplied) {
                            alert('您已经投递过此岗位');
                            render();
                            return;
                        }
                        
                        // 保存投递记录，包含简历快照
                        state.applications.push({
                            jobId: jobId,
                            appliedAt: new Date().toISOString(),
                            resumeSnapshot: { ...state.resume } // 保存简历快照
                        });
                        save('jm_applications', state.applications);
                        alert('✓ 简历投递成功！');
                        render(); // 重新渲染以显示已投递状态
                    }
                });
            }
            
            // 筛选按钮
            const searchJobsBtn = document.getElementById('searchJobs');
            if (searchJobsBtn) {
                searchJobsBtn.addEventListener('click', () => {
                    const education = (document.getElementById('jobEducationFilter')?.value || '').trim();
                    const salaryMin = document.getElementById('jobSalaryMin')?.value ? Number(document.getElementById('jobSalaryMin').value) : null;
                    const city = (document.getElementById('jobCityFilter')?.value || '').trim();
                    
                    state.jobEducationFilter = education || null;
                    state.jobSalaryMinFilter = salaryMin;
                    state.jobCityFilter = city || null;
                    render();
                });
            }
            
            // 重置筛选按钮
            const resetFiltersBtn = document.getElementById('resetJobFilters');
            if (resetFiltersBtn) {
                resetFiltersBtn.addEventListener('click', () => {
                    state.jobEducationFilter = null;
                    state.jobSalaryMinFilter = null;
                    state.jobCityFilter = null;
                    state.jobSearchKeyword = '';
                    if (document.getElementById('jobEducationFilter')) document.getElementById('jobEducationFilter').value = '';
                    if (document.getElementById('jobSalaryMin')) document.getElementById('jobSalaryMin').value = '';
                    if (document.getElementById('jobCityFilter')) document.getElementById('jobCityFilter').value = '';
                    if (document.getElementById('q')) document.getElementById('q').value = '';
                    render();
                });
            }
            
            // 关键词搜索
            const doSearchBtn = document.getElementById('doSearch');
            if (doSearchBtn) {
                doSearchBtn.addEventListener('click', () => {
                    const q = (document.getElementById('q')?.value || '').trim();
                    state.jobSearchKeyword = q;
                    render();
                });
                
                // 支持回车键搜索
                const qInput = document.getElementById('q');
                if (qInput) {
                    qInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            doSearchBtn.click();
                        }
                    });
                }
            }
        }
        if (state.route === 'match') {
            // 生成演示用薪资（若不存在），按技能等级之和简单估算
            function ensureJobSalaries() {
                jobs.forEach(j => {
                    if (typeof j.salaryK !== 'number') {
                        const sumLevels = j.skills ? Object.values(j.skills).reduce((a,b)=>a+Number(b||0),0) : 0;
                        // 基础 8K + 技能等级和 * 1.2K，四舍五入
                        j.salaryK = Math.round(8 + sumLevels * 1.2);
                    }
                });
            }
            
            // 添加硬实力技能行
            const addHardSkillBtn = document.getElementById('addHardSkillBtn');
            if (addHardSkillBtn) {
                addHardSkillBtn.addEventListener('click', () => {
                    const container = document.getElementById('hardSkillsContainer');
                    if (container) {
                        const newRow = document.createElement('div');
                        newRow.className = 'skill-input-row';
                        newRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:8px;';
                        newRow.innerHTML = `
                            <input type="text" class="skill-name-input" placeholder="技能名称" style="flex:1; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
                            <select class="skill-level-select" style="width:100px; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
                                ${[0,1,2,3,4,5].map(l => `<option value="${l}">${l}分</option>`).join('')}
                            </select>
                            <button type="button" class="remove-skill-btn" style="width:32px; height:32px; border-radius:6px; border:1px solid #ef4444; background:#fee2e2; color:#dc2626; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:bold;" title="删除技能">−</button>
                        `;
                        container.appendChild(newRow);
                        // 绑定删除按钮事件
                        const removeBtn = newRow.querySelector('.remove-skill-btn');
                        if (removeBtn) {
                            removeBtn.addEventListener('click', () => {
                                if (container.children.length > 1) {
                                    newRow.remove();
                                } else {
                                    alert('至少需要保留一个技能输入行');
                                }
                            });
                        }
                    }
                });
            }

            // 添加软实力技能行
            const addSoftSkillBtn = document.getElementById('addSoftSkillBtn');
            if (addSoftSkillBtn) {
                addSoftSkillBtn.addEventListener('click', () => {
                    const container = document.getElementById('softSkillsContainer');
                    if (container) {
                        const newRow = document.createElement('div');
                        newRow.className = 'skill-input-row';
                        newRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:8px;';
                        newRow.innerHTML = `
                            <input type="text" class="skill-name-input" placeholder="技能名称" style="flex:1; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
                            <select class="skill-level-select" style="width:100px; padding:8px 12px; border-radius:6px; border:1px solid rgba(11,27,58,.16);">
                                ${[0,1,2,3,4,5].map(l => `<option value="${l}">${l}分</option>`).join('')}
                            </select>
                            <button type="button" class="remove-skill-btn" style="width:32px; height:32px; border-radius:6px; border:1px solid #ef4444; background:#fee2e2; color:#dc2626; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:bold;" title="删除技能">−</button>
                        `;
                        container.appendChild(newRow);
                        // 绑定删除按钮事件
                        const removeBtn = newRow.querySelector('.remove-skill-btn');
                        if (removeBtn) {
                            removeBtn.addEventListener('click', () => {
                                if (container.children.length > 1) {
                                    newRow.remove();
                                } else {
                                    alert('至少需要保留一个技能输入行');
                                }
                            });
                        }
                    }
                });
            }

            // 绑定所有删除按钮的事件（包括初始行）
            function bindRemoveButtons() {
                document.querySelectorAll('.remove-skill-btn').forEach(btn => {
                    // 避免重复绑定
                    if (btn.dataset.bound) return;
                    btn.dataset.bound = 'true';
                    btn.addEventListener('click', function() {
                        const row = this.closest('.skill-input-row');
                        const container = row?.parentElement;
                        if (container && container.children.length > 1) {
                            row.remove();
                        } else {
                            alert('至少需要保留一个技能输入行');
                        }
                    });
                });
            }
            bindRemoveButtons();

            // 查询匹配岗位（使用后端API）
            const queryMatchBtn = document.getElementById('queryMatchBtn');
            if (queryMatchBtn) {
                queryMatchBtn.addEventListener('click', async () => {
                    // 从动态行中收集硬实力技能
                    const hardContainer = document.getElementById('hardSkillsContainer');
                    const hardSkills = [];
                    if (hardContainer) {
                        hardContainer.querySelectorAll('.skill-input-row').forEach(row => {
                            const nameInput = row.querySelector('.skill-name-input');
                            const levelSelect = row.querySelector('.skill-level-select');
                            const name = (nameInput?.value || '').trim();
                            const level = parseInt(levelSelect?.value || '0', 10);
                            if (name) {
                                hardSkills.push({ name, level });
                            }
                        });
                    }

                    // 从动态行中收集软实力技能
                    const softContainer = document.getElementById('softSkillsContainer');
                    const softSkills = [];
                    if (softContainer) {
                        softContainer.querySelectorAll('.skill-input-row').forEach(row => {
                            const nameInput = row.querySelector('.skill-name-input');
                            const levelSelect = row.querySelector('.skill-level-select');
                            const name = (nameInput?.value || '').trim();
                            const level = parseInt(levelSelect?.value || '0', 10);
                            if (name) {
                                softSkills.push({ name, level });
                            }
                        });
                    }

                    const allSkills = [...hardSkills, ...softSkills];

                    if (allSkills.length === 0) {
                        alert('请输入至少一个技能');
                        return;
                    }

                    const resultsDiv = document.getElementById('matchResults');
                    const loadingDiv = document.getElementById('matchLoading');
                    const listEl = document.getElementById('matchJobsList');
                    const countSpan = document.getElementById('matchCount');

                    // 显示加载状态
                    resultsDiv.style.display = 'block';
                    loadingDiv.style.display = 'block';
                    listEl.innerHTML = '';
                    queryMatchBtn.disabled = true;
                    queryMatchBtn.textContent = '查询中...';

                    try {
                        let matchedJobs = [];

                        // 优先使用后端API查询
                        if (useBackend) {
                            try {
                                // 发送技能名称和熟练度数组
                                const result = await apiRequest('/kg/query-skills-to-jobs', {
                                    method: 'POST',
                                    body: JSON.stringify({ 
                                        skills: allSkills.map(s => s.name),
                                        skill_levels: allSkills.reduce((acc, s) => {
                                            acc[s.name] = s.level;
                                            return acc;
                                        }, {})
                                    })
                                });

                                if (result.success && result.specific_jobs && result.specific_jobs.length > 0) {
                                    // 首选：使用后端从 MySQL 查询出来的具体岗位列表（带类别和匹配度）
                                    matchedJobs = result.specific_jobs;
                                    console.log(`✅ 从数据库具体岗位列表中查询到 ${matchedJobs.length} 个匹配岗位`);
                                } else if (result.success && result.jobs && result.jobs.length > 0) {
                                    // 其次：如果没有具体岗位，只使用岗位大类（来自知识图谱）
                                    matchedJobs = result.jobs.map((job, index) => ({
                                        id: job.id || `kg_${index}`,
                                        title: job.job_name || job.title || '未命名岗位',
                                        company: '',
                                        city: '',
                                        desc: '',
                                        salary: '',
                                        match_percentage: job.match_percentage || 0,
                                        category: job.category_info?.name || job.category || '',
                                    }));
                                    console.log(`⚠️ 仅从图数据库查询到 ${matchedJobs.length} 个岗位大类（无具体岗位信息）`);
                                } else {
                                    console.log('未找到匹配的岗位');
                                }
                            } catch (apiError) {
                                console.error('API查询失败:', apiError);
                                // 降级到本地数据
                                matchedJobs = [];
                            }
                        }

                        // 如果API查询失败或没有结果，使用本地数据作为备用
                        if (matchedJobs.length === 0) {
                            ensureJobSalaries();
                            const parseKeywords = (s) => s
                                .split(/[，,\s]+/)
                                .map(x => x.trim())
                                .filter(Boolean)
                                .map(x => x.toLowerCase());

                            const hardKeys = parseKeywords(hard);
                            const softKeys = parseKeywords(soft);

                            const matchAll = (skillNames, keys) => keys.every(k => skillNames.some(n => n.includes(k)));

                            const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
                            matchedJobs = allJobs.filter(j => {
                                const names = Object.keys(j.skills || {}).map(s => s.toLowerCase());
                                const okHard = hardKeys.length === 0 || matchAll(names, hardKeys);
                                const okSoft = softKeys.length === 0 || matchAll(names, softKeys);
                                return okHard && okSoft;
                            });
                        }


                        // 显示结果（分页：每页10条）
                        loadingDiv.style.display = 'none';
                        countSpan.textContent = `共找到 ${matchedJobs.length} 个匹配岗位`;

                        const pageSize = 10;
                        let currentPage = 1;
                        const totalPages = Math.max(1, Math.ceil(matchedJobs.length / pageSize));

                        function renderMatchPage() {
                            if (matchedJobs.length === 0) {
                                listEl.innerHTML = '<div class="empty">未找到符合条件的岗位</div>';
                                return;
                            }

                            const start = (currentPage - 1) * pageSize;
                            const end = start + pageSize;
                            const pageItems = matchedJobs.slice(start, end);

                            const itemsHtml = pageItems.map(job => {
                                const jobDesc = job.desc || job.description || '';
                                const shortDesc = jobDesc.length > 150 ? jobDesc.substring(0, 150) + '...' : jobDesc;
                                const salaryDisplay = job.salary || (job.min_salary && job.max_salary ? `${job.min_salary}-${job.max_salary}K/月` : job.min_salary ? `${job.min_salary}K/月起` : job.max_salary ? `最高${job.max_salary}K/月` : '面议');
                                const matchPercent = job.match_percentage || job.category_info?.match_percentage || 0;
                                
                                return `
                                <div class="list-item">
                                    <div style="flex:1;">
                                        <h4 class="job-title-link" data-job="${job.id}" style="cursor:pointer; color:var(--primary); font-weight:600;">
                                            ${job.title}
                                            ${job.company ? ` · ${job.company}` : ''}
                                        </h4>
                                        <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                                            ${job.city ? `<span class="chip">${job.city}</span>` : ''}
                                            ${salaryDisplay ? `<span class="chip" style="background:#4CAF50; color:white;">💰 ${salaryDisplay}</span>` : ''}
                                            ${job.education ? `<span class="chip">📚 ${job.education}</span>` : ''}
                                            ${matchPercent > 0 ? `<span class="chip" style="background:linear-gradient(135deg,#3b82f6,#2563eb); color:white;">匹配度 ${matchPercent}%</span>` : ''}
                                        </div>
                                        ${shortDesc ? `<p class="muted" style="margin-top:8px; line-height:1.5;">${shortDesc}</p>` : ''}
                                        ${job.category ? `<div style="margin-top:6px;"><span class="chip" style="background:#e0e7ff; color:#3730a3;">${job.category}</span></div>` : ''}
                                    </div>
                                    <div style="margin-left:auto; display:flex; align-items:center; gap:8px; flex-direction:column;">
                                        <button class="btn btn-primary" data-job="${job.id}" data-action="detail" style="white-space:nowrap;">查看详情</button>
                                    </div>
                                </div>`;
                            }).join('');

                            const pagerHtml = totalPages > 1 ? `
                                <div style="margin-top:16px; display:flex; justify-content:center; gap:8px;">
                                    <button class="btn" data-page-action="prev" ${currentPage === 1 ? 'disabled' : ''}>‹ 上一页</button>
                                    <button class="btn" data-page-action="next" ${currentPage === totalPages ? 'disabled' : ''}>下一页 ›</button>
                                    <button class="btn" data-page-action="first" ${currentPage === 1 ? 'disabled' : ''}>首页</button>
                                    <span class="muted" style="align-self:center; font-size:12px;">第 ${currentPage} / ${totalPages} 页</span>
                                </div>
                            ` : '';

                            listEl.innerHTML = itemsHtml + pagerHtml;
                        }

                        renderMatchPage();

                        // 把分页状态存入元素 dataset，便于事件委托中访问
                        listEl.dataset.pageSize = String(pageSize);
                        listEl.dataset.totalPages = String(totalPages);
                        listEl.dataset.currentPage = String(currentPage);
                        // 同时在 window 上挂一个引用，供事件处理函数使用
                        window._matchJobsPagination = {
                            get currentPage() { return currentPage; },
                            set currentPage(v) { currentPage = v; renderMatchPage(); },
                            pageSize,
                            totalPages,
                        };
                    } catch (error) {
                        console.error('查询匹配岗位失败:', error);
                        loadingDiv.style.display = 'none';
                        listEl.innerHTML = '<div class="empty">查询失败，请稍后重试</div>';
                        alert('查询失败: ' + (error.message || '未知错误'));
                    } finally {
                        queryMatchBtn.disabled = false;
                        queryMatchBtn.textContent = '🔍 查询匹配岗位';
                    }
                });
            }

            // 处理匹配结果中的按钮点击
            const matchResults = document.getElementById('matchResults');
            if (matchResults) {
                matchResults.addEventListener('click', (e) => {
                    const titleLink = e.target.closest('.job-title-link');
                    if (titleLink) {
                        state.selectedJobId = titleLink.getAttribute('data-job');
                        state.selectedJobDetail = null;
                        navigate('jobDetail');
                        return;
                    }
                    
                    // 分页按钮处理
                    const pagerBtn = e.target.closest('button[data-page-action]');
                    if (pagerBtn && window._matchJobsPagination) {
                        const action = pagerBtn.getAttribute('data-page-action');
                        const pag = window._matchJobsPagination;
                        if (!action) return;
                        
                        if (action === 'prev' && pag.currentPage > 1) {
                            pag.currentPage -= 1;
                        } else if (action === 'next' && pag.currentPage < pag.totalPages) {
                            pag.currentPage += 1;
                        } else if (action === 'first' && pag.currentPage !== 1) {
                            pag.currentPage = 1;
                        }
                        return;
                    }
                    
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const jobId = btn.getAttribute('data-job');
                    const action = btn.getAttribute('data-action');
                    
                    if (action === 'detail') {
                        state.selectedJobId = jobId;
                        state.selectedJobDetail = null;
                        navigate('jobDetail');
                    }
                });
            }

            // 快速筛选（前端备用，隐藏按钮）
            const quickBtn = document.getElementById('quickFilterBtn');
            if (quickBtn) {
                ensureJobSalaries();
                quickBtn.addEventListener('click', () => {
                    const hard = (document.getElementById('hardKeywords')?.value || '').trim();
                    const soft = (document.getElementById('softKeywords')?.value || '').trim();

                    const parseKeywords = (s) => s
                        .split(/[，,\s]+/)
                        .map(x => x.trim())
                        .filter(Boolean)
                        .map(x => x.toLowerCase());

                    const hardKeys = parseKeywords(hard);
                    const softKeys = parseKeywords(soft);

                    const matchAll = (skillNames, keys) => keys.every(k => skillNames.some(n => n.includes(k)));

                    const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
                    const list = allJobs.filter(j => {
                        const names = Object.keys(j.skills || {}).map(s => s.toLowerCase());
                        const okHard = hardKeys.length === 0 || matchAll(names, hardKeys);
                        const okSoft = softKeys.length === 0 || matchAll(names, softKeys);
                        return okHard && okSoft;
                    });

                    const resultsDiv = document.getElementById('matchResults');
                    const listEl = document.getElementById('matchJobsList');
                    const countSpan = document.getElementById('matchCount');
                    
                    resultsDiv.style.display = 'block';
                    countSpan.textContent = `共找到 ${list.length} 个匹配岗位`;
                    
                    listEl.innerHTML = list.length > 0 ? list.map(job => {
                        const jobDesc = job.desc || job.description || '';
                        const shortDesc = jobDesc.length > 150 ? jobDesc.substring(0, 150) + '...' : jobDesc;
                        const salaryDisplay = job.salary || (job.min_salary && job.max_salary ? `${job.min_salary}-${job.max_salary}K/月` : job.min_salary ? `${job.min_salary}K/月起` : '面议');
                        
                        return `
                        <div class="list-item">
                            <div style="flex:1;">
                                <h4 class="job-title-link" data-job="${job.id}" style="cursor:pointer; color:var(--primary); font-weight:600;">
                                    ${job.title}
                                    ${job.company ? ` · ${job.company}` : ''}
                                </h4>
                                <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                                    ${job.city ? `<span class="chip">${job.city}</span>` : ''}
                                    ${salaryDisplay ? `<span class="chip" style="background:#4CAF50; color:white;">💰 ${salaryDisplay}</span>` : ''}
                                    ${job.education ? `<span class="chip">📚 ${job.education}</span>` : ''}
                                </div>
                                ${shortDesc ? `<p class="muted" style="margin-top:8px; line-height:1.5;">${shortDesc}</p>` : ''}
                            </div>
                            <div style="margin-left:auto; display:flex; align-items:center; gap:8px; flex-direction:column;">
                                <button class="btn btn-primary" data-job="${job.id}" data-action="detail" style="white-space:nowrap;">查看详情</button>
                            </div>
                        </div>`;
                    }).join('') : '<div class="empty">未找到符合条件的岗位</div>';
                });
            }
        }
        if (state.route === 'inverse') {
            // 技能等级说明模态框
            const skillLevelHelpBtn = document.getElementById('skillLevelHelpBtn');
            const skillLevelModal = document.getElementById('skillLevelModal');
            const closeSkillLevelModal = document.getElementById('closeSkillLevelModal');
            
            if (skillLevelHelpBtn && skillLevelModal) {
                skillLevelHelpBtn.addEventListener('click', () => {
                    skillLevelModal.style.display = 'flex';
                });
                
                if (closeSkillLevelModal) {
                    closeSkillLevelModal.addEventListener('click', () => {
                        skillLevelModal.style.display = 'none';
                    });
                    }
                    
                // 点击模态框背景关闭
                skillLevelModal.addEventListener('click', (e) => {
                    if (e.target === skillLevelModal) {
                        skillLevelModal.style.display = 'none';
                    }
                });
                
                // 问号按钮悬停效果
                skillLevelHelpBtn.addEventListener('mouseenter', () => {
                    skillLevelHelpBtn.style.background = '#d4e9ff';
                    skillLevelHelpBtn.style.transform = 'scale(1.1)';
            });
                skillLevelHelpBtn.addEventListener('mouseleave', () => {
                    skillLevelHelpBtn.style.background = '#eaf6ff';
                    skillLevelHelpBtn.style.transform = 'scale(1)';
                });
            }
            
            // 查询职位技能按钮
            const searchJobSkillsBtn = document.getElementById('searchJobSkills');
            const jobNameInput = document.getElementById('jobNameInput');
            
            if (searchJobSkillsBtn && jobNameInput) {
                searchJobSkillsBtn.addEventListener('click', async () => {
                    const jobTitle = jobNameInput.value.trim();
                    
                    if (!jobTitle) {
                        alert('请输入职位名称');
                        return;
                    }
                    
                    // 禁用按钮，显示加载状态
                    searchJobSkillsBtn.disabled = true;
                    searchJobSkillsBtn.textContent = '查询中...';
                    
                    try {
                        // 优先尝试从知识图谱API获取
                        if (useBackend) {
                            try {
                                const result = await apiRequest('/kg/query-job-skills', {
                                    method: 'POST',
                                    body: JSON.stringify({ jobTitle: jobTitle })
                                });
                                
                                if (result.success && result.skills) {
                                    console.log('✅ 知识图谱查询成功:', result);
                                    // 使用知识图谱返回的数据
                                    state.kgJobData = {
                                        title: result.jobTitle,
                                        skills: result.skills,
                                        source: 'knowledge_graph'
                                    };
                                    state.selectedJobId = null; // 清除本地职位选择
                                    render();
                                    return;
                                } else {
                                    console.warn('⚠️ 知识图谱返回数据格式异常:', result);
                                }
                            } catch (kgError) {
                                console.error('知识图谱查询失败:', kgError);
                                // 显示详细的错误信息给用户
                                const errorMsg = kgError.message || '未知错误';
                                console.log('知识图谱查询失败，降级到本地数据:', errorMsg);
                                // 在页面上显示警告
                                if (!document.querySelector('.kg-error-warning')) {
                                    const warning = document.createElement('div');
                                    warning.className = 'alert alert-info kg-error-warning';
                                    warning.style.cssText = 'margin-top:12px; padding:12px; background:#fef3c7; color:#92400e; border-radius:8px; border:1px solid #f59e0b;';
                                    warning.innerHTML = `⚠️ 知识图谱查询失败: ${errorMsg}<br><small>已自动切换到本地数据</small>`;
                                    const card = document.querySelector('.card');
                                    if (card) card.insertBefore(warning, card.firstChild);
                                }
                            }
                        }
                        
                        // 降级：使用本地数据
                        const matchedJob = jobs.find(j => 
                            j.title.toLowerCase() === jobTitle.toLowerCase() ||
                            j.title.includes(jobTitle) ||
                            jobTitle.includes(j.title)
                        );
                        
                        if (!matchedJob) {
                            alert(`未找到职位「${jobTitle}」\n\n${useBackend ? '知识图谱服务不可用，' : ''}可用职位：${jobs.map(j => j.title).join('、')}`);
                            return;
                        }
                        
                        // 设置选中的职位并重新渲染
                        state.selectedJobId = matchedJob.id;
                        state.kgJobData = null; // 清除知识图谱数据
                        render();
                        
                    } catch (error) {
                        console.error('查询职位技能失败:', error);
                        alert('查询失败，请稍后重试');
                    } finally {
                        searchJobSkillsBtn.disabled = false;
                        searchJobSkillsBtn.textContent = '🔍 查询技能';
                    }
                });
                
                // 支持回车键搜索
                jobNameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        searchJobSkillsBtn.click();
                    }
                });
            }
            
            // 处理查看岗位详情按钮
            const jobSkillsResult = document.getElementById('jobSkillsResult');
            if (jobSkillsResult) {
                jobSkillsResult.addEventListener('click', (e) => {
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const jobId = btn.getAttribute('data-job');
                    if (jobId) {
                        state.selectedJobId = jobId;
                        navigate('jobDetail');
                    }
                });
            }
        }
        if (state.route === 'graph') {
            let network = null; // 保存vis-network实例
            
            // 加载Page列表到下拉框
            const pageNameSelect = document.getElementById('graphPageNameSelect');
            if (pageNameSelect && useBackend) {
                (async () => {
                    try {
                        const result = await apiRequest('/kg/pages', { method: 'GET' });
                        if (result.success && result.pages && Array.isArray(result.pages)) {
                            // 清空现有选项（保留第一个"请选择"选项）
                            while (pageNameSelect.options.length > 1) {
                                pageNameSelect.remove(1);
                            }
                            
                            // 添加所有Page选项
                            result.pages.forEach(pageName => {
                                const option = document.createElement('option');
                                option.value = pageName;
                                option.textContent = pageName;
                                pageNameSelect.appendChild(option);
                            });
                            
                            console.log(`✅ 已加载 ${result.pages.length} 个岗位大类`);
                        }
                    } catch (error) {
                        console.error('加载Page列表失败:', error);
                        // 如果加载失败，添加一个提示选项
                        const option = document.createElement('option');
                        option.value = '';
                        option.textContent = '加载失败，请刷新页面重试';
                        option.disabled = true;
                        pageNameSelect.appendChild(option);
                    }
                })();
            }
            
            // 加载图谱按钮 & 容器元素
            const loadGraphBtn = document.getElementById('loadGraphBtn');
            const graphContainer = document.getElementById('graphContainer');
            const graphLoading = document.getElementById('graphLoading');
            const graphError = document.getElementById('graphError');
            // graphInfo 图例区域已移除，这里不再使用
                        
            if (loadGraphBtn && pageNameSelect) {
                loadGraphBtn.addEventListener('click', async () => {
                    const pageName = pageNameSelect.value.trim();
                    
                    if (!pageName) {
                        alert('请选择岗位大类名称');
                        return;
                    }
                    
                    // 如果容器元素不存在，直接报错并中止，避免读取 null.style
                    if (!graphContainer || !graphLoading || !graphError) {
                        console.error('Graph container or status elements not found');
                        alert('图谱容器未正确渲染，请刷新页面后重试');
                        return;
                    }
                    
                    // 显示加载状态
                    graphLoading.style.display = 'block';
                    graphError.style.display = 'none';
                    graphContainer.innerHTML = '';
                    loadGraphBtn.disabled = true;
                    loadGraphBtn.textContent = '加载中...';
                    
                    try {
                        // 调用后端API
                        const result = await apiRequest('/kg/graph-visualization', {
                            method: 'POST',
                            body: JSON.stringify({ pageName: pageName })
                        });
                        
                        if (result.success && result.nodes && result.edges) {
                            // 准备vis-network数据
                            const nodes = result.nodes.map(node => {
                                // 根据节点类型设置不同的颜色和形状（蓝色系，类似你提供的图）
                                let background = '#b0c4de'; // 技能：浅蓝
                                let border = '#8ba4c8';
                                // 使用 circle 形状，让文字居中显示在圆圈内部
                                let shape = 'circle';
                                let size = 22;
                                
                                if (node.type === 'Page') {
                                    // IT服务节点：深蓝
                                    background = '#0b3b8c';
                                    border = '#082b63';
                                    shape = 'circle';
                                    size = 32;
                                } else if (node.type === 'Category') {
                                    // 软实力 / 硬实力：中蓝
                                    background = '#295fba';
                                    border = '#1f4b93';
                                    shape = 'circle';
                                    size = 28;
                                } else if (node.type === 'Skill') {
                                    // 其他技能节点：保持浅蓝色
                                    background = '#d2e1f5';
                                    border = '#afc4e6';
                                    shape = 'circle';
                                    size = 22;
                                }
                                
                                // 根据节点大小调整字体大小，确保文字完全居中在圆圈内
                                // vis-network中size是半径的像素值，直径 = size * 2
                                // 为了确保文字在圆圈内且居中，字体大小应该约为节点直径的25-30%
                                let fontSize = Math.floor(size * 0.3); // 约为节点大小的30%
                                
                                // 根据节点类型设置合适的字体大小
                                if (node.type === 'Page') {
                                    fontSize = 14; // Page节点：14px字体，32px节点
                                } else if (node.type === 'Category') {
                                    fontSize = 12; // Category节点：12px字体，28px节点
                                } else {
                                    fontSize = 10; // Skill节点：10px字体，22px节点
                                }
                                
                                // 不截断标签，显示完整文字（vis-network会自动处理超出部分）
                                let displayLabel = node.label || '';
                                
                                // 根据节点类型设置字体颜色
                                let fontColor = '#1f2937'; // 默认黑色
                                if (node.type === 'Page') {
                                    fontColor = '#ffffff'; // Page节点：白色
                                } else if (node.type === 'Category') {
                                    fontColor = '#ffffff'; // Category节点（硬实力/软实力）：白色
                                }
                                
                                return {
                                    id: node.id,
                                    label: displayLabel,
                                    color: {
                                        background,
                                        border,
                                        highlight: {
                                            background,
                                            border: '#1f2937'
                                        }
                                    },
                                    shape,
                                    size,
                                    font: {
                                        size: fontSize,
                                        color: fontColor,
                                        face: 'Arial, sans-serif',
                                        align: 'center',
                                        bold: false,
                                        vadjust: 0 // 垂直居中
                                    },
                                    scaling: {
                                        label: {
                                            enabled: false // 禁用自动缩放，使用固定大小
                                        }
                                    },
                                    widthConstraint: {
                                        maximum: size * 1.6 // 限制标签最大宽度，确保文字在圆圈内
                                    },
                                    heightConstraint: {
                                        maximum: size * 1.6 // 限制标签最大高度
                                    },
                                    title: `${node.type}: ${node.label}` // 完整标签显示在tooltip中
                                };
                            });
                            
                            const edges = result.edges.map(edge => {
                                // 确定边的标签：显示权重值
                                let edgeLabel = '';
                                
                                // 检查edge.label是否是数字（权重）
                                if (edge.label && !isNaN(parseFloat(edge.label)) && isFinite(edge.label)) {
                                    // 如果是数字字符串，直接显示（这是权重）
                                    edgeLabel = parseFloat(edge.label).toFixed(6); // 保留6位小数
                                } else if (edge.type === 'HAS_CATEGORY' && edge.properties && edge.properties.type != null) {
                                    // HAS_CATEGORY关系：显示type属性（权重）
                                    edgeLabel = parseFloat(edge.properties.type).toFixed(6);
                                } else if (edge.type === 'HAS_SKILL' && edge.properties && edge.properties.weight != null) {
                                    // HAS_SKILL关系：显示weight属性（权重）
                                    edgeLabel = parseFloat(edge.properties.weight).toFixed(6);
                                } else if (edge.properties && edge.properties.weight != null) {
                                    // 如果properties里有weight属性，显示它
                                    edgeLabel = parseFloat(edge.properties.weight).toFixed(6);
                                } else if (edge.properties && edge.properties.type != null) {
                                    // 如果properties里有type属性，显示它
                                    edgeLabel = parseFloat(edge.properties.type).toFixed(6);
                                }
                                // 如果edge.label是关系类型字符串（HAS_CATEGORY或HAS_SKILL），且没有找到权重，则不显示标签
                                
                                return {
                                    id: edge.id,
                                    from: edge.from,
                                    to: edge.to,
                                    label: edgeLabel,
                                    arrows: 'to',
                                    color: {
                                        color: '#9ca3af',
                                        highlight: '#4b5563'
                                    },
                                    width: edgeLabel ? 2.2 : 1.5,
                                    font: {
                                        size: 9,
                                        color: '#4b5563',
                                        strokeWidth: 2,
                                        strokeColor: '#ffffff',
                                        align: 'middle'
                                    },
                                    smooth: {
                                        type: 'continuous',
                                        roundness: 0.2
                                    }
                                };
                            });
                            
                            // 检查 vis 库是否加载
                            if (typeof vis === 'undefined' || !vis.Network || !vis.DataSet) {
                                throw new Error('vis-network 库未加载，请检查网络连接或CDN');
                            }
                            
                            // 创建vis-network
                            const data = {
                                nodes: new vis.DataSet(nodes),
                                edges: new vis.DataSet(edges)
                            };
                            
                            const options = {
                                nodes: {
                                    borderWidth: 1.5,
                                    shadow: {
                                        enabled: true,
                                        color: 'rgba(15,23,42,.25)',
                                        size: 10,
                                        x: 0,
                                        y: 3
                                    },
                                    font: {
                                        align: 'center'
                                    }
                                },
                                edges: {
                                    smooth: {
                                        type: 'continuous',
                                        roundness: 0.2
                                    },
                                    font: {
                                        align: 'middle',
                                        vadjust: 0
                                    }
                                },
                                physics: {
                                    enabled: true,
                                    solver: 'forceAtlas2Based',
                                    forceAtlas2Based: {
                                        gravitationalConstant: -80,
                                        centralGravity: 0.015, // 增加中心引力，让节点更居中
                                        springLength: 100,
                                        springConstant: 0.08,
                                        damping: 0.4,
                                        avoidOverlap: 1.2
                                    },
                                    stabilization: {
                                        iterations: 200,
                                        fit: true
                                    },
                                    minVelocity: 0.5,
                                    maxVelocity: 50
                                },
                                interaction: {
                                    hover: true,
                                    tooltipDelay: 100,
                                    zoomView: true,
                                    dragView: true,
                                    zoomSpeed: 1.2,
                                    dragNodes: true,
                                    dragViewModifier: false, // 允许在整个区域内拖动视图
                                    selectConnectedEdges: true
                                },
                                layout: {
                                    improvedLayout: true,
                                    randomSeed: 2
                                }
                            };
                            
                            // 检查 vis 库是否加载
                            if (typeof vis === 'undefined' || !vis.Network) {
                                throw new Error('vis-network 库未加载，请检查网络连接或CDN');
                            }
                            
                            // 清除旧的可视化
                            if (network) {
                                network.destroy();
                                network = null;
                            }
                            
                            // 确保容器有正确的尺寸
                            const containerRect = graphContainer.getBoundingClientRect();
                            if (containerRect.width === 0 || containerRect.height === 0) {
                                console.warn('容器尺寸为0，等待容器渲染');
                                setTimeout(() => {
                                    if (graphContainer && graphContainer.getBoundingClientRect().width > 0) {
                                        const rect = graphContainer.getBoundingClientRect();
                                        network = new vis.Network(graphContainer, data, options);
                                        // 显式设置网络大小
                                        network.setSize(`${rect.width}px`, `${rect.height}px`);
                                        setupNetworkEvents();
                                    }
                                }, 100);
                                return;
                            }
                            
                            // 创建新的可视化
                            network = new vis.Network(graphContainer, data, options);
                            
                            // 显式设置网络大小，确保填满整个容器
                            network.setSize(`${containerRect.width}px`, `${containerRect.height}px`);
                            
                            // 强制设置 canvas 元素的样式，确保填满容器
                            setTimeout(() => {
                                const canvas = graphContainer.querySelector('canvas');
                                if (canvas) {
                                    canvas.style.width = '100%';
                                    canvas.style.height = '100%';
                                    canvas.style.maxWidth = 'none';
                                    canvas.style.maxHeight = 'none';
                                }
                            }, 50);
                            
                            // 设置网络事件处理
                            function setupNetworkEvents() {
                                if (!network) return;
                                
                                network.once('stabilizationEnd', function() {
                                    if (network && graphContainer) {
                                        // 确保网络大小正确
                                        const rect = graphContainer.getBoundingClientRect();
                                        network.setSize(`${rect.width}px`, `${rect.height}px`);
                                        
                                        // 延迟一下确保稳定化完全完成
                                        setTimeout(() => {
                                            if (network) {
                                                network.fit({
                                                    animation: {
                                                        duration: 500,
                                                        easingFunction: 'easeInOutQuad'
                                                    },
                                                    padding: 30,
                                                    minZoomLevel: 0.3, // 降低最小缩放级别，允许更大的视图范围
                                                    maxZoomLevel: 3 // 增加最大缩放级别
                                                });
                                            }
                                        }, 100);
                                    }
                                });
                                
                                // 添加一些交互事件
                                network.on('click', function(params) {
                                    if (params.nodes.length > 0) {
                                        const nodeId = params.nodes[0];
                                        const node = nodes.find(n => n.id === nodeId);
                                        if (node) {
                                            console.log('点击节点:', node.label);
                                        }
                                    }
                                });
                                
                                // 窗口大小变化时重新调整图谱大小
                                const handleResize = () => {
                                    if (network && graphContainer) {
                                        const rect = graphContainer.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0) {
                                            network.setSize(`${rect.width}px`, `${rect.height}px`);
                                        }
                                    }
                                };
                                
                                window.addEventListener('resize', handleResize);
                            }
                            
                            // 调用事件设置函数
                            setupNetworkEvents();
                            
                        } else {
                            throw new Error(result.message || '数据格式错误');
                        }
                    } catch (error) {
                        console.error('加载图谱失败:', error);
                        graphError.style.display = 'block';
                        graphError.textContent = `加载失败: ${error.message || '未知错误'}`;
                        graphContainer.innerHTML = `
                            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:var(--danger);">
                                <p style="font-size:16px; margin-bottom:8px;">❌ 加载失败</p>
                                <p style="font-size:13px;">${error.message || '未知错误'}</p>
                            </div>
                        `;
                    } finally {
                        graphLoading.style.display = 'none';
                        loadGraphBtn.disabled = false;
                        loadGraphBtn.textContent = '🔍 加载图谱';
                    }
                });
            }
        }
        if (state.route === 'favorites') {
            const listEl = document.getElementById('favoritesList');
            if (listEl) {
                listEl.addEventListener('click', (e) => {
                    // 处理岗位标题点击
                    const titleLink = e.target.closest('.job-title-link');
                    if (titleLink) {
                        state.selectedJobId = titleLink.getAttribute('data-job');
                        navigate('jobDetail');
                        return;
                    }
                    
                    // 处理按钮点击
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const jobId = btn.getAttribute('data-job');
                    const action = btn.getAttribute('data-action');
                    
                    if (action === 'detail') {
                        state.selectedJobId = jobId;
                        navigate('jobDetail');
                    } else if (action === 'remove') {
                        const index = state.favorites.indexOf(jobId);
                        if (index > -1) {
                            state.favorites.splice(index, 1);
                            save('jm_favorites', state.favorites);
                            render();
                        }
                    }
                });
            }
            
            // 处理"去浏览岗位"和"前往登录"按钮
            const routeBtns = document.querySelectorAll('[data-route]');
            routeBtns.forEach(btn => {
                // 排除顶部导航栏的按钮
                if (!btn.closest('.top-nav') && !btn.closest('.dropdown-menu')) {
                    btn.addEventListener('click', () => {
                        navigate(btn.getAttribute('data-route'));
                    });
                }
            });
        }
        if (state.route === 'resume') {
            const backBtn = document.getElementById('backToProfile');
            if (backBtn) {
                backBtn.addEventListener('click', () => navigate('profile'));
            }
            
            const downloadBtn = document.getElementById('downloadResume');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    alert('简历下载功能开发中...\n\n提示：您可以使用浏览器的打印功能（Ctrl+P）将简历保存为PDF');
                });
            }
            
            // 处理空简历时的"前往个人信息"按钮
            const routeBtns = document.querySelectorAll('[data-route]');
            routeBtns.forEach(btn => {
                // 排除顶部导航栏的按钮
                if (!btn.closest('.top-nav') && !btn.closest('.dropdown-menu')) {
                    btn.addEventListener('click', () => {
                        navigate(btn.getAttribute('data-route'));
                    });
                }
            });
        }
        if (state.route === 'applications') {
            const listEl = document.getElementById('applicationsList');
            if (listEl) {
                listEl.addEventListener('click', (e) => {
                    // 处理岗位标题点击
                    const titleLink = e.target.closest('.job-title-link');
                    if (titleLink) {
                        state.selectedJobId = titleLink.getAttribute('data-job');
                        navigate('jobDetail');
                        return;
                    }
                    
                    // 处理按钮点击
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const jobId = btn.getAttribute('data-job');
                    const appIndex = btn.getAttribute('data-app-index');
                    const action = btn.getAttribute('data-action');
                    
                    if (action === 'detail') {
                        state.selectedJobId = jobId;
                        navigate('jobDetail');
                    } else if (action === 'viewResume') {
                        // 查看投递时的简历
                        state.selectedApplicationIndex = Number(appIndex);
                        navigate('applicationResume');
                    } else if (action === 'favorite') {
                        // 添加收藏
                        if (!state.favorites.includes(jobId)) {
                            state.favorites.push(jobId);
                            save('jm_favorites', state.favorites);
                            alert('收藏成功！');
                            render();
                        }
                    }
                });
            }
            
            // 处理"去浏览岗位"和"前往登录"按钮
            const routeBtns = document.querySelectorAll('[data-route]');
            routeBtns.forEach(btn => {
                // 排除顶部导航栏的按钮
                if (!btn.closest('.top-nav') && !btn.closest('.dropdown-menu')) {
                    btn.addEventListener('click', () => {
                        navigate(btn.getAttribute('data-route'));
                    });
                }
            });
        }
        if (state.route === 'applicationResume') {
            const backBtn = document.getElementById('backToApplications');
            if (backBtn) {
                backBtn.addEventListener('click', () => navigate('applications'));
            }
            
            // 处理错误状态时的"返回我的投递"按钮
            const backFromErrorBtn = document.getElementById('backToAppsFromError');
            if (backFromErrorBtn) {
                backFromErrorBtn.addEventListener('click', () => navigate('applications'));
            }
        }
        if (state.route === 'jobDetail') {
            // 如果岗位详情未加载，尝试从API加载
            const allJobs = state.jobs && state.jobs.length > 0 ? state.jobs : jobs;
            let job = allJobs.find(j => j.id === state.selectedJobId);
            
            if (!job && !state.selectedJobDetail && useBackend && state.selectedJobId) {
                // 尝试从API加载岗位详情
                (async () => {
                    try {
                        // 如果是MySQL的ID（格式：mysql_数字），从API加载
                        if (state.selectedJobId.startsWith('mysql_')) {
                            const result = await apiRequest(`/jobs/${state.selectedJobId}`);
                            if (result.success && result.job) {
                                state.selectedJobDetail = result.job;
                                render();
                            }
                        }
                    } catch (error) {
                        console.error('加载岗位详情失败:', error);
                    }
                })();
            }
            
            const backBtn = document.getElementById('backToJobs');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    state.selectedJobDetail = null; // 清除详情缓存
                    navigate('jobs');
                });
            }
            
            const applyBtn = document.getElementById('applyJob');
            if (applyBtn && !applyBtn.disabled) {
                applyBtn.addEventListener('click', () => {
                    if (!state.user) {
                        alert('请先登录后再投递简历');
                        navigate('auth');
                        return;
                    }
                    
                    // 检查是否已生成简历
                    if (!state.resume) {
                        if (confirm('您还没有生成简历，是否前往生成？')) {
                            navigate('profile');
                        }
                        return;
                    }
                    
                    // 保存投递记录，包含简历快照
                    state.applications.push({
                        jobId: state.selectedJobId,
                        appliedAt: new Date().toISOString(),
                        resumeSnapshot: { ...state.resume } // 保存简历快照
                    });
                    save('jm_applications', state.applications);
                    alert('✓ 简历投递成功！');
                    render(); // 重新渲染以显示已投递状态
                });
            }
            
            const favoriteBtn = document.getElementById('favoriteJob');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', () => {
                    const jobId = state.selectedJobId;
                    const index = state.favorites.indexOf(jobId);
                    if (index > -1) {
                        // 取消收藏
                        state.favorites.splice(index, 1);
                        alert('已取消收藏');
                    } else {
                        // 添加收藏
                        state.favorites.push(jobId);
                        alert('收藏成功！');
                    }
                    save('jm_favorites', state.favorites);
                    render(); // 重新渲染以更新按钮状态
                });
            }
        }
        if (state.route === 'auth') {
            if (state.user) {
                document.getElementById('logout').addEventListener('click', () => {
                    state.user = null; save('jm_user', null); updateAuthButton(); navigate('home');
                });
            } else {
                document.getElementById('register').addEventListener('click', () => {
                    const name = document.getElementById('name').value.trim();
                    const email = document.getElementById('email').value.trim();
                    if (!name || !email) { alert('请填写姓名与邮箱'); return; }
                    state.user = { id: Date.now().toString(36), name, email };
                    save('jm_user', state.user); updateAuthButton(); navigate('profile');
                });
            }
        }
    }

    function updateAuthButton() {
        const area = document.getElementById('authArea');
        if (!area) return;
        if (state.user) {
            // 头像优先使用个人资料照片，否则使用姓名首字母
            const name = state.profile?.fullName || state.user.name || '用户';
            const photo = state.profile?.photo || '';
            const initials = name ? name.trim().charAt(0).toUpperCase() : 'U';
            area.innerHTML = `
                <div class="user-chip" id="headerUserChip" title="前往我的信息">
                    ${photo ? `<img class="avatar" src="${photo}" alt="avatar">`
                            : `<span class="avatar">${initials}</span>`}
                    <span style="font-weight:600; color:#123;">${name}</span>
                    <button id="headerLogout" class="btn btn-outline" style="padding:6px 10px; font-size:12px; margin-left:6px;">退出</button>
                </div>
            `;
            const chip = document.getElementById('headerUserChip');
            if (chip) chip.addEventListener('click', (e) => {
                // 避免点击“退出”按钮时跳转
                if (!(e.target && e.target.id === 'headerLogout')) {
                    navigate('profile');
                }
            });
            const logoutBtn = document.getElementById('headerLogout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    state.user = null;
                    save('jm_user', null);
                    updateAuthButton();
                    navigate('home');
                });
            }
        } else {
            area.innerHTML = `<button id="authBtn" class="btn btn-outline" style="padding:8px 12px; font-size:14px;">登录/注册</button>`;
            const btn = document.getElementById('authBtn');
            if (btn) btn.onclick = () => showAuthModal();
        }
    }

    // 顶部登录/注册模态框
    function showAuthModal() {
        // 复用全局样式的 modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0; color:var(--primary);">登录 / 注册</h3>
                    <button id="authModalClose" class="modal-close-btn" style="width:32px; height:32px; border-radius:50%; border:none; background:#f0f0f0; color:#666; cursor:pointer;">&times;</button>
                </div>
                <div style="display:grid; gap:10px;">
                    <label>姓名</label>
                    <input id="modalName" placeholder="你的称呼">
                    <label>邮箱</label>
                    <input id="modalEmail" type="email" placeholder="name@example.com">
                    <label>密码</label>
                    <input id="modalPassword" type="password" placeholder="至少6位">
                    <div id="modalMsg" class="muted" style="min-height:16px; font-size:12px;"></div>
                    <div style="display:flex; gap:8px; margin-top:4px;">
                        <button class="btn btn-primary" id="modalRegister" style="flex:1;">注册</button>
                        <button class="btn btn-outline" id="modalLogin" style="flex:1;">登录</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => { document.body.removeChild(modal); };
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        const closeBtn = document.getElementById('authModalClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        const msg = document.getElementById('modalMsg');
        const doRegister = async () => {
            const name = document.getElementById('modalName').value.trim();
            const email = document.getElementById('modalEmail').value.trim();
            const password = document.getElementById('modalPassword').value.trim();
            if (!name || !email || !password) { if (msg) msg.textContent = '请填写姓名、邮箱和密码'; return; }
            if (password.length < 6) { if (msg) msg.textContent = '密码至少6位'; return; }
            try {
                if (useBackend) {
                    const result = await apiRequest('/register', { method:'POST', body: JSON.stringify({ name, email, password }) });
                    if (result.success) {
                        state.user = result.user; save('jm_user', state.user);
                        const profile = await loadProfileFromBackend(state.user.id);
                        if (profile) { state.profile = profile; save('jm_profile', state.profile); }
                        updateAuthButton(); close(); navigate('profile'); render();
                        return;
                    }
                }
                // 本地降级
                state.user = { id: Date.now().toString(36), name, email }; save('jm_user', state.user);
                updateAuthButton(); close(); navigate('profile'); render();
            } catch (e) { if (msg) msg.textContent = e.message || '注册失败'; }
        };
        const doLogin = async () => {
            const email = document.getElementById('modalEmail').value.trim();
            const password = document.getElementById('modalPassword').value.trim();
            if (!email || !password) { if (msg) msg.textContent = '请填写邮箱和密码'; return; }
            try {
                if (useBackend) {
                    const result = await apiRequest('/login', { method:'POST', body: JSON.stringify({ email, password }) });
                    if (result.success) {
                        state.user = result.user; save('jm_user', state.user);
                        const profile = await loadProfileFromBackend(state.user.id);
                        if (profile) { state.profile = profile; save('jm_profile', state.profile); }
                        updateAuthButton(); close(); navigate('profile'); render();
                        return;
                    }
                }
                if (msg) msg.textContent = '后端服务不可用，请先启动服务器';
            } catch (e) { if (msg) msg.textContent = e.message || '登录失败'; }
        };
        document.getElementById('modalRegister').addEventListener('click', doRegister);
        document.getElementById('modalLogin').addEventListener('click', doLogin);
    }

    // --- Init ---
    // 页面加载时，如果已登录，尝试从后端加载最新资料
    async function initUserProfile() {
        if (state.user && state.user.id && useBackend) {
            try {
                const profile = await loadProfileFromBackend(state.user.id);
                if (profile && Object.keys(profile).length > 0) {
                    // 合并本地和远程资料（远程优先）
                    state.profile = { ...state.profile, ...profile };
                    save('jm_profile', state.profile);
                }
            } catch (error) {
                console.log('初始化时加载用户资料失败，使用本地缓存:', error.message);
            }
        }
    }

    // 初始化时尝试从知识图谱获取职位列表
    async function initKGJobTitles() {
        if (useBackend) {
            try {
                const result = await apiRequest('/kg/jobs');
                if (result.success && result.jobs && Array.isArray(result.jobs) && result.jobs.length > 0) {
                    // 后端返回的结构为 [{ id, title, ... }]，这里只需要职位名称字符串
                    state.kgJobTitles = result.jobs
                        .map(j => j.title)
                        .filter(Boolean);
                    console.log('已从知识图谱加载职位列表:', state.kgJobTitles.length, '个职位');
                }
            } catch (error) {
                console.log('无法从知识图谱加载职位列表，使用本地数据');
            }
        }
    }

    // 从后端API加载岗位列表（从MySQL）
    async function loadJobsFromAPI() {
        if (!useBackend) {
            console.log('后端不可用，使用本地岗位数据');
            return;
        }
        
        try {
            const result = await apiRequest('/jobs');
            if (result.success && result.jobs && Array.isArray(result.jobs)) {
                state.jobs = result.jobs;
                console.log(`✅ 已从${result.source || 'API'}加载 ${result.jobs.length} 个岗位`);
                // 如果当前在岗位浏览页面、收藏页面或投递页面，重新渲染
                if (state.route === 'jobs' || state.route === 'favorites' || state.route === 'applications') {
                    render();
                }
            } else {
                console.log('API返回的岗位数据格式不正确，使用本地数据');
            }
        } catch (error) {
            console.log('无法从API加载岗位数据，使用本地数据:', error.message);
        }
    }

    topNavInit();
    
    // 初始化：测试后端连接并加载数据
    (async () => {
        // 先测试后端连接
        const backendAvailable = await testBackendConnection();
        
        // 并行加载数据
        await Promise.all([
            initUserProfile(),
            initKGJobTitles(),
            backendAvailable ? loadJobsFromAPI() : Promise.resolve()
        ]);
        
        render();
    })();
})();



