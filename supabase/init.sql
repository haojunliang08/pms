-- ============================================================
-- 绩效管理系统 (PMS) 数据库初始化脚本
-- ============================================================
-- 
-- 使用说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制并执行此脚本
--
-- 表结构：
-- - branches: 子公司/地区表
-- - groups: 小组表
-- - users: 用户表（管理员/项目经理/员工，包含登录密码）
-- - performance_records: 绩效记录表
-- - quality_inspections: 质检数据表（Excel导入）
-- - minor_error_records: 低级错误记录表
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- 启用加密扩展（用于密码哈希）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 子公司/地区表
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,           -- 子公司名称
  code VARCHAR(20) UNIQUE,              -- 子公司编码（如：BJ、SH、GZ）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE branches IS '子公司/地区表，用于数据隔离';

-- ============================================================
-- 2. 小组表
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  manager_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, name)
);

COMMENT ON TABLE groups IS '小组表，每个子公司下有多个小组';

-- ============================================================
-- 3. 用户表（包含登录认证）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,           -- 姓名
  email VARCHAR(255) NOT NULL UNIQUE,   -- 邮箱（登录账号）
  password_hash VARCHAR(255) NOT NULL,  -- 密码哈希
  phone VARCHAR(20),                    -- 手机号
  role VARCHAR(20) NOT NULL DEFAULT 'employee',  -- 角色：admin/manager/employee
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,       -- 是否在职/账号是否启用
  last_login_at TIMESTAMPTZ,            -- 最后登录时间
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'employee'))
);

COMMENT ON TABLE users IS '用户表，包含登录认证信息';
COMMENT ON COLUMN users.password_hash IS '密码哈希，使用 pgcrypto 的 crypt 函数';
COMMENT ON COLUMN users.last_login_at IS '最后登录时间，用于会话管理';

-- 添加外键：小组负责人关联
ALTER TABLE groups 
ADD CONSTRAINT fk_groups_manager 
FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- 用户认证函数
-- ============================================================

-- 验证用户登录
CREATE OR REPLACE FUNCTION verify_user_login(
  p_email VARCHAR(255),
  p_password VARCHAR(255)
)
RETURNS TABLE(
  user_id UUID,
  user_name VARCHAR(100),
  user_email VARCHAR(255),
  user_role VARCHAR(20),
  user_branch_id UUID,
  user_group_id UUID
) AS $$
BEGIN
  -- 更新最后登录时间
  UPDATE users SET last_login_at = NOW()
  WHERE email = p_email 
    AND password_hash = crypt(p_password, password_hash)
    AND is_active = TRUE;
  
  -- 返回用户信息
  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.branch_id,
    u.group_id
  FROM users u
  WHERE u.email = p_email 
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建用户（管理员使用）
CREATE OR REPLACE FUNCTION create_user_with_password(
  p_name VARCHAR(100),
  p_email VARCHAR(255),
  p_password VARCHAR(255),
  p_role VARCHAR(20) DEFAULT 'employee',
  p_branch_id UUID DEFAULT NULL,
  p_group_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
BEGIN
  INSERT INTO users (name, email, password_hash, role, branch_id, group_id)
  VALUES (
    p_name,
    p_email,
    crypt(p_password, gen_salt('bf')),  -- 使用 bcrypt 哈希
    p_role,
    p_branch_id,
    p_group_id
  )
  RETURNING id INTO new_user_id;
  
  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 修改密码
CREATE OR REPLACE FUNCTION change_user_password(
  p_user_id UUID,
  p_new_password VARCHAR(255)
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE users 
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 重置密码（管理员使用）
CREATE OR REPLACE FUNCTION reset_user_password(
  p_user_id UUID,
  p_new_password VARCHAR(255)
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE users 
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. 绩效记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  period VARCHAR(20) NOT NULL,

  actual_attendance INTEGER DEFAULT 0,
  required_attendance INTEGER DEFAULT 22,
  annotation_count INTEGER DEFAULT 0,
  annotation_target INTEGER DEFAULT 1000,
  onsite_performance DECIMAL(3,2) DEFAULT 3.00,
  total_inspected INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  minor_error_count INTEGER DEFAULT 0,
  remarks TEXT,

  weight_attendance DECIMAL(5,2) DEFAULT 20.00,
  weight_annotation DECIMAL(5,2) DEFAULT 25.00,
  weight_onsite DECIMAL(5,2) DEFAULT 15.00,
  weight_accuracy DECIMAL(5,2) DEFAULT 30.00,
  weight_errors DECIMAL(5,2) DEFAULT 10.00,

  final_score DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, period)
);

-- ============================================================
-- 5. 质检数据表
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_inspections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  topic VARCHAR(200),
  batch_name VARCHAR(200),
  inspected_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, inspection_date, batch_name)
);

-- ============================================================
-- 6. 低级错误记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS minor_error_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL,
  error_date DATE NOT NULL,
  description TEXT,
  deduction_points INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 索引优化
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_performance_user ON performance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_period ON performance_records(period);
CREATE INDEX IF NOT EXISTS idx_inspections_user ON quality_inspections(user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON quality_inspections(inspection_date);

-- ============================================================
-- 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_updated_at
  BEFORE UPDATE ON performance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 绩效得分计算触发器
CREATE OR REPLACE FUNCTION calculate_performance_score()
RETURNS TRIGGER AS $$
DECLARE
  attendance_score DECIMAL;
  annotation_score DECIMAL;
  onsite_score DECIMAL;
  accuracy_score DECIMAL;
  error_deduction DECIMAL;
BEGIN
  IF NEW.required_attendance > 0 THEN
    attendance_score := (NEW.actual_attendance::DECIMAL / NEW.required_attendance) * 100;
  ELSE
    attendance_score := 100;
  END IF;
  
  IF NEW.annotation_target > 0 THEN
    annotation_score := LEAST((NEW.annotation_count::DECIMAL / NEW.annotation_target) * 100, 100);
  ELSE
    annotation_score := 100;
  END IF;
  
  onsite_score := (NEW.onsite_performance / 5) * 100;
  
  IF NEW.total_inspected > 0 THEN
    accuracy_score := (1 - (NEW.total_errors::DECIMAL / NEW.total_inspected)) * 100;
  ELSE
    accuracy_score := 100;
  END IF;
  
  error_deduction := NEW.minor_error_count * 3;
  
  NEW.final_score := 
    (attendance_score * NEW.weight_attendance / 100) +
    (annotation_score * NEW.weight_annotation / 100) +
    (onsite_score * NEW.weight_onsite / 100) +
    (accuracy_score * NEW.weight_accuracy / 100) -
    (error_deduction * NEW.weight_errors / 100);
  
  NEW.final_score := GREATEST(0, LEAST(100, NEW.final_score));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_performance_score_trigger
  BEFORE INSERT OR UPDATE ON performance_records
  FOR EACH ROW EXECUTE FUNCTION calculate_performance_score();

-- ============================================================
-- 初始数据
-- ============================================================

-- 插入子公司
INSERT INTO branches (name, code) VALUES
  ('北京总部', 'BJ'),
  ('上海分公司', 'SH'),
  ('广州分公司', 'GZ')
ON CONFLICT (code) DO NOTHING;

-- 插入管理员用户（默认密码：admin123）
INSERT INTO users (name, email, password_hash, role) VALUES
  ('系统管理员', 'admin@example.com', crypt('admin123', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO NOTHING;
