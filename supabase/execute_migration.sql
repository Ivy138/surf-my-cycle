-- SurfMyCycle 记忆系统 - 一键执行SQL
-- 复制以下全部内容到 Supabase Dashboard → SQL Editor → New Query → 粘贴 → Run

-- ==========================================
-- 1. 创建用户记忆表
-- ==========================================
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL CHECK (category IN ('preference', 'pattern', 'goal', 'concern', 'fact')),
  key VARCHAR(200) NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_accessed TIMESTAMP WITH TIME ZONE,
  access_count INTEGER DEFAULT 0,
  UNIQUE(user_id, category, key)
);

-- ==========================================
-- 2. 创建周期洞察表
-- ==========================================
CREATE TABLE IF NOT EXISTS cycle_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('phase_pattern', 'symptom_correlation', 'energy_trend', 'mood_pattern', 'cycle_prediction')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data_evidence JSONB DEFAULT '{}',
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE DEFAULT CURRENT_DATE + INTERVAL '90 days',
  is_active BOOLEAN DEFAULT true,
  trigger_conditions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==========================================
-- 3. 创建对话学习表
-- ==========================================
CREATE TABLE IF NOT EXISTS conversation_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_date DATE DEFAULT CURRENT_DATE,
  extracted_from TEXT,
  learning_type VARCHAR(50) NOT NULL CHECK (learning_type IN ('preference', 'fact', 'goal', 'concern', 'habit')),
  content TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==========================================
-- 4. 创建记忆提取日志表
-- ==========================================
CREATE TABLE IF NOT EXISTS memory_extraction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID,
  extracted_memories JSONB DEFAULT '[]',
  extraction_success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==========================================
-- 5. 启用RLS (行级安全)
-- ==========================================
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_extraction_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. 创建安全策略
-- ==========================================
DROP POLICY IF EXISTS user_memories_policy ON user_memories;
CREATE POLICY user_memories_policy ON user_memories
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cycle_insights_policy ON cycle_insights;
CREATE POLICY cycle_insights_policy ON cycle_insights
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS conversation_learnings_policy ON conversation_learnings;
CREATE POLICY conversation_learnings_policy ON conversation_learnings
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS memory_extraction_logs_policy ON memory_extraction_logs;
CREATE POLICY memory_extraction_logs_policy ON memory_extraction_logs
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 7. 创建索引
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_category ON user_memories(category);
CREATE INDEX IF NOT EXISTS idx_user_memories_access ON user_memories(access_count DESC);

CREATE INDEX IF NOT EXISTS idx_cycle_insights_user_id ON cycle_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_cycle_insights_active ON cycle_insights(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_learnings_user_id ON conversation_learnings(user_id);

-- ==========================================
-- 8. 自动更新时间戳函数
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 创建触发器
DROP TRIGGER IF EXISTS update_user_memories_updated_at ON user_memories;
CREATE TRIGGER update_user_memories_updated_at 
  BEFORE UPDATE ON user_memories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cycle_insights_updated_at ON cycle_insights;
CREATE TRIGGER update_cycle_insights_updated_at 
  BEFORE UPDATE ON cycle_insights 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- ✅ 完成！
-- ==========================================
