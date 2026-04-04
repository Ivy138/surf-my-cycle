#!/usr/bin/env python3
"""
GitHub API 直接部署脚本 - 只需要 Token，无需浏览器
"""
import requests
import base64
import json
import sys

# 配置
USERNAME = "Ivy138"
REPO = "surf-my-cycle"
HTML_FILE = "/Users/kangmiaoqing/Desktop/OPC-总部/业务/个人业务/cycle_experiment.html"

def deploy(token):
    """使用 GitHub API 上传文件"""
    
    # 读取文件内容
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Base64 编码
    encoded = base64.b64encode(content.encode()).decode()
    
    # API URL
    url = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents/index.html"
    
    # 请求体
    data = {
        "message": "Deploy cycle tracker to GitHub Pages",
        "content": encoded,
        "branch": "main"
    }
    
    # 请求头
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    print(f"🚀 正在部署到 GitHub Pages...")
    print(f"📦 文件大小: {len(content)} 字节")
    
    # 发送请求
    response = requests.put(url, headers=headers, json=data)
    
    if response.status_code in [200, 201]:
        print("✅ 文件上传成功！")
        print(f"\n🌐 现在开启 GitHub Pages:")
        print(f"   访问: https://github.com/{USERNAME}/{REPO}/settings/pages")
        print(f"   Source → Deploy from a branch → main → Save")
        print(f"\n🎉 部署完成后访问: https://{USERNAME}.github.io/{REPO}/")
        return True
    elif response.status_code == 409:
        print("⚠️ 文件已存在，尝试更新...")
        # 需要先获取当前文件的 SHA
        get_resp = requests.get(url, headers=headers)
        if get_resp.status_code == 200:
            sha = get_resp.json().get('sha')
            data['sha'] = sha
            response = requests.put(url, headers=headers, json=data)
            if response.status_code in [200, 201]:
                print("✅ 文件更新成功！")
                return True
        print(f"❌ 更新失败: {response.text}")
        return False
    elif response.status_code == 401:
        print("❌ Token 无效或过期")
        print("   请访问 https://github.com/settings/tokens 生成新的 token")
        return False
    else:
        print(f"❌ 部署失败 (HTTP {response.status_code})")
        print(f"   错误: {response.text}")
        return False

if __name__ == "__main__":
    print("📝 GitHub Pages 部署工具\n")
    print("需要 GitHub Personal Access Token")
    print("生成地址: https://github.com/settings/tokens/new")
    print("勾选 'repo' 权限后生成\n")
    
    token = input("请输入你的 GitHub Token: ").strip()
    
    if not token:
        print("❌ Token 不能为空")
        sys.exit(1)
    
    if not token.startswith("ghp_") and not token.startswith("github_pat_"):
        print("⚠️ 警告: Token 格式看起来不正确，但我会尝试...")
    
    success = deploy(token)
    
    if not success:
        print("\n💡 备选方案:")
        print("   1. 手动上传到 GitHub 网页")
        print("   2. 使用 Netlify Drop: https://app.netlify.com/drop")
