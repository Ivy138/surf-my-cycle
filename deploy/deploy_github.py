#!/usr/bin/env python3
"""
GitHub Pages 一键部署脚本
运行: python3 deploy_github.py
"""
import subprocess
import os
import sys

def run(cmd, cwd=None):
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

print("🚀 Surf My Cycle - GitHub Pages 部署工具\n")

# 配置
USERNAME = "Ivy138"
REPO = "surf-my-cycle"
PROJECT_DIR = "/Users/kangmiaoqing/Desktop/OPC-总部/业务/个人业务"

print(f"目标仓库: https://github.com/{USERNAME}/{REPO}")
print(f"项目目录: {PROJECT_DIR}\n")

# 检查文件
html_file = os.path.join(PROJECT_DIR, "cycle_experiment.html")
if not os.path.exists(html_file):
    print(f"❌ 错误: 找不到 {html_file}")
    sys.exit(1)

print("✅ 找到 cycle_experiment.html")

# 复制为 index.html
index_file = os.path.join(PROJECT_DIR, "index.html")
with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()
with open(index_file, 'w', encoding='utf-8') as f:
    f.write(content)
print("✅ 已复制为 index.html (GitHub Pages 需要)")

# Git 配置
print("\n📦 配置 Git...")
run('git config user.email "deploy@example.com"', cwd=PROJECT_DIR)
run('git config user.name "Deploy Bot"', cwd=PROJECT_DIR)

# 添加文件
run("git add index.html", cwd=PROJECT_DIR)
out, err, code = run('git commit -m "Deploy to GitHub Pages"', cwd=PROJECT_DIR)
if code == 0 or "nothing to commit" not in err.lower():
    print("✅ Git 提交成功")
else:
    print("⚠️ 没有新改动需要提交")

# 设置远程
remote_url = f"https://github.com/{USERNAME}/{REPO}.git"
run(f"git remote remove origin 2>/dev/null", cwd=PROJECT_DIR)
out, err, code = run(f"git remote add origin {remote_url}", cwd=PROJECT_DIR)
print(f"✅ 设置远程仓库: {remote_url}")

# 推送
print("\n📤 推送到 GitHub...")
print("💡 提示: 如果要求输入密码，请输入 GitHub 个人访问令牌 (ghp_xxxxxxxx)")
print("   没有令牌？访问: https://github.com/settings/tokens/new")
print("   勾选 'repo' 权限后生成\n")

out, err, code = run("git push -u origin main --force", cwd=PROJECT_DIR)

if code == 0:
    print("✅ 推送成功！")
    print(f"\n🌐 现在开启 GitHub Pages:")
    print(f"   1. 访问: https://github.com/{USERNAME}/{REPO}/settings/pages")
    print(f"   2. Source: Deploy from a branch")
    print(f"   3. Branch: main, 文件夹: / (root)")
    print(f"   4. 点击 Save，等待 1-2 分钟")
    print(f"\n🎉 然后访问: https://{USERNAME}.github.io/{REPO}/")
else:
    print(f"❌ 推送失败")
    print(f"错误信息:\n{err}")
    print(f"\n💡 解决方案:")
    print(f"   1. 确认仓库 https://github.com/{USERNAME}/{REPO} 已创建")
    print(f"   2. 使用 GitHub Token 而不是密码")
    print(f"   3. 或者使用 GitHub Desktop 图形化操作")
