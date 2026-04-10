/**
 * 记忆检索API
 * 检索用户长期记忆用于AI对话上下文
 * 对应Hermes的session_search功能
 */

const { allowCors, getUserFromRequest, json } = require('./_lib');

module.exports = async (req, res) => {
  // CORS处理
  if (allowCors(req, res)) return;
  
  // 只接受GET请求
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  
  // 验证用户
  const user = await getUserFromRequest(req);
  if (!user) {
    return json(res, 401, { error: 'Unauthorized' });
  }
  
  try {
    // 获取查询参数
    const { 
      context, 
      limit = 10, 
      category,
      includeInsights = 'true',
      minConfidence = 0.6 
    } = req.query;
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // 1. 获取用户记忆
    let memoriesQuery = supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', user.id)
      .gte('confidence', parseFloat(minConfidence))
      .order('access_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit));
    
    // 如果指定了类别
    if (category) {
      memoriesQuery = memoriesQuery.eq('category', category);
    }
    
    const { data: memories, error: memoriesError } = await memoriesQuery;
    
    if (memoriesError) {
      throw memoriesError;
    }
    
    // 2. 获取当前有效的周期洞察
    let insights = [];
    if (includeInsights === 'true') {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: insightsData, error: insightsError } = await supabase
        .from('cycle_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .lte('valid_from', today)
        .gte('valid_until', today)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (!insightsError) {
        insights = insightsData || [];
      }
    }
    
    // 3. 获取最近的对话学习
    const { data: learnings, error: learningsError } = await supabase
      .from('conversation_learnings')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true)
      .order('created_at', { ascending: false })
      .limit(5);
    
    // 4. 更新访问计数
    if (memories?.length) {
      await updateAccessCounts(supabase, user.id, memories.map(m => m.id));
    }
    
    // 5. 格式化为提示词上下文
    const promptContext = formatForPrompt(memories || [], insights, learnings || []);
    
    // 6. 返回结果
    json(res, 200, {
      success: true,
      memories: memories || [],
      insights: insights,
      learnings: learnings || [],
      prompt_context: promptContext,
      total_memories: memories?.length || 0,
      total_insights: insights?.length || 0
    });
    
  } catch (error) {
    console.error('记忆检索失败:', error);
    json(res, 500, { 
      error: 'Memory retrieval failed',
      message: error.message 
    });
  }
};

/**
 * 更新记忆访问计数
 */
async function updateAccessCounts(supabase, userId, memoryIds) {
  if (!memoryIds.length) return;
  
  try {
    // 批量更新访问计数
    const { error } = await supabase
      .from('user_memories')
      .update({
        access_count: supabase.rpc('increment_access_count'),
        last_accessed: new Date().toISOString()
      })
      .eq('user_id', userId)
      .in('id', memoryIds);
    
    if (error) {
      console.error('更新访问计数失败:', error);
    }
  } catch (e) {
    console.error('更新访问计数异常:', e);
  }
}

/**
 * 格式化为提示词上下文
 */
function formatForPrompt(memories, insights, learnings) {
  let context = '';
  
  // 1. 长期记忆
  if (memories.length > 0) {
    context += '## 关于用户的长期记忆\n';
    
    // 按类别分组
    const byCategory = {};
    for (const m of memories) {
      if (!byCategory[m.category]) {
        byCategory[m.category] = [];
      }
      byCategory[m.category].push(m);
    }
    
    const categoryNames = {
      preference: '用户偏好',
      pattern: '行为模式',
      goal: '用户目标',
      concern: '关注点',
      fact: '已知事实'
    };
    
    for (const [cat, items] of Object.entries(byCategory)) {
      context += `\n### ${categoryNames[cat] || cat}\n`;
      for (const item of items.slice(0, 3)) { // 每类最多3条
        context += `- ${item.key}: ${item.value}\n`;
      }
    }
    
    context += '\n';
  }
  
  // 2. 周期洞察
  if (insights.length > 0) {
    context += '## 周期洞察\n';
    for (const insight of insights.slice(0, 3)) {
      context += `- ${insight.title}: ${insight.description}\n`;
    }
    context += '\n';
  }
  
  // 3. 对话学习
  if (learnings.length > 0) {
    context += '## 从对话中学到的\n';
    for (const learning of learnings.slice(0, 3)) {
      context += `- ${learning.content}\n`;
    }
    context += '\n';
  }
  
  // 4. 使用说明
  if (context) {
    context += '## 记忆使用指南\n';
    context += '以上是从用户历史对话和数据中提取的长期记忆。请在回复时自然地融入这些信息，让对话更个性化。不要机械地复述记忆内容，而是内化理解后用你自己的话表达。\n';
  }
  
  return context;
}
