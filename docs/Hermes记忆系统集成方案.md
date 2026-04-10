# SurfMyCycle × Hermes 记忆系统集成方案

> 将Hermes的四层记忆架构迁移到Web应用中

---

## 🎯 核心目标

让SurfMyCycle的AI伙伴拥有**真正的长期记忆**：
- 记住你的周期模式和个人偏好
- 从每次对话中学习，越来越懂你
- 主动在合适时机给出个性化建议

---

## 🏗️ Hermes记忆架构回顾

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Prompt Memory (热记忆)                          │
│  - 始终加载到系统提示中                                    │
│  - 用户画像、长期事实                                      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Session Archive (冷记忆)                        │
│  - SQLite数据库存储历史会话                                │
│  - 需要时通过session_search显式检索                        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Skills (程序性记忆)                              │
│  - 可复用的工作流程和技能                                  │
│  - 任务完成后自动创建                                      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 4: External Provider (外部记忆)                     │
│  - 可插拔的外部记忆服务                                    │
│  - 向量数据库、知识图谱等                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 SurfMyCycle记忆系统设计

### 架构映射

| Hermes Layer | SurfMyCycle实现 | 存储位置 |
|-------------|-----------------|---------|
| Prompt Memory | 用户画像 + 周期洞察 | Supabase (user_memories表) |
| Session Archive | 对话历史 + 记录数据 | Supabase (conversations + records表) |
| Skills | 周期建议模板 | 前端代码 (AI_STYLE_TEMPLATES) |
| External | 可选：向量搜索 | Pinecone/Supabase pgvector |

---

## 📋 具体实现

### 1. 数据库设计 (Supabase)

```sql
-- 用户长期记忆表
CREATE TABLE user_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 记忆内容
  category VARCHAR(50), -- 'preference', 'pattern', 'insight', 'fact'
  key VARCHAR(200),     -- 记忆关键词
  value TEXT,           -- 记忆内容
  confidence FLOAT,     -- 置信度 0-1
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  last_accessed TIMESTAMP,
  
  -- 访问计数（用于记忆衰减）
  access_count INTEGER DEFAULT 0,
  
  -- 索引
  UNIQUE(user_id, category, key)
);

-- 周期洞察记忆（从数据中自动提取）
CREATE TABLE cycle_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 洞察类型
  insight_type VARCHAR(50), -- 'phase_pattern', 'symptom_correlation', 'energy_trend'
  
  -- 洞察内容
  title TEXT,
  description TEXT,
  data_evidence JSONB,      -- 支持数据
  
  -- 有效性
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  
  -- 触发条件（何时激活这条记忆）
  trigger_conditions JSONB, -- { cycle_day_range: [1,5], phase: 'menstrual' }
  
  created_at TIMESTAMP DEFAULT now()
);

-- 对话学习记忆（从AI对话中提取）
CREATE TABLE conversation_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 来源
  conversation_date DATE,
  extracted_from TEXT,      -- 从哪段对话提取
  
  -- 学习内容
  learning_type VARCHAR(50), -- 'preference', 'fact', 'goal', 'concern'
  content TEXT,
  
  -- 验证状态
  is_verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(50),   -- 'user', 'system', 'pattern'
  
  created_at TIMESTAMP DEFAULT now()
);

-- 启用RLS
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_learnings ENABLE ROW LEVEL SECURITY;

-- 策略：用户只能访问自己的记忆
CREATE POLICY user_memories_policy ON user_memories
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY cycle_insights_policy ON cycle_insights
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY conversation_learnings_policy ON conversation_learnings
  FOR ALL USING (auth.uid() = user_id);
```

---

### 2. 记忆提取服务

创建 `/api/memory-extract.js`：

```javascript
const { allowCors, getUserFromRequest, json, readJsonBody } = require('./_lib');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });
  
  try {
    const body = await readJsonBody(req);
    const { conversation, cycleData } = body;
    
    // 调用MiniMax提取记忆
    const extracted = await extractMemoriesWithAI(conversation, cycleData);
    
    // 保存到数据库
    for (const memory of extracted) {
      await saveMemory(user.id, memory);
    }
    
    json(res, 200, { 
      extracted: extracted.length,
      memories: extracted 
    });
    
  } catch (error) {
    console.error('记忆提取失败:', error);
    json(res, 500, { error: error.message });
  }
};

async function extractMemoriesWithAI(conversation, cycleData) {
  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
  
  const prompt = `从以下对话中提取用户的长期记忆（偏好、模式、目标等）。

