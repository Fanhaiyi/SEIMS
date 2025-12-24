import os
import uuid
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from neo4j import GraphDatabase
from dotenv import load_dotenv
from fastapi import Body


# ==================== 加载 Backend/.env 配置 ====================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ENV_PATH = os.path.join(BASE_DIR, "..", "Backend", ".env")

# 优先加载 Backend 目录下的 .env（如果存在）
if os.path.exists(BACKEND_ENV_PATH):
    load_dotenv(BACKEND_ENV_PATH)
else:
    # 退而求其次，加载当前目录下的 .env（如果你单独为 KGBackend 配置了 .env）
    load_dotenv(os.path.join(BASE_DIR, ".env"))


# ==================== 配置 ====================

# 优先使用专门为图谱服务准备的 KG_NEO4J_* 变量；
# 如果没有配置，则自动复用 Backend/.env 中的 NEO4J_* 变量（你已经写好的这一组）。
KG_NEO4J_URI = os.getenv("KG_NEO4J_URI") or os.getenv("NEO4J_URI", "bolt://localhost:7687")
KG_NEO4J_USER = os.getenv("KG_NEO4J_USER") or os.getenv("NEO4J_USER", "neo4j")
# 出于安全考虑，不给默认密码，必须通过环境变量或 .env 提供
KG_NEO4J_PASSWORD = os.getenv("KG_NEO4J_PASSWORD") or os.getenv("NEO4J_PASSWORD")

if not KG_NEO4J_PASSWORD:
    print("⚠️  KG_NEO4J_PASSWORD 未设置，将无法连接图数据库，请在 Backend/.env 或环境变量中配置。")


driver = GraphDatabase.driver(
    KG_NEO4J_URI,
    auth=(KG_NEO4J_USER, KG_NEO4J_PASSWORD) if KG_NEO4J_PASSWORD else None,
)


app = FastAPI(
    title="Job Matching Knowledge Graph Backend",
    description="图谱2 后端服务：岗位-能力知识图谱 API",
    version="1.0.0",
)


# ==================== Pydantic 模型 ====================


class JobSkillsRequest(BaseModel):
    job_title: str


class SkillsToJobsRequest(BaseModel):
    skills: List[str]  # 技能名称列表
    skill_levels: Optional[Dict[str, int]] = None  # 技能名称 -> 熟练度(1-5)的映射


# ==================== Neo4j 辅助函数 ====================


def run_query(query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not KG_NEO4J_PASSWORD:
        raise RuntimeError("KG_NEO4J_PASSWORD 未设置，无法连接 Neo4j")

    with driver.session() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]


# ==================== 健康检查 ====================


@app.get("/api/health")
def health_check():
    try:
        _ = run_query("RETURN 1 AS ok")
        return {"success": True, "message": "Neo4j 连接正常"}
    except Exception as e:
        return {
            "success": False,
            "message": f"Neo4j 连接失败: {e}",
        }


# ==================== 技能列表 ====================


