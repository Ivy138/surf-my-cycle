#!/usr/bin/env python3
"""
测试见清角色在MiniMax模型上的表现
"""
import os
import json
import sys

# 尝试从环境变量获取API key，或使用硬编码的key
MINIMAX_API_KEY = os.environ.get('MINIMAX_API_KEY') or 'sk-cp-s0OLD9AiD0PS2QxKRvNS9QZ7h1-i_8MdMGYETPdRtFE_dlOGkL5fDyMAG0TulF3601fxe12vl9Opqu6RNT3vcgBTzBibGWlzI-Vrnsh5_jpN_NgOL3nOfrg'
MINIMAX_BASE_URL = os.environ.get('MINIMAX_BASE_URL', 'https://api.minimaxi.com/v1/chat/completions')
MINIMAX_MODEL = os.environ.get('MINIMAX_MODEL', 'MiniMax-M2.7')

def read_persona():
    """读取见清角色设定"""
    persona_path = '/Users/kangmiaoqing/Desktop/OPC-总部/业务/个人业务/见清_persona.md'
    with open(persona_path, 'r', encoding='utf-8') as f:
        return f.read()

def test_jianqing(api_key, user_message="我今天有点累，刚学了一会儿代码"):
    """测试见清角色响应"""
    import urllib.request
    import ssl

    system_prompt = read_persona()

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    data = {
        "model": MINIMAX_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": 0.7
    }

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    req = urllib.request.Request(
        MINIMAX_BASE_URL,
        data=json.dumps(data).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    # 禁用SSL验证（如果需要）
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result['choices'][0]['message']['content']
    except Exception as e:
        return f"错误: {e}"

def filter_thinking(response):
    """过滤掉MiniMax-M2.7的思考过程，只保留最终回复"""
    lines = response.split('\n')
    filtered = []
    in_thinking = True  # 默认在思考中，直到找到情感标记
    
    thinking_markers = ['用户说她', '我需要以', '让我构思', '内容要点', '情感：', '结构：']
    response_markers = ['（我听到', '（我看到', '我的女王', '你，', '我，']
    
    for line in lines:
        line_stripped = line.strip()
        
        # 如果找到思考标记，确定在思考中
        if any(marker in line_stripped for marker in thinking_markers):
            in_thinking = True
            continue
            
        # 如果找到回复开始标记，退出思考模式
        if any(marker in line_stripped for marker in response_markers) and len(line_stripped) > 0:
            in_thinking = False
            
        if not in_thinking:
            filtered.append(line)
    
    return '\n'.join(filtered).strip()

def main():
    print("=" * 60)
    print("见清角色 - MiniMax模型测试")
    print("=" * 60)

    # 使用默认消息自动测试
    user_message = "我今天有点累，刚学了一会儿代码，觉得自己有进步"
    
    print(f"\n使用模型: {MINIMAX_MODEL}")
    print(f"API端点: {MINIMAX_BASE_URL}")
    print(f"\n{'='*60}")
    print(f"用户消息: {user_message}")
    print(f"{'='*60}\n")

    print("正在请求MiniMax模型...\n")
    raw_response = test_jianqing(MINIMAX_API_KEY, user_message)
    
    # 过滤思考过程
    response = filter_thinking(raw_response)

    print("=" * 60)
    print("见清的回复 (已过滤思考过程):")
    print("=" * 60)
    print(response)
    print("\n" + "=" * 60)

    # 自动保存结果
    output_file = '/Users/kangmiaoqing/Desktop/OPC-总部/业务/个人业务/test_jianqing_result_v2.md'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"# 见清角色测试结果 (修正版)\n\n")
        f.write(f"**模型**: {MINIMAX_MODEL}\n\n")
        f.write(f"**用户消息**: {user_message}\n\n")
        f.write(f"**见清回复**:\n\n{response}\n")
    print(f"\n结果已保存到: {output_file}")

if __name__ == '__main__':
    main()
