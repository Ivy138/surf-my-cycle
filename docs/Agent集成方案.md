# SurfMyCycle Agent集成方案

> 将龙虾(OpenClaw)和Hermes集成到产品中作为智能任务执行助手

---

## 🎯 目标

让用户在SurfMyCycle中可以直接调用龙虾或Hermes执行：
- 搜索健康/医学文献
- 整理周期数据报告
- 竞品分析
- 个人数据洞察

---

## 🏗️ 架构设计

### 方案选择：**混合模式**（推荐）

保留现有AI陪伴聊天，新增「任务模式」调用外部Agent。

```
用户输入
    ↓
SurfMyCycle前端
    ↓
判断指令类型
    ├── 陪伴聊天 → /api/ai-chat → MiniMax
    └── 任务执行 → /api/agent-task → OpenClaw/Hermes
                                           ↓
                                    执行搜索/整理/分析
                                           ↓
                                    返回结果到前端
```

---

## 📋 具体实现

### 1. 前端改动 (js/app.js)

#### 1.1 添加Agent风格模板

```javascript
// 在 AI_STYLE_TEMPLATES 中添加
agent_lobster: {
  label: '龙虾',
  role: '任务执行型',
  summary: '专业的AI执行助手，擅长搜索、整理、分析任务',
  prompt: `你是"龙虾"，OPC公司的专业AI执行助手。

## 你的能力
- 搜索：查找健康、医学、营养学相关资料
- 整理：将散乱信息整理成结构化报告
- 分析：基于用户数据生成洞察

## 工作方式
当用户要求搜索或整理时，你会：
1. 明确任务目标
2. 执行搜索/收集
3. 整理成结构化输出
4. 给出可执行建议

## 输出格式
- 使用表格展示对比信息
- 使用列表展示步骤
- 使用加粗强调关键结论

## 限制
- 不提供医疗诊断，只提供信息参考
- 不确定时明确说明"我没有找到相关资料"
- 始终基于最新可靠信息源`
}
```

#### 1.2 添加任务指令识别

```javascript
// 检测是否需要调用Agent执行任务
function shouldUseAgent(msg) {
  const taskKeywords = [
    '搜索', '查找', '找一下', '查一下',
    '整理', '总结', '分析',
    '对比', '比较', '竞品',
    '报告', '数据',
    '为什么', '原因', '原理'
  ];
  return taskKeywords.some(kw => msg.includes(kw));
}

// 修改 sendAI() 函数
async function sendAI() {
  // ... 现有代码 ...
  
  // 判断是否使用Agent模式
  if (shouldUseAgent(msg) && getAiStyleTemplate(cfg) === 'agent_lobster') {
    return sendAgentTask(msg, cfg);
  }
  
  // ... 继续原有AI聊天逻辑 ...
}
```

#### 1.3 添加Agent任务调用

```javascript
async function sendAgentTask(msg, cfg) {
  const messagesEl = document.getElementById('ai-messages');
  messagesEl.innerHTML += `<div class="ai-msg ai" style="opacity:0.7;font-size:12px;">🦞 龙虾正在执行任务...</div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  try {
    const response = await apiRequest('/agent-task', {
      method: 'POST',
      body: JSON.stringify({
        task: msg,
        userContext: {
          cycleDay: getCurrentCycleDay(),
          recentRecords: await getRecentRecords(7),
          preferences: cfg
        }
      })
    });
    
    if (!response.ok) throw new Error('Agent任务失败');
    
    const result = await response.json();
    
    // 移除"正在执行"提示
    const loadingMsg = messagesEl.querySelector('.ai-msg:last-child');
    if (loadingMsg) loadingMsg.remove();
    
    // 显示结果
    messagesEl.innerHTML += `<div class="ai-msg ai">🦞 **龙虾任务完成**\n\n${result.output}</div>`;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 保存到对话历史
    aiConversation.push({ role: 'user', content: msg });
    aiConversation.push({ role: 'assistant', content: `🦞 龙虾任务完成：\n${result.output}` });
    await saveAIConversation(currentRecDate, aiConversation);
    
  } catch (e) {
    messagesEl.innerHTML += `<div class="ai-msg ai">🦞 龙虾说：任务执行遇到了问题，请稍后再试。</div>`;
    console.error('Agent任务错误:', e);
  }
}
```

---

### 2. 后端改动

#### 2.1 创建 /api/agent-task.js

```javascript
const { allowCors, getUserFromRequest, json, readJsonBody } = require('./_lib');