对话：
${JSON.stringify(conversation, null, 2)}

用户周期数据：
${JSON.stringify(cycleData, null, 2)}

请提取以下内容（JSON格式）：
[
  {
    "category": "preference|pattern|goal|concern",
    "key": "简洁的关键词",
    "value": "具体的记忆内容",
    "confidence": 0.8,
    "source": "对话中的原句"
  }
]

只输出JSON，不要其他内容。`;

  const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  const result = await response.json();
  const content = result.choices[0].message.content;
  
  // 解析JSON
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('AI返回的不是有效JSON:', content);
    return [];
  }
}

async function saveMemory(userId, memory) {
  const { error } = await supabase
    .from('user_memories')
    .upsert({
      user_id: userId,
      category: memory.category,
      key: memory.key,
      value: memory.value,
      confidence: memory.confidence,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,category,key'
    });
    
  if (error) throw error;
}
```

---

### 3. 记忆检索服务

创建 `/api/memory-retrieve.js`：

```javascript
const { allowCors, getUserFromRequest, json } = require('./_lib');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });
  
  try {
    const { context, limit = 10 } = req.query;
    
    // 获取用户的所有记忆
    const { data: memories, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', user.id)
      .order('access_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    
    // 获取当前相关的周期洞察
    const today = new Date();
    const { data: insights } = await supabase
      .from('cycle_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('valid_from', today)
      .gte('valid_until', today);
    
    // 更新访问计数
    await updateAccessCount(user.id, memories.map(m => m.id));
    
    json(res, 200, {
      memories: memories || [],
      insights: insights || [],
      prompt_context: formatForPrompt(memories, insights)
    });
    
  } catch (error) {
    console.error('记忆检索失败:', error);
    json(res, 500, { error: error.message });
  }
};

async function updateAccessCount(userId, memoryIds) {
  if (!memoryIds.length) return;
  
  await supabase
    .from('user_memories')
    .update({ 
      access_count: supabase.rpc('increment_access_count'),
      last_accessed: new Date().toISOString()
    })
    .eq('user_id', userId)
    .in('id', memoryIds);
}

function formatForPrompt(memories, insights) {
  let context = '';
  
  if (memories.length) {
    context += '## 关于用户的长期记忆\n';
    for (const m of memories) {
      context += `- ${m.key}: ${m.value}\n`;
    }
    context += '\n';
  }
  
  if (insights.length) {
    context += '## 当前周期洞察\n';
    for (const i of insights) {
      context += `- ${i.title}: ${i.description}\n`;
    }
  }
  
  return context;
}
```

---

### 4. 记忆自动提取触发

修改 `js/app.js` 中的 `sendAI()` 函数，在对话结束后自动提取记忆：

```javascript
// 在对话保存后触发记忆提取
async function sendAI() {
  // ... 原有AI对话逻辑 ...
  
  // 对话结束后自动提取记忆
  await extractAndSaveMemories(msg, reply, cycleDay);
}

async function extractAndSaveMemories(userMsg, aiReply, cycleDay) {
  try {
    const conversation = [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: aiReply }
    ];
    
    const cycleData = {
      cycleDay,
      currentRecord: await getRecord(currentRecDate),
      recentRecords: await getRecentRecords(7)
    };
    
    // 异步调用记忆提取（不阻塞UI）
    fetch('/api/memory-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation, cycleData })
    }).catch(e => console.error('记忆提取失败:', e));
    
  } catch (e) {
    console.error('记忆提取出错:', e);
  }
}
```

---

### 5. AI对话时注入记忆

修改 `buildAISystemPrompt` 函数：

```javascript
async function buildAISystemPrompt({ cfg, cycleDay, ...otherParams }) {
  // ... 原有系统提示构建 ...
  
  // 获取用户记忆
  let memoryContext = '';
  try {
    const response = await apiRequest('/memory-retrieve');
    const data = await response.json();
    memoryContext = data.prompt_context || '';
  } catch (e) {
    console.error('获取记忆失败:', e);
  }
  
  // 构建完整系统提示
  const systemPrompt = `
