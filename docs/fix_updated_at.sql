-- 修复 records 表：添加 updated_at 字段
ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 更新现有记录的 updated_at
UPDATE records SET updated_at = created_at WHERE updated_at IS NULL;
