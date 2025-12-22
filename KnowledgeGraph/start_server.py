"""
知识图谱数据库服务启动脚本
检查依赖和Neo4j连接，然后启动Flask服务
"""
import sys
import os

def check_dependencies():
    """检查Python依赖"""
    print("=" * 60)
    print("  Checking Dependencies")
    print("=" * 60)
    
    required_modules = ['flask', 'flask_cors', 'py2neo']
    missing_modules = []
    
    for module in required_modules:
        try:
            if module == 'flask_cors':
                __import__('flask_cors')
            else:
                __import__(module)
            print(f"✓ {module}")
        except ImportError:
            print(f"✗ {module} - 未安装")
            missing_modules.append(module)
    
    if missing_modules:
        print("\n" + "=" * 60)
        print("  Missing Dependencies")
        print("=" * 60)
        print("\n请运行以下命令安装缺失的依赖：")
        print(f"pip install {' '.join(missing_modules)}")
        print("\n或者安装所有依赖：")
        print("pip install -r requirements.txt")
        print("\n" + "=" * 60)
        return False
    
    print("\n✓ All dependencies installed")
    return True

def check_neo4j():
    """检查Neo4j连接"""
    print("\n" + "=" * 60)
    print("  Checking Neo4j Connection")
    print("=" * 60)
    
    try:
        from py2neo import Graph
        
        print("正在尝试连接Neo4j...")
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "20063845"))
        
        # 尝试运行一个简单查询
        result = graph.run("RETURN 1 as test").data()
        
        # 检查数据库中是否有数据
        count = graph.run("MATCH (n) RETURN count(n) as count").data()[0]['count']
        
        print("✓ Neo4j数据库连接成功")
        print(f"  数据库节点数: {count}")
        
        if count == 0:
            print("\n⚠️  警告: 数据库中没有数据")
            print("   请先运行构建脚本导入数据")
        
        return True
        
    except Exception as e:
        print(f"✗ Neo4j数据库连接失败: {e}")
        print("\n" + "=" * 60)
        print("  Neo4j Connection Failed")
        print("=" * 60)
        print("\n可能的原因：")
        print("  1. Neo4j Desktop未启动")
        print("  2. 密码不正确")
        print("  3. 端口被占用")
        print("\n快速解决步骤：")
        print("  1. 打开 Neo4j Desktop 应用程序")
        print("  2. 找到您的数据库项目")
        print("  3. 点击 'Start' 按钮启动数据库")
        print("  4. 等待状态变为绿色的 'Running'")
        print("  5. 重新运行此脚本")
        print("\n详细信息请查看: Neo4j启动说明.md")
        print("=" * 60)
        return False

def start_server():
    """启动Flask服务"""
    print("\n" + "=" * 60)
    print("  Starting Flask Server")
    print("=" * 60)
    
    # 导入并运行app
    from app import app, graph
    
    if not graph:
        print("\n✗ 无法启动服务：Neo4j连接失败")
        sys.exit(1)
    
    print("\n服务正在启动...")
    print("服务地址: http://localhost:5000")
    print("\n按 Ctrl+C 停止服务")
    print("=" * 60 + "\n")
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    except KeyboardInterrupt:
        print("\n\n服务已停止")
        sys.exit(0)

def main():
    """主函数"""
    # 检查当前目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # 检查依赖
    if not check_dependencies():
        sys.exit(1)
    
    # 检查Neo4j
    if not check_neo4j():
        print("\n是否仍然尝试启动服务？")
        print("提示: 服务可能会失败或功能异常")
        choice = input("\n继续启动? (y/n): ")
        if choice.lower() != 'y':
            sys.exit(0)
        print()
    
    # 启动服务
    start_server()

if __name__ == '__main__':
    main()
