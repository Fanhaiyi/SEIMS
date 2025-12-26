"""
能力 → 岗位匹配算法

复用岗位→能力知识图谱（领域/岗位 -> 一级分类(硬/软实力) -> 二级分类技能），
根据用户输入的技能列表，计算每个岗位的匹配度得分：

1. 岗位的必备能力集合 {c_k} 及其权重 w_k（来自关系 r.weight）；
2. 用户输入能力集合 {a_j}，默认熟练度 s_j = 1；
3. 匹配度 m_k = 相似度得分 × 熟练度：
   - 完全相同：相似度 = 1
   - 大小写差异 / 前后空格忽略
   - 其余情况暂按 0（如需“近似 0.7”可在此扩展同义词映射）；
4. 推荐分数 Score = 100 × Σ (w_k_norm × m_k)，其中 w_k_norm 为对该岗位所有技能权重归一化后结果。

返回结构与现有后端保持一致：
  - job_name
  - match_count
  - match_percentage (0~100)
  - total_weight (匹配到的原始权重之和)
  - matched_skills: 每个元素含 skill, weight, category
  - hard_skills_count / soft_skills_count
"""

from typing import List, Dict, Any, Tuple


def _normalize_skill_name(name: str) -> str:
    """规范化技能名称，用于简单的字符串相似度匹配。"""
    if not isinstance(name, str):
        return ""
    return name.strip().lower()


def match_skills_to_jobs(graph, skills: List[str]) -> Tuple[List[Dict[str, Any]], int, List[str]]:
    """
    使用岗位→能力知识图谱进行能力→岗位匹配。

    Parameters
    ----------
    graph : py2neo.Graph
        已连接的 Neo4j 图数据库实例（同 app.py 中的全局 graph）。
    skills : list[str]
        用户输入的技能名称列表。

    Returns
    -------
    jobs : list[dict]
        匹配到的岗位列表（结构与原 /api/query-skills-to-jobs 接口返回一致）。
    input_skills_count : int
        输入技能数量。
    normalized_input_skills : list[str]
        归一化后的输入技能名称（用于调试与前端展示）。
    """
    if not skills:
        return [], 0, []

    # 统一规范化输入技能名字
    normalized_input = [_normalize_skill_name(s) for s in skills if _normalize_skill_name(s)]
    if not normalized_input:
        return [], 0, []

    # 从岗位→能力图谱中获取每个岗位的技能及权重
    cypher = """
    MATCH (d:领域)-[:包含]->(c:一级分类)-[r:包含]->(s:二级分类)
    RETURN d.name as job_name,
           collect({
               skill: s.name,
               weight: coalesce(r.weight, 0.0),
               category: c.name
           }) as skills
    """

    records = graph.run(cypher).data()

    jobs: List[Dict[str, Any]] = []

    for row in records:
        job_name = row.get("job_name")
        all_skills = row.get("skills", []) or []

        # 计算该岗位所有技能权重之和，用作归一化分母
        total_weight_all = 0.0
        for info in all_skills:
            try:
                total_weight_all += float(info.get("weight") or 0.0)
            except (TypeError, ValueError):
                continue

        if total_weight_all <= 0:
            # 没有有效权重，跳过该岗位
            continue

        matched_skills = []
        total_weight_matched = 0.0

        hard_count = 0
        soft_count = 0

        for info in all_skills:
            skill_name = info.get("skill")
            norm_skill_name = _normalize_skill_name(skill_name)
            if not norm_skill_name:
                continue

            # 简单相似度：字符串相同视为完全匹配
            if norm_skill_name in normalized_input:
                w = 0.0
                try:
                    w = float(info.get("weight") or 0.0)
                except (TypeError, ValueError):
                    w = 0.0

                if w <= 0:
                    continue

                # m_k = 相似度(1) × 熟练度(默认1) = 1
                # Score 后面通过归一化 Σ(w_k_norm × m_k) 计算
                total_weight_matched += w

                category = info.get("category") or ""
                if category == "硬实力":
                    hard_count += 1
                elif category == "软实力":
                    soft_count += 1

                matched_skills.append({
                    "skill": skill_name,
                    "weight": w,
                    "category": category
                })

        match_count = len(matched_skills)
        if match_count == 0:
            # 没有匹配到任何技能，跳过该岗位
            continue

        # Score = 100 × Σ (w_k_norm × m_k)，这里 m_k = 1，因此等效为：
        # Score = 100 × (匹配到的权重之和 / 全部权重之和)
        score = 0
        if total_weight_all > 0:
            score = int(round(100 * total_weight_matched / total_weight_all))

        jobs.append({
            "job_name": job_name,
            "match_count": match_count,
            "match_percentage": score,
            "total_weight": float(total_weight_matched),
            "matched_skills": matched_skills,
            "hard_skills_count": hard_count,
            "soft_skills_count": soft_count,
        })

    # 按匹配度从高到低排序，其次按匹配权重和排序
    jobs.sort(key=lambda x: (x["match_percentage"], x["total_weight"]), reverse=True)

    return jobs, len(normalized_input), skills



