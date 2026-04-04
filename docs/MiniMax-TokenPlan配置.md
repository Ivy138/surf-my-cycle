# MiniMax Token Plan 配置教程

## 获取API Key
1. 登录 MiniMax 开放平台：https://platform.minimaxi.com/
2. 进入 Token Plan 订阅页面
3. 复制以 `sk-cp-` 开头的 API Key

## Windsurf/OpenClaw 配置

### 方式一：环境变量
```bash
export MINIMAX_API_KEY="sk-cp-s0OLD9AiD0PS2QxKRvNS9QZ7h1-i_8MdMGYETPdRtFE_dlOGkL5fDyMAG0TulF3601fxe12vl9Opqu6RNT3vcgBTzBibGWlzI-Vrnsh5_jpN_NgOL3nOfrg"
export MINIMAX_BASE_URL="https://api.minimaxi.com/v1/chat/completions"
export MINIMAX_MODEL="MiniMax-M2.7"
```

### 方式二：配置文件
在 `.windsurfrules` 或 `openclaw.json` 中添加：
```json
{
  "env": {
    "MINIMAX_API_KEY": "sk-cp-s0OLD9AiD0PS2QxKRvNS9QZ7h1-i_8MdMGYETPdRtFE_dlOGkL5fDyMAG0TulF3601fxe12vl9Opqu6RNT3vcgBTzBibGWlzI-Vrnsh5_jpN_NgOL3nOfrg",
    "MINIMAX_BASE_URL": "https://api.minimaxi.com/v1/chat/completions",
    "MINIMAX_MODEL": "MiniMax-M2.7"
  }
}
```

## 注意事项
- **端点**：必须是 `api.minimaxi.com`（不是 io）
- **格式**：OpenAI 兼容格式
- **Key格式**：Token Plan 的 Key 以 `sk-cp-` 开头（按量付费是 `sk-api-`）
- **模型**：使用 `MiniMax-M2.7`

## 测试命令
```bash
curl -X POST 'https://api.minimaxi.com/v1/chat/completions' \
  -H 'Authorization: Bearer sk-cp-你的Key' \
  -H 'Content-Type: application/json' \
  -d '{"model": "MiniMax-M2.7", "messages": [{"role": "user", "content": "你好"}]}'
```

## 常见错误
- `invalid api key`：检查Key是否正确，是否以 `sk-cp-` 开头
- `Failed to fetch`：CORS问题，需要用本地服务器或配置代理
