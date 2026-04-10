/**
 * SurfMyCycle 记忆系统集成
 * 将Hermes风格的四层记忆架构集成到前端
 */

// ============================================================
// 模块: 记忆管理 (MEMORY_MANAGER)
// ============================================================

/**
 * 从服务器获取用户记忆
 * 对应Hermes的Prompt Memory加载
 */
async function fetchUserMemories(options = {}) {
  const { 
    limit = 10, 
    category = null,
    minConfidence = 0.6,
    includeInsights = true 
  } = options;
  
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      minConfidence: String(minConfidence),
      includeInsights: String(includeInsights)
    });
    
    if (category) {
      params.append('category', category);
    }
    
    const response = await apiRequest(`/memory-retrieve?${params.toString()}`);
    
    if (!response.ok) {
      console.error('获取记忆失败:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log('📚 已加载记忆:', {
        memories: data.total_memories,
        insights: data.total_insights
      });
      return data;
    }
    
    return null;
    
  } catch (error) {
    console.error('获取记忆异常:', error);
    return null;
  }
}

/**
 * 构建包含记忆的系统提示
 * 将记忆注入到AI系统提示中
 */
function buildMemoryEnhancedPrompt(basePrompt, memoryData) {
  if (!memoryData || !memoryData.prompt_context) {
    return basePrompt;
  }
  
  // 在系统提示开头加入记忆上下文
  const memoryContext = memoryData.prompt_context;
  
  return `${memoryContext}\n\n${basePrompt}`;
}

/**
 * 异步提取并保存记忆
 * 对应Hermes的学习循环
 */
async function extractAndSaveMemories(userMessage, aiReply, context = {}) {
  // 避免阻塞UI，异步执行
  setTimeout(async () => {
    try {
      const { cycleDay, currentRecord, recentRecords } = context;
      
      // 构建对话记录
      const conversation = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiReply }
      ];
      
      // 构建周期数据上下文
      const cycleData = {
        cycleDay,
        currentRecord: currentRecord || null,
        recentRecords: recentRecords || [],
        timestamp: new Date().toISOString()
      };
      
      // 调用记忆提取API
      const response = await apiRequest('/memory-extract', {
        method: 'POST',
        body: JSON.stringify({
          conversation,
          cycleData,
          userContext: {
            date: new Date().toISOString().split('T')[0],
            dayOfWeek: new Date().getDay()
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🧠 记忆提取完成:', {
          extracted: result.extracted,
          saved: result.saved
        });
      } else {
        console.error('记忆提取API失败:', response.status);
      }
      
    } catch (error) {
      console.error('记忆提取异常:', error);
      // 不抛出错误，避免影响用户体验
    }
  }, 100); // 延迟100ms执行，不阻塞主流程
}

/**
 * 记忆增强的buildAISystemPrompt
 * 替换原有的buildAISystemPrompt函数
 */
