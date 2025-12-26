-- ============================================================
-- 绩效评分系统数据库迁移脚本
-- 执行方式：在 Supabase Dashboard -> SQL Editor 中执行
-- ============================================================

-- 1. 添加新字段到 performance_records 表
ALTER TABLE performance_records 
ADD COLUMN IF NOT EXISTS deduction_points DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deduction_reason TEXT,
ADD COLUMN IF NOT EXISTS bonus_points DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_reason TEXT;

-- 2. 如果存在 annotation_count 和 annotation_target，需要添加 annotation_score
-- 先检查是否需要（如果已经有annotation_score则跳过）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'performance_records' 
                   AND column_name = 'annotation_score') THEN
        ALTER TABLE performance_records 
        ADD COLUMN annotation_score DECIMAL(5,2) DEFAULT 80.00;
    END IF;
END $$;

-- 3. 删除旧字段（如果存在）
ALTER TABLE performance_records 
DROP COLUMN IF EXISTS minor_error_count,
DROP COLUMN IF EXISTS annotation_count,
DROP COLUMN IF EXISTS annotation_target,
DROP COLUMN IF EXISTS weight_errors;

-- 4. 更新默认权重值
ALTER TABLE performance_records 
ALTER COLUMN weight_annotation SET DEFAULT 20.00,
ALTER COLUMN weight_attendance SET DEFAULT 20.00,
ALTER COLUMN weight_onsite SET DEFAULT 20.00,
ALTER COLUMN weight_accuracy SET DEFAULT 40.00;

-- 5. 更新 final_score 字段类型以支持超过100或小于0的分数
ALTER TABLE performance_records 
ALTER COLUMN final_score TYPE DECIMAL(8,2);

-- 6. 更新得分计算触发器函数
CREATE OR REPLACE FUNCTION calculate_performance_score()
RETURNS TRIGGER AS $$
DECLARE
  attendance_score DECIMAL;
  onsite_score DECIMAL;
  accuracy_score DECIMAL;
  base_score DECIMAL;
BEGIN
  -- 出勤得分 (0-100)
  IF NEW.required_attendance > 0 THEN
    attendance_score := (NEW.actual_attendance::DECIMAL / NEW.required_attendance) * 100;
  ELSE
    attendance_score := 100;
  END IF;
  
  -- 现场表现得分 (1-5 -> 0-100)
  onsite_score := (NEW.onsite_performance / 5) * 100;
  
  -- 准确率得分 (0-100)
  IF NEW.total_inspected > 0 THEN
    accuracy_score := (1 - (NEW.total_errors::DECIMAL / NEW.total_inspected)) * 100;
  ELSE
    accuracy_score := 100;
  END IF;
  
  -- 计算加权基础分
  -- 权重：标注20% + 出勤20% + 现场20% + 准确率40%
  base_score := 
    (NEW.annotation_score * NEW.weight_annotation / 100) +
    (attendance_score * NEW.weight_attendance / 100) +
    (onsite_score * NEW.weight_onsite / 100) +
    (accuracy_score * NEW.weight_accuracy / 100);
  
  -- 最终得分 = 基础分 - 减分 + 加分（不限制范围，可超过100或小于0）
  NEW.final_score := base_score - COALESCE(NEW.deduction_points, 0) + COALESCE(NEW.bonus_points, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. 更新已有记录的权重值（如果需要）
UPDATE performance_records 
SET 
  weight_annotation = 20.00,
  weight_attendance = 20.00,
  weight_onsite = 20.00,
  weight_accuracy = 40.00,
  deduction_points = COALESCE(deduction_points, 0),
  bonus_points = COALESCE(bonus_points, 0)
WHERE weight_annotation IS NULL 
   OR weight_annotation != 20.00 
   OR weight_accuracy != 40.00;

-- 完成提示
SELECT '迁移完成！新的评分权重：标注20% + 出勤20% + 现场20% + 准确率40%' AS message;
