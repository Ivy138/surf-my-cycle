/**
 * 记忆提取API
 * 从AI对话中提取用户长期记忆
 * 对应Hermes的记忆学习循环
 */

const { allowCors, getUserFromRequest, json, readJsonBody } = require('./_lib');

// MiniMax API配置
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';

module.exports = async (req, res) => {
  // CORS处理
  if (allowCors(req, res)) return;
  
  // 只接受POST请求
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  
  // 验证用户
  const user = await getUserFromRequest(req);
  if (!user) {
    return json(res, 401, { error: 'Unauthorized' });
  }
  
  try {
    const body = await readJsonBody(req);
    const { conversation, cycleData, userContext } = body;
    
    if (!conversation || !Array.isArray(conversation)) {
      return json(res, 400, { error: 'Invalid conversation format' });
    }
    
    // 使用AI提取记忆
    const extractedMemories = await extractMemoriesWithAI(
      conversation, 
      cycleData, 
      userContext
    );
    
    // 保存到数据库
    const savedCount = await saveMemoriesToDatabase(user.id, extractedMemories);
    
    // 记录提取日志
    await logExtraction(user.id, conversation, extractedMemories, true);
    
    json(res, 200, {
      success: true,
      extracted: extractedMemories.length,
      saved: savedCount,
      memories: extractedMemories
    });
    
  } catch (error) {
    console.error('记忆提取失败:', error);
    
    // 记录失败日志
    await logExtraction(user.id, body.conversation, [], false, error.message);
    
    json(res, 500, { 
      error: 'Memory extraction failed',
      message: error.message 
    });
  }
};

/**
 * 使用AI从对话中提取记忆
 */
async function extractMemoriesWithAI(conversation, cycleData, userContext) {
  const extractionPrompt = buildExtractionPrompt(conversation, cycleData, userContext);
  
  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { 
          role: 'system', 
          content: '你是一个记忆提取专家。从对话中提取用户的长期记忆（偏好、习惯、目标、关注的事）。只输出JSON格式，不要其他内容。' 
        },
        { role: 'user', content: extractionPrompt }
      ],
      temperature: 0.3, // 低温度确保稳定输出
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax API error: ${errorText}`);
  }
  
  const result = await response.json();
  const content = result.choices[0].message.content;
  
  // 解析JSON
  try {
    // 清理可能的Markdown代码块
    const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
    const memories = JSON.parse(cleanContent);
    
    // 验证格式
    if (!Array.isArray(memories)) {
      throw new Error('AI返回的不是数组格式');
    }
    
    return memories.filter(m => validateMemory(m));
    
  } catch (e) {
    console.error('解析AI返回的记忆失败:', e, '原始内容:', content);
    return [];
  }
}

/**
 * 构建记忆提取提示
 */
function buildExtractionPrompt(conversation, cycleData, userContext) {
  return `请从以下对话中提取用户的长期记忆。

## 对话记录
${JSON.stringify(conversation, null, 2)}

## 用户当前周期数据
${cycleData ? JSON.stringify(cycleData, null, 2) : '无'}

## 提取规则
1. 只提取明确的、长期有效的信息
2. 不要提取临时状态或一次性事件
3. 置信度低于0.6的记忆不要提取

## 可提取的记忆类型
- preference: 用户偏好（喜欢/不喜欢什么）
- pattern: 行为模式（经常做什么）
- goal: 目标（想达成什么）
- concern: 关注点/担忧
- fact: 关于用户的事实信息

## 输出格式
返回JSON数组，每个记忆包含：
{
  "category": "preference|pattern|goal|concern|fact",
  "key": "简洁的关键词，如'diet_preference'",
  "value": "具体的记忆内容",
  "confidence": 0.85,
  "source": "对话中的原话引用"
}

请只输出JSON数组，不要有其他文字。`;
}

/**
 * 验证记忆格式
 */
function validateMemory(memory) {
  const validCategories = ['preference', 'pattern', 'goal', 'concern', 'fact'];
  
  return memory &&
    validCategories.includes(memory.category) &&
    memory.key && typeof memory.key === 'string' &&
    memory.value && typeof memory.value === 'string' &&
    typeof memory.confidence === 'number' &&
    memory.confidence >= 0 && memory.confidence <= 1;
}

/**
 * 保存记忆到数据库
 */
async function saveMemoriesToDatabase(userId, memories) {
  if (!memories.length) return 0;
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  let savedCount = 0;
  
  for (const memory of memories) {
    try {
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
      
      if (!error) {
        savedCount++;
      } else {
        console.error('保存记忆失败:', error);
      }
    } catch (e) {
      console.error('保存记忆异常:', e);
    }
  }
  
  return savedCount;
}

/**
 * 记录提取日志
 */
async function logExtraction(userId, conversation, memories, success, errorMessage = null) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    await supabase
      .from('memory_extraction_logs')
      .insert({
        user_id: userId,
        conversation_id: conversation?.[0]?.id || null,
        extracted_memories: memories,
        extraction_success: success,
        error_message: errorMessage,
        created_at: new Date().toISOString()
      });
  } catch (e) {
    console.error('记录提取日志失败:', e);
  }
}