async function buildAISystemPromptWithMemory(params) {
  const {
    cfg,
    currentTimeStr,
    timeOfDay,
    phase,
    cycleDay,
    timeSlotName,
    longTermMemory,
    yesterdaySummary,
    recentContextText,
    dietIntervention,
    searchResults
  } = params;
  
  // 1. 获取AI风格模板
  const styleTemplate = getAiStyleTemplateMeta(getAiStyleTemplate(cfg));
  const companionName = getCompanionName(cfg);
  
  // 2. 获取用户记忆（新增）
  const memoryData = await fetchUserMemories({
    limit: 10,
    minConfidence: 0.6,
    includeInsights: true
  });
  
  // 3. 构建基础系统提示
  let systemPrompt = styleTemplate.prompt;
  
  // 4. 注入记忆上下文（如果存在）
  if (memoryData && memoryData.prompt_context) {
    systemPrompt = buildMemoryEnhancedPrompt(systemPrompt, memoryData);
  }
  
  // 5. 添加当前状态信息
  systemPrompt += `\n\n## 当前状态\n`;
  systemPrompt += `- 今天是：${currentTimeStr}\n`;
  
  if (cycleDay) {
    systemPrompt += `- 用户当前处于周期第${cycleDay}天\n`;
  }
  
  if (phase && phase.name) {
    systemPrompt += `- 当前阶段：${phase.name}\n`;
  }
  
  systemPrompt += `- 当前时段：${timeSlotName}\n`;
  
  // 6. 添加长期记忆（原有的IndexedDB记忆）
  if (longTermMemory) {
    systemPrompt += `\n## 长期记忆\n${longTermMemory}\n`;
  }
  
  // 7. 添加昨日总结
  if (yesterdaySummary) {
    systemPrompt += `\n## 昨日回顾\n${yesterdaySummary}\n`;
  }
  
  // 8. 添加近期上下文
  if (recentContextText) {
    systemPrompt += `\n## 近期记录\n${recentContextText}\n`;
  }
  
  // 9. 添加饮食干预建议
  if (dietIntervention) {
    systemPrompt += `\n## 饮食建议\n${dietIntervention.title}\n`;
    for (const tip of dietIntervention.tips || []) {
      systemPrompt += `- ${tip.icon} ${tip.text}（${tip.why}）\n`;
    }
  }
  
  // 10. 添加搜索结果
  if (searchResults && searchResults.length > 0) {
    systemPrompt += `\n## 相关资料\n`;
    for (const result of searchResults) {
      systemPrompt += `- ${result.title}: ${result.content.substring(0, 200)}...\n`;
    }
  }
  
  // 11. 添加回复指南
  systemPrompt += `\n## 回复指南\n`;
  systemPrompt += `- 你是用户的AI伙伴${companionName}，用${styleTemplate.label}风格回复\n`;
  systemPrompt += `- 回复要自然、温暖、实用\n`;
  systemPrompt += `- 如果有记忆上下文，请自然地融入回复中，不要机械复述\n`;
  systemPrompt += `- 如果不确定某些信息，诚实地说不知道\n`;
  
  return systemPrompt;
}

/**
 * 记忆管理器类
 * 提供更方便的记忆操作方法
 */
class MemoryManager {
  constructor() {
    this.cache = null;
    this.cacheTime = null;
    this.cacheTTL = 5 * 60 * 1000; // 5分钟缓存
  }
  
  /**
   * 获取记忆（带缓存）
   */
  async getMemories(options = {}) {
    const now = Date.now();
    
    // 检查缓存
    if (this.cache && this.cacheTime && (now - this.cacheTime) < this.cacheTTL) {
      console.log('📚 使用缓存的记忆');
      return this.cache;
    }
    
    // 获取新数据
    const memories = await fetchUserMemories(options);
    
    // 更新缓存
    if (memories) {
      this.cache = memories;
      this.cacheTime = now;
    }
    
    return memories;
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = null;
    console.log('🧠 记忆缓存已清除');
  }
  
  /**
   * 根据周期日获取相关洞察
   */
  async getInsightsForCycleDay(cycleDay) {
    const allData = await this.getMemories();
    if (!allData || !allData.insights) return [];
    
    // 过滤当前周期日相关的洞察
    return allData.insights.filter(insight => {
      if (!insight.trigger_conditions) return true;
      
      const { cycle_day_range, phase } = insight.trigger_conditions;
      
      // 检查周期日范围
      if (cycle_day_range && Array.isArray(cycle_day_range)) {
        const [start, end] = cycle_day_range;
        if (cycleDay < start || cycleDay > end) return false;
      }
      
      return true;
    });
  }
  
  /**
   * 获取特定类别的记忆
   */
  async getMemoriesByCategory(category) {
    const allData = await this.getMemories();
    if (!allData || !allData.memories) return [];
    
    return allData.memories.filter(m => m.category === category);
  }
}

// 创建全局记忆管理器实例
const memoryManager = new MemoryManager();

/**
 * 简化的记忆获取函数（供其他模块使用）
 */
async function getEnhancedMemoryContext(cycleDay) {
  const memories = await memoryManager.getMemories();
  const relevantInsights = await memoryManager.getInsightsForCycleDay(cycleDay);
  
  return {
    memories: memories?.memories || [],
    insights: relevantInsights,
    learnings: memories?.learnings || [],
    promptContext: memories?.prompt_context || ''
  };
}

// ============================================================
// 导出（如果是模块环境）
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MemoryManager,
    memoryManager,
    fetchUserMemories,
    buildMemoryEnhancedPrompt,
    extractAndSaveMemories,
    buildAISystemPromptWithMemory,
    getEnhancedMemoryContext
  };
}