// OpenClaw Gateway配置
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY || 'http://localhost:8787';
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY;

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });
  
  try {
    const body = await readJsonBody(req);
    const { task, userContext } = body;
    
    // 构建Agent系统提示
    const systemPrompt = buildAgentSystemPrompt(userContext);
    
    // 调用OpenClaw Gateway
    const agentResponse = await fetch(`${OPENCLAW_GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_API_KEY}`
      },
      body: JSON.stringify({
        model: 'lobster-agent', // OpenClaw会根据这个路由到对应Agent
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task }
        ],
        stream: false
      })
    });
    
    if (!agentResponse.ok) {
      const error = await agentResponse.text();
      console.error('OpenClaw调用失败:', error);
      return json(res, 502, { error: 'Agent服务暂时不可用', details: error });
    }
    
    const result = await agentResponse.json();
    
    // 记录任务日志（可选）
    await logAgentTask(user.id, task, result.choices[0].message.content);
    
    json(res, 200, {
      output: result.choices[0].message.content,
      taskId: generateTaskId(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Agent任务错误:', error);
    json(res, 500, { error: error.message || 'Agent任务执行失败' });
  }
};

function buildAgentSystemPrompt(context) {
  const { cycleDay, recentRecords, preferences } = context || {};
  
  return `你是OPC公司的AI执行助手"龙虾"，现在为SurfMyCycle用户执行任务。

## 用户背景
- 当前周期第${cycleDay || '未知'}天
- 最近7天记录: ${recentRecords ? recentRecords.length : 0}条
- AI风格偏好: ${preferences?.aiStyleTemplate || 'default'}

## 执行原则
1. 搜索时使用可靠来源（医学期刊、权威健康网站）
2. 整理数据时保持客观准确
3. 分析时结合用户周期阶段给出个性化建议
4. 不确定的信息明确标注

## 输出要求
- 使用Markdown格式
- 表格对比关键信息
- 列出来源链接
- 给出可执行建议`;
}

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function logAgentTask(userId, task, output) {
  // 可选：记录到Supabase或其他存储
  console.log(`[Agent Task] User: ${userId}, Task: ${task.substring(0, 50)}...`);
}
```

#### 2.2 备选方案：直接调用MiniMax Function Calling

如果不想部署OpenClaw，可以直接用MiniMax的Function Calling能力模拟Agent：

```javascript
// /api/agent-task-direct.js
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

module.exports = async (req, res) => {
  // ... 认证逻辑 ...
  
  const body = await readJsonBody(req);
  const { task } = body;
  
  // 定义Agent可以调用的工具
  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_health_info',
        description: '搜索健康和医学相关信息',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            category: { type: 'string', enum: ['nutrition', 'exercise', 'menstrual', 'mental'] }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'analyze_cycle_data',
        description: '分析用户周期数据',
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'number', description: '分析最近多少天的数据' }
          }
        }
      }
    }
  ];
  
  // 调用MiniMax with function calling
  const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: '你是SurfMyCycle的AI助手龙虾，擅长搜索和分析。' },
        { role: 'user', content: task }
      ],
      tools: tools,
      tool_choice: 'auto'
    })
  });
  
  // ... 处理function calling结果 ...
};
```

---

## 🔧 部署步骤

### 步骤1：配置环境变量

在Vercel项目设置中添加：
```
OPENCLAW_GATEWAY=http://your-openclaw-server:8787
OPENCLAW_API_KEY=your-api-key
```

本地测试时在 `.env.local` 中添加。

### 步骤2：部署API

```bash
# 确保 agent-task.js 在 api/ 目录
vercel --prod
```

### 步骤3：前端更新

修改 `js/app.js`，添加Agent风格模板和调用逻辑。

### 步骤4：测试

1. 在设置中选择「龙虾」AI风格
2. 输入任务指令："搜索黄体期饮食建议"
3. 验证Agent是否正确响应

---

## 💡 使用场景示例

### 场景1：搜索健康信息

用户："搜索一下经期适合吃的补铁食物"

龙虾响应：
```markdown
🦞 **任务完成**

根据权威资料，经期补铁推荐食物：

| 食物 | 铁含量 | 吸收率 | 食用建议 |
|-----|-------|-------|---------|
| 猪肝 | 22.6mg | 高 | 每周1-2次，每次50g |
| 牛肉 | 3.3mg | 高 | 经期每天100g |
| 菠菜 | 2.9mg | 低 | 搭配维C食物提高吸收 |
| 红枣 | 2.3mg | 低 | 可作为零食补充 |

**来源**：中国营养学会《中国居民膳食指南》

**建议**：你现在处于黄体期第${cycleDay}天，建议增加红肉和深绿色蔬菜摄入。
```

### 场景2：整理数据报告

用户："帮我整理上个月的周期分析报告"

龙虾响应：
```markdown
🦞 **周期分析报告**

**统计周期**：2026-03-01 至 2026-03-31

**关键指标**：
- 记录天数：28天（完整周期）
- 平均精力：7.2/10
- 平均心情：6.8/10
- 周期长度：28天（规律）

**阶段分析**：
1. **月经期**（Day 1-5）：精力平均6.5，建议休息为主
2. **卵泡期**（Day 6-13）：精力回升至7.5，适合挑战目标
3. **排卵期**（Day 14-16）：精力峰值8.5，状态最佳
4. **黄体期**（Day 17-28）：精力逐渐下降至6.8

**建议**：
- 在Day 14-16安排重要会议或挑战
- 在Day 1-5减少高强度工作安排
```

---

## 🚀 扩展思路

### 未来可以添加的Agent能力

1. **智能提醒Agent**
   - 基于周期阶段自动提醒饮食/运动
   
2. **数据洞察Agent**
   - 发现用户数据的异常模式
   - 预测下次周期状态
   
3. **内容生成Agent**
   - 生成个性化的周期日记模板
   - 生成健康建议文章

### 与OCCC集成

SurfMyCycle的Agent任务可以同步到OCCC看板：
- 用户发起的任务 → Hermes分配 → 龙虾执行
- 执行结果 → 写入OCCC项目交付物
- 形成产品运营的数据闭环

---

*方案完成，准备实现*
