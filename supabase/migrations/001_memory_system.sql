-- SurfMyCycle 记忆系统数据库迁移
-- 基于Hermes四层记忆架构

-- 1. 用户长期记忆表 (对应Hermes Prompt Memory)
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 记忆内容
  category VARCHAR(50) NOT NULL CHECK (category IN ('preference', 'pattern', 'goal', 'concern', 'fact')),
  key VARCHAR(200) NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_accessed TIMESTAMP WITH TIME ZONE,
  
  -- 访问计数（用于记忆衰减）
  access_count INTEGER DEFAULT 0,
  
  -- 索引
  UNIQUE(user_id, category, key)
);

-- 2. 周期洞察记忆表 (从数据中自动提取)
CREATE TABLE IF NOT EXISTS cycle_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 洞察类型
  insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('phase_pattern', 'symptom_correlation', 'energy_trend', 'mood_pattern', 'cycle_prediction')),
  
  -- 洞察内容
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data_evidence JSONB DEFAULT '{}',
  
  -- 有效性
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE DEFAULT CURRENT_DATE + INTERVAL '90 days',
  is_active BOOLEAN DEFAULT true,
  
  -- 触发条件（何时激活这条记忆）
  trigger_conditions JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. 对话学习记忆表
CREATE TABLE IF NOT EXISTS conversation_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 来源
  conversation_date DATE DEFAULT CURRENT_DATE,
  extracted_from TEXT,
  
  -- 学习内容
  learning_type VARCHAR(50) NOT NULL CHECK (learning_type IN ('preference', 'fact', 'goal', 'concern', 'habit')),
  content TEXT NOT NULL,
  
  -- 验证状态
  is_verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(50),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. 记忆提取日志表
CREATE TABLE IF NOT EXISTS memory_extraction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID,
  extracted_memories JSONB DEFAULT '[]',
  extraction_success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. 启用RLS (Row Level Security)
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_extraction_logs ENABLE ROW LEVEL SECURITY;

-- 6. 创建RLS策略
CREATE POLICY user_memories_policy ON user_memories
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY cycle_insights_policy ON cycle_insights
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY conversation_learnings_policy ON conversation_learnings
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY memory_extraction_logs_policy ON memory_extraction_logs
  FOR ALL USING (auth.uid() = user_id);

-- 7. 创建索引优化查询
CREATE INDEX idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX idx_user_memories_category ON user_memories(category);
CREATE INDEX idx_user_memories_access_count ON user_memories(access_count DESC);

CREATE INDEX idx_cycle_insights_user_id ON cycle_insights(user_id);
CREATE INDEX idx_cycle_insights_active ON cycle_insights(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_cycle_insights_valid ON cycle_insights(user_id, valid_from, valid_until);

CREATE INDEX idx_conversation_learnings_user_id ON conversation_learnings(user_id);
CREATE INDEX idx_conversation_learnings_type ON conversation_learnings(learning_type);

-- 8. 创建自动更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_memories_updated_at BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cycle_insights_updated_at BEFORE UPDATE ON cycle_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. 创建访问计数递增函数
CREATE OR REPLACE FUNCTION increment_access_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN access_count + 1;
END;
$$ language 'plpgsql';

-- 10. 创建记忆衰减清理函数（可选：定期清理低访问记忆）
CREATE OR REPLACE FUNCTION cleanup_old_memories()
RETURNS void AS $$
BEGIN
  -- 删除90天未访问且置信度低的记忆
  DELETE FROM user_memories
  WHERE last_accessed < now() - INTERVAL '90 days'
    AND access_count < 3
    AND confidence < 0.6;
    
  -- 标记过期的洞察为非活跃
  UPDATE cycle_insights
  SET is_active = false
  WHERE valid_until < CURRENT_DATE
    AND is_active = true;
END;
$$ language 'plpgsql';
