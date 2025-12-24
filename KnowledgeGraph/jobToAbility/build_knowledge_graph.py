"""
岗位→能力知识图谱构建脚本

从 Excel 文件中读取岗位及其硬实力 / 软实力权重信息，构建 Neo4j 知识图谱：
  领域(岗位) -> 一级分类(硬实力/软实力) -> 二级分类(具体技能)

本脚本在导入前会**先清空当前 Neo4j 数据库中的所有节点和关系**，
以保证与前端 / 后端调用的名称和结构保持一致。
"""

import pandas as pd
from neo4j import GraphDatabase
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class Neo4jKnowledgeGraph:
    def __init__(self,
                 uri: str = "bolt://localhost:7687",
                 user: str = "neo4j",
                 password: str = "20041028"):
        """初始化 Neo4j 连接"""
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        logger.info(f"成功连接到Neo4j: {uri}")

    def close(self):
        """关闭数据库连接"""
        self.driver.close()
        logger.info("数据库连接已关闭")

    def clear_database(self):
        """清空数据库（用于重新构建整个图谱）"""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        logger.info("数据库已清空（所有节点与关系已删除）")

    def create_domain_node(self, domain_name: str):
        """创建领域根节点（岗位大类）"""
        with self.driver.session() as session:
            session.run(
                """
                MERGE (d:领域 {name: $name})
                SET d.type = '根节点'
                RETURN d
                """,
                name=domain_name
            )
        logger.info(f"创建领域节点: {domain_name}")

    def create_first_level_node(self, domain_name: str, category_type: str, category_name: str):
        """创建一级分类节点（硬实力或软实力）"""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (d:领域 {name: $domain})
                MERGE (c:一级分类 {
                    name: $category_name,
                    domain: $domain,
                    category_type: $category_type
                })
                ON CREATE SET c.created_at = timestamp()
                MERGE (d)-[:包含]->(c)
                RETURN c
                """,
                domain=domain_name,
                category_name=category_name,
                category_type=category_type
            )

    def create_second_level_node(self,
                                 domain_name: str,
                                 category_type: str,
                                 skill_name: str,
                                 weight: float):
        """创建二级分类节点（具体技能）并建立与一级分类的连接（带权重）"""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (c:一级分类 {
                    name: $category_name,
                    domain: $domain,
                    category_type: $category_type
                })
                MERGE (s:二级分类 {
                    name: $skill_name,
                    domain: $domain,
                    category_type: $category_type
                })
                ON CREATE SET s.created_at = timestamp()
                MERGE (c)-[r:包含]->(s)
                SET r.weight = $weight
                RETURN s
                """,
                domain=domain_name,
                category_name=category_type,  # '硬实力' 或 '软实力'
                category_type=category_type,
                skill_name=skill_name,
                weight=float(weight)
            )

    def process_excel_file(self, excel_path: str):
        """
        处理 Excel 文件，读取所有工作表并构建知识图谱。

        文件结构约定（与原项目保持一致）：
          - 每个工作表代表一个岗位领域（如「数据分析师」「Java开发」等）
          - 列顺序：
              0: 硬实力名称
              1: 硬实力频次（可忽略）
              2: 硬实力权重
              3: 软实力名称
              4: 软实力频次（可忽略）
              5: 软实力权重
        """
        try:
            excel_file = pd.ExcelFile(excel_path)
            sheet_names = excel_file.sheet_names
            logger.info(f"发现 {len(sheet_names)} 个工作表: {sheet_names}")

            for sheet_name in sheet_names:
                logger.info("\n" + "=" * 80)
                logger.info(f"开始处理领域: {sheet_name}")
                logger.info("=" * 80)

                df = pd.read_excel(excel_path, sheet_name=sheet_name)
                logger.info(f"工作表 '{sheet_name}' 的形状: {df.shape}")
                logger.info(f"列名: {df.columns.tolist()}")

                # 创建领域根节点
                self.create_domain_node(sheet_name)

                # 按原有约定直接取列
                hard_skills_col = df.columns[0]   # 硬实力名称
                hard_weights_col = df.columns[2]  # 硬实力权重
                soft_skills_col = df.columns[3]   # 软实力名称
                soft_weights_col = df.columns[5]  # 软实力权重

                logger.info(f"硬实力列: {hard_skills_col}, 权重列: {hard_weights_col}")
                logger.info(f"软实力列: {soft_skills_col}, 权重列: {soft_weights_col}")

                # 创建硬实力一级分类节点
                self.create_first_level_node(sheet_name, '硬实力', '硬实力')

                hard_count = 0
                hard_df = df[[hard_skills_col, hard_weights_col]].dropna(subset=[hard_skills_col])
                for _, row in hard_df.iterrows():
                    skill_name = str(row[hard_skills_col]).strip()
                    weight = row[hard_weights_col]
                    if skill_name and skill_name not in ('nan', 'None') and pd.notna(weight):
                        self.create_second_level_node(sheet_name, '硬实力', skill_name, weight)
                        hard_count += 1
                        logger.info(f"  [{hard_count}] 硬实力: {skill_name} (权重: {float(weight):.6f})")

                logger.info(f"硬实力节点创建完成，共 {hard_count} 个")

                # 创建软实力一级分类节点
                self.create_first_level_node(sheet_name, '软实力', '软实力')

                soft_count = 0
                soft_df = df[[soft_skills_col, soft_weights_col]].dropna(subset=[soft_skills_col])
                for _, row in soft_df.iterrows():
                    skill_name = str(row[soft_skills_col]).strip()
                    weight = row[soft_weights_col]
                    if skill_name and skill_name not in ('nan', 'None') and pd.notna(weight):
                        self.create_second_level_node(sheet_name, '软实力', skill_name, weight)
                        soft_count += 1
                        logger.info(f"  [{soft_count}] 软实力: {skill_name} (权重: {float(weight):.6f})")

                logger.info(
                    f"领域 '{sheet_name}' 处理完成！硬实力: {hard_count} 个, 软实力: {soft_count} 个"
                )

            logger.info("\n" + "=" * 80)
            logger.info("所有岗位→能力知识图谱构建完成！")
            logger.info("=" * 80)

        except Exception as e:
            logger.error(f"处理Excel文件时出错: {str(e)}", exc_info=True)
            raise


def main():
    """入口：清空数据库并按照 Excel 重新导入岗位→能力图谱"""
    excel_path = "职位技能权重计算结果_去重后.xlsx"

    kg = Neo4jKnowledgeGraph()

    try:
        # 1. 清空原有图数据库内容
        kg.clear_database()

        # 2. 从 Excel 重新构建岗位→能力知识图谱
        kg.process_excel_file(excel_path)

        logger.info("岗位→能力知识图谱构建成功完成！")

    except Exception as e:
        logger.error(f"程序执行出错: {str(e)}", exc_info=True)
    finally:
        kg.close()


if __name__ == "__main__":
    main()