@app.get("/api/all-skills")
def get_all_skills():
    """
    返回知识图谱中的所有技能列表，按硬实力 / 软实力划分。
    这里假设 Skill 节点有属性：
    - name: 技能名称
    - category: '硬实力' 或 '软实力'（可选）
    """
    try:
        # 当前图谱结构：
        # - Page: 岗位大类
        # - Category: 能力类别（区分硬实力 / 软实力），属性 type 表示类别
        # - Skill: 具体技能
        # - 关系：Page-[:HAS_CATEGORY]->Category-[:HAS_SKILL]->Skill
        #
        # 这里按 Category.type 将技能划分为硬实力 / 软实力
        records = run_query(
            """
            MATCH (c:Category)-[:HAS_SKILL]->(s:Skill)
            WHERE s.name IS NOT NULL
            RETURN DISTINCT s.name AS skill, coalesce(c.type, '') AS type
            ORDER BY skill
            """
        )

        hard_skills: List[str] = []
        soft_skills: List[str] = []

        for r in records:
            name = r.get("skill")
            ctype = (r.get("type") or "").strip().lower()
            if not name:
                continue

            # Category.type: 'soft' 表示软实力，'hard' 表示硬实力
            if ctype == "soft":
                soft_skills.append(name)
            elif ctype == "hard":
                hard_skills.append(name)
            else:
                # 未标明类型的技能，默认归入硬实力
                hard_skills.append(name)

        return {
            "success": True,
            "hard_skills": hard_skills,
            "soft_skills": soft_skills,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取技能列表失败: {e}")


# ==================== 岗位 -> 技能 ====================


@app.post("/api/query-job-skills")
def query_job_skills(req: JobSkillsRequest):
    """
    根据岗位名称查询该岗位需要的技能。

    这里假设图谱结构：
    (:Job {title})-[:REQUIRES {level, weight}]->(:Skill {name, category})
    """
    title = (req.job_title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="job_title 不能为空")

    try:
        # 适配当前图结构：
        # (:Page)-[:HAS_CATEGORY]->(:Category {type})-[:HAS_SKILL {weight}]->(:Skill {name})
        # 其中 Page 表示岗位大类，Category.type 表示硬实力 / 软实力
        records = run_query(
            """
            MATCH (p:Page)-[:HAS_CATEGORY]->(c:Category)-[r:HAS_SKILL]->(s:Skill)
            WHERE toLower(coalesce(p.pageName, p.name)) = toLower($title)
            RETURN s.name AS skill,
                   coalesce(r.weight, 3) AS level,
                   coalesce(c.type, '') AS category_type
            ORDER BY level DESC, skill
            """,
            {"title": title},
        )

        # 先收集所有权重值，用于计算1-5级映射
        raw_weights = []
        skill_data = []
        for r in records:
            name = r.get("skill")
            if not name:
                continue
            weight = r.get("level") or 0.0  # 这里的 level 实际是权重值
            raw_type = (r.get("category_type") or "").strip().lower()

            # 统一映射为前端识别的 "硬实力" / "软实力"
            if raw_type == "soft":
                cat = "软实力"
            elif raw_type == "hard":
                cat = "硬实力"
            else:
                # 未知类型时，默认当硬实力，避免全部落到软实力列
                cat = "硬实力"

            raw_weights.append(weight)
            skill_data.append({
                "skill": name,
                "weight": weight,
                "category": cat,
            })

        # 将权重值映射到1-5级
        # 方法：按百分位数划分（0-20% -> 1级, 20-40% -> 2级, 40-60% -> 3级, 60-80% -> 4级, 80-100% -> 5级）
        if raw_weights:
            sorted_weights = sorted(raw_weights)
            min_weight = sorted_weights[0]
            max_weight = sorted_weights[-1]
            weight_range = max_weight - min_weight if max_weight > min_weight else 1.0

            def weight_to_level(weight: float) -> int:
                """将权重值映射到1-5级"""
                if weight_range == 0:
                    return 3  # 所有权重相同，默认3级
                # 归一化到0-1
                normalized = (weight - min_weight) / weight_range
                # 映射到1-5级
                if normalized < 0.2:
                    return 1
                elif normalized < 0.4:
                    return 2
                elif normalized < 0.6:
                    return 3
                elif normalized < 0.8:
                    return 4
                else:
                    return 5

            skills = [
                {
                    "skill": item["skill"],
                    "level": weight_to_level(item["weight"]),
                    "category": item["category"],
                }
                for item in skill_data
            ]
        else:
            skills = []

        return {
            "success": True,
            "job_title": title,
            "skills": skills,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询岗位技能失败: {e}")


# ==================== 技能 -> 岗位匹配 ====================


@app.post("/api/query-skills-to-jobs")
def query_skills_to_jobs(req: SkillsToJobsRequest):
    """
    根据一组技能匹配岗位，使用能力覆盖率+熟练度加权算法计算匹配分数（0-100分）。
    
    算法：
    1. 能力覆盖率得分（40分）：用户能力覆盖岗位所需能力的比例
    2. 熟练度加权得分（60分）：基于权重和熟练度的加权平均
    """
    if not req.skills:
        raise HTTPException(status_code=400, detail="至少需要一个技能")

    # 规范化输入技能（去重、小写）
    input_skills_raw = [s.strip() for s in req.skills if s and s.strip()]
    if not input_skills_raw:
        raise HTTPException(status_code=400, detail="至少需要一个有效技能")

    input_skills_lower = sorted({s.lower() for s in input_skills_raw})
    # 技能名称 -> 熟练度映射（默认1分）
    skill_levels = req.skill_levels or {}
    skill_levels_lower = {k.lower(): v for k, v in skill_levels.items()}

    try:
        # 查询每个岗位所需的所有技能及其权重
        # 图结构：(p:Page)-[:HAS_CATEGORY]->(c:Category)-[r:HAS_SKILL {weight}]->(s:Skill)
        records = run_query(
            """
            WITH $skills AS inputSkills
            MATCH (p:Page)-[:HAS_CATEGORY]->(c:Category)-[r:HAS_SKILL]->(s:Skill)
            WITH p, 
                 collect({
                     skill: s.name,
                     weight: coalesce(r.weight, 0.0),
                     category: coalesce(c.type, '')
                 }) AS allSkills,
                 collect(DISTINCT CASE WHEN toLower(s.name) IN inputSkills THEN s.name END) AS matchedSkillNames
            WHERE size(matchedSkillNames) > 0
            RETURN
                coalesce(p.pageName, p.name) AS job_name,
                allSkills AS job_skills,
                matchedSkillNames AS matched_skills
            ORDER BY size(matchedSkillNames) DESC, job_name
            """,
            {"skills": input_skills_lower},
        )

        jobs = []
        for r in records:
            job_name = r.get("job_name") or ""
            job_skills_raw = r.get("job_skills") or []
            matched_skill_names = [s for s in (r.get("matched_skills") or []) if s]

            if not job_skills_raw:
                continue

            # 处理岗位所需技能：去重，保留每个技能的最大权重
            job_skills_map = {}  # skill_name_lower -> {name, weight, category}
            for item in job_skills_raw:
                skill_name = item.get("skill", "").strip()
                if not skill_name:
                    continue
                skill_name_lower = skill_name.lower()
                weight = float(item.get("weight") or 0.0)
                
                if skill_name_lower not in job_skills_map:
                    job_skills_map[skill_name_lower] = {
                        "name": skill_name,
                        "weight": weight,
                        "category": item.get("category", "").strip().lower()
                    }
                else:
                    # 如果同一技能有多个权重，取最大值
                    if weight > job_skills_map[skill_name_lower]["weight"]:
                        job_skills_map[skill_name_lower]["weight"] = weight

            job_skills_list = list(job_skills_map.values())
            n = len(job_skills_list)  # 岗位所需能力总数

            if n == 0:
                continue  # 跳过无效数据

            # 计算权重总和（用于归一化）
            total_weight = sum(s["weight"] for s in job_skills_list)
            if total_weight == 0:
                total_weight = 1.0  # 避免除零

            # 步骤1：计算能力覆盖率得分（40分）
            # 找出用户与岗位的交集能力
            matched_skills_lower = {s.lower() for s in matched_skill_names}
            intersection_skills = [
                s for s in job_skills_list 
                if s["name"].lower() in matched_skills_lower
            ]
            k = len(intersection_skills)  # 交集能力个数

            if k == 0:
                # 无交集，得分为0
                match_percentage = 0.0
            else:
                # 覆盖率 = k / n
                coverage = k / n
                coverage_score = coverage * 40.0

                # 步骤2：计算熟练度加权得分（60分）
                weighted_sum = 0.0
                for skill in intersection_skills:
                    skill_name_lower = skill["name"].lower()
                    user_level = skill_levels_lower.get(skill_name_lower, 1)  # 默认1分
                    weight = skill["weight"]
                    weighted_sum += user_level * weight

                # 加权熟练度均值 = 加权熟练度总和 / 权重总和
                weighted_avg = weighted_sum / total_weight
                # 熟练度得分 = (加权熟练度均值 / 5) × 60
                proficiency_score = (weighted_avg / 5.0) * 60.0

                # 步骤3：计算最终匹配分数
                match_percentage = round(coverage_score + proficiency_score, 2)
                # 确保在0-100范围内
                match_percentage = max(0.0, min(100.0, match_percentage))

            # 统计硬实力/软实力数量
            hard_count = sum(1 for s in job_skills_list if s["category"] == "hard")
            soft_count = sum(1 for s in job_skills_list if s["category"] == "soft")

            jobs.append(
                {
                    "job_name": job_name,
                    "matched_skills": matched_skill_names,
                    "match_count": k,
                    "total_weight": total_weight,
                    "match_percentage": match_percentage,
                    "hard_skills_count": hard_count,
                    "soft_skills_count": soft_count,
                }
            )

        # 按匹配分数降序排序
        jobs.sort(key=lambda x: x["match_percentage"], reverse=True)

        return {
            "success": True,
            "jobs": jobs,
            "input_skills": input_skills_raw,
            "input_skills_count": len(input_skills_raw),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"技能→岗位查询失败: {e}")


# ==================== 岗位列表（知识图谱） ====================


@app.get("/api/jobs")
def list_jobs():
    """
    返回图谱中的岗位列表。
    这里只返回基础信息，具体岗位详情由 MySQL 提供。
    """
    try:
        # 使用 Page 作为岗位大类
        records = run_query(
            """
            MATCH (p:Page)
            WITH coalesce(p.pageName, p.name) AS title
            WHERE title IS NOT NULL AND title <> ''
            RETURN DISTINCT title
            ORDER BY title
            """
        )

        jobs = [
            {
                "id": f"kg_{idx}",
                "title": r.get("title") or "未命名岗位",
            }
            for idx, r in enumerate(records)
        ]

        return {"success": True, "jobs": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取岗位列表失败: {e}")


@app.get("/api/domains")
def list_domains():
    """
    兼容旧版接口：返回岗位大类（这里与 /api/jobs 相同结构）。
    """
    jobs_resp = list_jobs()
    # 旧接口字段名为 domains
    return {"success": True, "domains": jobs_resp.get("jobs", [])}

# ==================== Page 列表接口 ====================
@app.get("/api/pages")
def list_pages():
    """
    返回图谱中的 Page 节点列表（岗位大类），适配前端 /api/kg/pages 调用需求
    核心修复：同时返回数字ID和elementId，兼容新旧调用链路
    """
    try:
        records = run_query(
            """
            MATCH (p:Page)
            WITH coalesce(p.pageName, p.name) AS page_name, 
                 id(p) AS page_id, 
                 elementId(p) AS element_id
            WHERE page_name IS NOT NULL AND page_name <> ''
            RETURN DISTINCT page_id, element_id, page_name
            ORDER BY page_name
            """
        )

        pages = [
            {
                "id": str(r.get("page_id")),          # 数字ID（兼容原有前端）
                "element_id": r.get("element_id"),    # elementId（兼容新逻辑）
                "name": r.get("page_name") or "未命名分类",
            }
            for r in records
        ]

        return {"success": True, "pages": pages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 Page 列表失败: {e}")
    
# ==================== 图谱可视化接口 ====================
@app.post("/api/graph-visualization")
def get_graph_visualization(
    page_id: Optional[str] = Body(None, embed=True),
    element_id: Optional[str] = Body(None, embed=True)
):
    """
    根据Page ID查询图谱节点和关系，返回vis-network兼容格式
    核心修复：
    1. 同时支持数字page_id和element_id查询（无需改动前端）
    2. 消除Neo4j废弃警告
    3. 边ID唯一化，避免重复
    4. 节点名称兼容，减少"未命名"
    """
    try:
        # 1. 校验参数（至少传一个ID）
        if not page_id and not element_id:
            raise HTTPException(status_code=400, detail="必须传入page_id或element_id")
        
        # 2. 构建查询条件（兼容数字ID和elementId）
        query_params = {}
        if page_id and page_id.isdigit():
            # 数字ID查询（原有链路）
            query = """
                MATCH (p:Page)-[r1:HAS_CATEGORY]->(c:Category)-[r2:HAS_SKILL]->(s:Skill)
                WHERE id(p) = $page_id
                RETURN 
                    id(p) AS page_id, 
                    elementId(p) AS element_id,
                    p.pageName AS page_name,
                    p.name AS page_alt_name,
                    id(c) AS category_id,
                    elementId(c) AS category_element_id,
                    c.name AS category_name, 
                    c.type AS category_type,
                    id(s) AS skill_id,
                    elementId(s) AS skill_element_id,
                    s.name AS skill_name,
                    r1.weight AS r1_weight, 
                    r2.weight AS r2_weight
            """
            query_params["page_id"] = int(page_id)
        elif element_id:
            # elementId查询（新链路）
            query = """
                MATCH (p:Page)-[r1:HAS_CATEGORY]->(c:Category)-[r2:HAS_SKILL]->(s:Skill)
                WHERE elementId(p) = $element_id
                RETURN 
                    id(p) AS page_id, 
                    elementId(p) AS element_id,
                    p.pageName AS page_name,
                    p.name AS page_alt_name,
                    id(c) AS category_id,
                    elementId(c) AS category_element_id,
                    c.name AS category_name, 
                    c.type AS category_type,
                    id(s) AS skill_id,
                    elementId(s) AS skill_element_id,
                    s.name AS skill_name,
                    r1.weight AS r1_weight, 
                    r2.weight AS r2_weight
            """
            query_params["element_id"] = element_id
        else:
            raise HTTPException(status_code=400, detail="page_id必须是数字或传入有效的element_id")
        
        # 3. 执行查询
        records = run_query(query, query_params)

        # 4. 构建节点和边（去重+名称兼容）
        nodes = []
        edges = []
        nodeMap = {}  # 节点去重：id -> node
        edgeMap = {}  # 边去重：id -> edge

        if records:
            # 处理Page节点
            page_data = records[0]
            page_display_id = str(page_data["page_id"])  # 统一用数字ID显示（兼容前端）
            pageName = page_data["page_name"] or page_data["page_alt_name"] or '未命名岗位大类'
            
            nodeMap[page_display_id] = {
                "id": page_display_id,
                "label": pageName,
                "type": "Page",
                "element_id": page_data["element_id"]  # 保留elementId备用
            }

            # 遍历Category和Skill
            for r in records:
                # 处理Category节点
                cat_display_id = str(r["category_id"])
                catName = r["category_name"] or '未命名类别'
                if cat_display_id not in nodeMap:
                    nodeMap[cat_display_id] = {
                        "id": cat_display_id,
                        "label": catName,
                        "type": "Category",
                        "category_type": r["category_type"] or "",
                        "element_id": r["category_element_id"]
                    }

                # 处理Skill节点
                skill_display_id = str(r["skill_id"])
                skillName = r["skill_name"] or '未命名技能'
                if skill_display_id not in nodeMap:
                    nodeMap[skill_display_id] = {
                        "id": skill_display_id,
                        "label": skillName,
                        "type": "Skill",
                        "element_id": r["skill_element_id"]
                    }

                # 处理Page->Category边（唯一ID+去重）
                edge1Id = f"r1_{page_display_id}_{cat_display_id}_{str(uuid.uuid4())[:4]}"
                if edge1Id not in edgeMap:
                    edgeMap[edge1Id] = {
                        "id": edge1Id,
                        "from": page_display_id,
                        "to": cat_display_id,
                        "type": "HAS_CATEGORY",
                        "label": str(r["r1_weight"] or 0),
                        "properties": {"weight": r["r1_weight"] or 0}
                    }

                # 处理Category->Skill边（唯一ID+去重）
                edge2Id = f"r2_{cat_display_id}_{skill_display_id}_{str(uuid.uuid4())[:4]}"
                if edge2Id not in edgeMap:
                    edgeMap[edge2Id] = {
                        "id": edge2Id,
                        "from": cat_display_id,
                        "to": skill_display_id,
                        "type": "HAS_SKILL",
                        "label": str(r["r2_weight"] or 0),
                        "properties": {"weight": r["r2_weight"] or 0}
                    }

        # 转换为列表（确保无重复）
        nodes = list(nodeMap.values())
        edges = list(edgeMap.values())

        return {
            "success": True,
            "nodes": nodes,
            "edges": edges
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图谱查询失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("KG_PORT", "5000")),
        reload=True,
    )