你是用户的AI伙伴${companionName}。

${memoryContext}

${styleTemplate.prompt}

## 当前状态
- 今天是：${currentTimeStr}
- 用户处于周期第${cycleDay}天
- 当前阶段：${phase?.name || '未知'}

${otherParams.recentContextText}
`;

  return systemPrompt;
}
```

---

### 6. 周期洞察自动提取（类似Hermes的Nudge）

创建周期性任务，分析用户数据生成洞察：

```javascript
// /api/cycle-insight-generate.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // 这个API应该被Vercel Cron调用（每天一次）
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // 获取需要分析的用户
  const { data: users } = await supabase
    .from('user_configs')
    .select('user_id, last_insight_generated')
    .lt('last_insight_generated', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  for (const user of users || []) {
    try {
      // 获取用户最近30天的数据
      const records = await getUserRecords(supabase, user.user_id, 30);
      
      // 用AI分析生成洞察
      const insights = await generateInsightsWithAI(records);
      
      // 保存洞察
      for (const insight of insights) {
        await supabase.from('cycle_insights').insert({
          user_id: user.user_id,
          insight_type: insight.type,
          title: insight.title,
          description: insight.description,
          data_evidence: insight.evidence,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90天有效期
          trigger_conditions: insight.triggers
        });
      }
      
      // 更新时间戳
      await supabase
        .from('user_configs')
        .update({ last_insight_generated: new Date().toISOString() })
        .eq('user_id', user.user_id);
        
    } catch (e) {
      console.error(`为用户 ${user.user_id} 生成洞察失败:`, e);
    }
  }
  
  res.json({ processed: users?.length || 0 });
};
```

---

## 🚀 部署步骤

### 1. 数据库迁移

```bash
# 在Supabase SQL Editor执行上面的CREATE TABLE语句
```

### 2. 环境变量

在Vercel添加：
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MINIMAX_API_KEY=your-minimax-key
```

### 3. Vercel Cron配置 (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cycle-insight-generate",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### 4. 前端代码更新

- 修改 `js/app.js` 中的 `sendAI()` 函数
- 修改 `buildAISystemPrompt()` 函数
- 添加 `extractAndSaveMemories()` 函数

---

## 💡 记忆使用示例

### 场景1：记住用户偏好

**对话**：
```
用户：我不喜欢黄体期被提醒吃太多
AI：好的，我记住了。以后黄体期不会频繁提醒你饮食。
```

**记忆保存**：
```json
{
  "category": "preference",
  "key": "luteal_diet_reminder_frequency",
  "value": "低频率，不要频繁提醒",
  "confidence": 0.9
}
```

**后续对话自动注入**：
```
AI系统提示：关于用户的长期记忆 - 黄体期饮食提醒频率偏好：低频率，不要频繁提醒
```

### 场景2：周期模式洞察

**数据分析**：
- 用户连续3个月在月经期第2天报告"头痛"

**自动生成的洞察**：
```json
{
  "insight_type": "symptom_correlation",
  "title": "月经期头痛模式",
  "description": "你在月经期第2天经常报告头痛，这可能与激素下降有关",
  "trigger_conditions": { "cycle_day": 2, "phase": "menstrual" }
}
```

**触发时AI提示**：
```
今天是你的月经期第2天。根据过往记录，这一天你经常头痛，注意休息和补水。
```

---

## 📊 与OCCC集成（可选）

SurfMyCycle的记忆可以与OCCC看板同步：

```javascript
// 当生成重要洞察时，同步到OCCC
async function syncToOCCC(insight) {
  const task = {
    id: `insight-${insight.id}`,
    title: `SurfMyCycle用户洞察: ${insight.title}`,
    content: insight.description,
    priority: 'medium',
    category: '产品洞察'
  };
  
  // 写入OCCC战略看板
  await fetch('/api/occc-sync', {
    method: 'POST',
    body: JSON.stringify({
      board: '01-董事会/📋 战略任务看板.md',
      task: task
    })
  });
}
```

---

*方案完成，准备实现*
