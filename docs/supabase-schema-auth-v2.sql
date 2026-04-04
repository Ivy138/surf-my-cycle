-- Surf My Cycle 安全升级版 SQL
-- 目标：
-- 1. 使用 Supabase Auth 管理账号
-- 2. user_id 存 auth.users.id 的字符串
-- 3. 开启严格 RLS，禁止匿名读写

-- 如果旧策略还在，先删除
DROP POLICY IF EXISTS "Allow all" ON records;
DROP POLICY IF EXISTS "Allow all" ON config;
DROP POLICY IF EXISTS "Allow all" ON conversations;
DROP POLICY IF EXISTS "Allow all" ON memory;

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;

-- 只允许用户访问自己的数据
CREATE POLICY "records_select_own" ON records
FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "records_insert_own" ON records
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "records_update_own" ON records
FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "records_delete_own" ON records
FOR DELETE
USING (auth.uid()::text = user_id);

CREATE POLICY "config_select_own" ON config
FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "config_insert_own" ON config
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "config_update_own" ON config
FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "config_delete_own" ON config
FOR DELETE
USING (auth.uid()::text = user_id);

CREATE POLICY "conversations_select_own" ON conversations
FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "conversations_insert_own" ON conversations
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "conversations_update_own" ON conversations
FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "conversations_delete_own" ON conversations
FOR DELETE
USING (auth.uid()::text = user_id);

CREATE POLICY "memory_select_own" ON memory
FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "memory_insert_own" ON memory
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "memory_update_own" ON memory
FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "memory_delete_own" ON memory
FOR DELETE
USING (auth.uid()::text = user_id);

-- 可选：给 user_id 建索引
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_user_id ON memory(user_id);
