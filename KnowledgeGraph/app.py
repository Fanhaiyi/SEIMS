"""
知识图谱数据库服务 - Flask应用
提供职位技能查询的RESTful API接口
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from py2neo import Graph, NodeMatcher
import logging
import sys

# 能力→岗位匹配算法（复用岗位→能力知识图谱）
from abilityToJob.matcher import match_skills_to_jobs

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 连接Neo4j数据库
try:
    graph = Graph("bolt://localhost:7687", auth=("neo4j", "20041028"))
    matcher = NodeMatcher(graph)
    logger.info("成功连接到Neo4j数据库")
except Exception as e:
    logger.error(f"连接Neo4j失败: {str(e)}")
    graph = None
    matcher = None

@app.route('/')
def index():
    """主页"""
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>知识图谱数据库服务</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #2b66ff; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
            .endpoint { margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #2b66ff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 知识图谱数据库服务</h1>
            <p>服务正在运行中...</p>
            <h2>API端点：</h2>
            <div class="endpoint">
                <strong>GET /api/domains</strong><br>
                获取所有领域列表
            </div>
            <div class="endpoint">
                <strong>GET /api/skills/&lt;domain_name&gt;</strong><br>
                获取指定领域的技能列表
            </div>
            <div class="endpoint">
                <strong>GET /api/stats</strong><br>
                获取数据库统计信息
            </div>
        </div>
    </body>
    </html>
    '''

@app.route('/api/domains', methods=['GET'])
def get_domains():
    """获取所有领域/岗位列表 - 兼容新旧数据库结构"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        # 首先尝试新数据库结构（Position节点）
        query_new = "MATCH (p:Position) RETURN p.name as name ORDER BY p.name"
        result_new = graph.run(query_new).data()
        
        if result_new:
            domains = [row['name'] for row in result_new]
            return jsonify({
                'success': True,
                'domains': domains,
                'type': 'Position'  # 标识使用的是新结构
            })
        
        # 如果新结构查询不到，尝试旧结构（领域节点）
        query_old = "MATCH (d:领域) RETURN d.name as name ORDER BY d.name"
        result_old = graph.run(query_old).data()
        
        if result_old:
            domains = [row['name'] for row in result_old]
            return jsonify({
                'success': True,
                'domains': domains,
                'type': 'Domain'  # 标识使用的是旧结构
            })
        
        # 如果都查询不到，返回空列表
        return jsonify({
            'success': True,
            'domains': [],
            'message': '数据库中没有找到岗位或领域数据'
        })
        
    except Exception as e:
        logger.error(f"查询领域失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/skills/<domain_name>', methods=['GET'])
def get_skills(domain_name):
    """获取指定领域的技能列表"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        # 查询该领域下所有二级分类（技能）
        query = """
        MATCH (d:领域 {name: $domain_name})-[:包含]->(c:一级分类)-[:包含]->(s:二级分类)
        OPTIONAL MATCH (c)-[r:包含]->(s)
        RETURN s.name as skill, s.domain as domain, r.weight as weight
        ORDER BY r.weight DESC, s.name
        """
        result = graph.run(query, domain_name=domain_name).data()
        
        skills = []
        for row in result:
            if row['skill']:
                skills.append({
                    'skill': row['skill'],
                    'level': round(float(row['weight']) if row['weight'] else 3, 1)
                })
        
        return jsonify({
            'success': True,
            'domain': domain_name,
            'skills': skills
        })
    except Exception as e:
        logger.error(f"查询技能失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/query-job-skills', methods=['POST'])
def query_job_skills():
    """根据职位名称查询所需技能 - 兼容新旧数据库结构"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        data = request.get_json()
        job_title = data.get('job_title', '')
        
        if not job_title:
            return jsonify({
                'success': False,
                'message': '请提供职位名称'
            }), 400
        
        # 首先尝试新的数据库结构（Skill->Position）
        # 查询：给定岗位名称，查找所有连接到该岗位的技能
        query_new = """
        MATCH (s:Skill)-[r:RELATES_TO]->(p:Position {name: $job_title})
        RETURN s.name as skill, r.weight as weight, s.type as category
        ORDER BY r.weight DESC, s.name
        """
        result_new = graph.run(query_new, job_title=job_title).data()
        
        if result_new:
            # 使用新数据库结构
            skills = []
            for row in result_new:
                if row['skill']:
                    weight = float(row['weight']) if row['weight'] is not None else 3.0
                    # 将0-1范围的权重映射到1-10的等级，然后映射到1-5级显示
                    if weight < 1:
                        level = int(weight * 10)  # 0-1映射到0-10
                    else:
                        level = min(int(weight), 10)  # ≥1映射到1-10
                    level = max(level, 1)  # 至少为1
                    # 映射到1-5级显示（前端使用）
                    if level <= 2:
                        display_level = 1
                    elif level <= 4:
                        display_level = 2
                    elif level <= 6:
                        display_level = 3
                    elif level <= 8:
                        display_level = 4
                    else:
                        display_level = 5
                    
                    category = row.get('category', '')
                    if category is None:
                        category = ''
                    # 确保category是"硬实力"或"软实力"
                    if category not in ['硬实力', '软实力']:
                        category = '硬实力' if category == '硬实力' else '软实力'
                    
                    skills.append({
                        'skill': row['skill'],
                        'level': display_level,
                        'category': category  # 硬实力 或 软实力
                    })
            
            return jsonify({
                'success': True,
                'skills': skills
            })
        
        # 如果新结构查询失败，尝试旧结构（领域->一级分类->二级分类）
        query_old = """
        MATCH (d:领域 {name: $job_title})-[:包含]->(c:一级分类)
        MATCH (c)-[r:包含]->(s:二级分类)
        RETURN s.name as skill, r.weight as weight, c.name as category
        ORDER BY r.weight DESC, s.name
        """
        result_old = graph.run(query_old, job_title=job_title).data()
        
        if result_old:
            skills = []
            for row in result_old:
                if row['skill']:
                    weight = float(row['weight']) if row['weight'] is not None else 3.0
                    # 将0-1范围的权重映射到1-10的等级
                    level = int(weight * 10) if weight < 1 else min(int(weight), 10)
                    level = max(level, 1)  # 至少为1
                    # 映射到1-5级显示
                    if level <= 2:
                        display_level = 1
                    elif level <= 4:
                        display_level = 2
                    elif level <= 6:
                        display_level = 3
                    elif level <= 8:
                        display_level = 4
                    else:
                        display_level = 5
                    
                    category = row.get('category', '')
                    if category is None:
                        category = ''
                    skills.append({
                        'skill': row['skill'],
                        'level': display_level,
                        'category': category  # 硬实力 或 软实力
                    })
            
            return jsonify({
                'success': True,
                'skills': skills
            })
        
        # 如果两种结构都查询不到，返回空结果
        return jsonify({
            'success': True,
            'skills': [],
            'message': f'未找到岗位 "{job_title}" 的技能信息'
        })
        
    except Exception as e:
        logger.error(f"查询职位技能失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    """获取所有职位列表 - 兼容新旧数据库结构"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        # 首先尝试新数据库结构（Position节点）
        query_new = "MATCH (p:Position) RETURN p.name as name ORDER BY p.name"
        result_new = graph.run(query_new).data()
        
        if result_new:
            jobs = [row['name'] for row in result_new]
            return jsonify({
                'success': True,
                'jobs': jobs,
                'type': 'Position'
            })
        
        # 如果新结构查询不到，尝试旧结构（领域节点）
        query_old = "MATCH (d:领域) RETURN d.name as name ORDER BY d.name"
        result_old = graph.run(query_old).data()
        
        if result_old:
            jobs = [row['name'] for row in result_old]
            return jsonify({
                'success': True,
                'jobs': jobs,
                'type': 'Domain'
            })
        
        # 如果都查询不到，返回空列表
        return jsonify({
            'success': True,
            'jobs': [],
            'message': '数据库中没有找到职位数据'
        })
        
    except Exception as e:
        logger.error(f"查询职位列表失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/query-skills-to-jobs', methods=['POST'])
def query_skills_to_jobs():
    """根据技能列表查询匹配的岗位 - 使用岗位→能力知识图谱进行相似度计算"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        data = request.get_json() or {}
        skills = data.get('skills', [])

        # 确保 skills 为列表
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(',') if s.strip()]

        if not skills:
            return jsonify({
                'success': False,
                'message': '请提供至少一个技能'
            }), 400

        jobs, input_count, normalized_skills = match_skills_to_jobs(graph, skills)

        return jsonify({
            'success': True,
            'jobs': jobs,
            'input_skills_count': input_count,
            'input_skills': normalized_skills,
            'message': f'找到 {len(jobs)} 个匹配的岗位' if jobs else '未找到匹配的岗位'
        })
        
    except Exception as e:
        logger.error(f"查询技能->岗位失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500


@app.route('/api/all-skills', methods=['GET'])
def all_skills():
    """返回所有二级技能列表，并区分硬实力 / 软实力"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        query = """
        MATCH (s:二级分类)
        RETURN DISTINCT s.name as name, s.category_type as category
        ORDER BY name
        """
        result = graph.run(query).data()

        hard = []
        soft = []
        unknown = []

        for row in result:
            name = row.get('name')
            cat = row.get('category') or ''
            if not name:
                continue
            if cat == '硬实力':
                hard.append(name)
            elif cat == '软实力':
                soft.append(name)
            else:
                unknown.append(name)

        return jsonify({
            'success': True,
            'hard_skills': hard,
            'soft_skills': soft,
            'unknown_skills': unknown
        })
    except Exception as e:
        logger.error(f"查询全部技能失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """获取数据库统计信息"""
    if not graph:
        return jsonify({
            'success': False,
            'message': 'Neo4j数据库未连接'
        }), 503
    
    try:
        # 统计节点数量
        node_count_query = "MATCH (n) RETURN count(n) as count"
        node_count = graph.run(node_count_query).data()[0]['count']
        
        # 统计领域数量
        domain_count_query = "MATCH (d:领域) RETURN count(d) as count"
        domain_count = graph.run(domain_count_query).data()[0]['count']
        
        # 统计技能数量（二级分类）
        skill_count_query = "MATCH (s:二级分类) RETURN count(s) as count"
        skill_count = graph.run(skill_count_query).data()[0]['count']
        
        return jsonify({
            'success': True,
            'stats': {
                'total_nodes': node_count,
                'domains': domain_count,
                'skills': skill_count
            }
        })
    except Exception as e:
        logger.error(f"查询统计信息失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'查询失败: {str(e)}'
        }), 500

@app.route('/api/health', methods=['GET'])
def health():
    """健康检查端点"""
    if graph:
        try:
            # 尝试运行一个简单查询
            graph.run("RETURN 1")
            return jsonify({
                'success': True,
                'status': 'healthy',
                'neo4j': 'connected'
            })
        except:
            return jsonify({
                'success': False,
                'status': 'unhealthy',
                'neo4j': 'disconnected'
            }), 503
    else:
        return jsonify({
            'success': False,
            'status': 'unhealthy',
            'neo4j': 'not_initialized'
        }), 503

if __name__ == '__main__':
    # 检查Neo4j连接
    if not graph:
        logger.error("Neo4j数据库连接失败，无法启动服务")
        sys.exit(1)
    
    logger.info("=" * 60)
    logger.info("🚀 知识图谱数据库服务启动中...")
    logger.info("=" * 60)
    logger.info("📡 服务地址: http://localhost:5000")
    logger.info("📚 API文档: http://localhost:5000")
    logger.info("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)

