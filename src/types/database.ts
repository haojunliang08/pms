/**
 * 绩效管理系统 - 数据库类型定义
 * 
 * 这个文件定义了系统中所有数据表的 TypeScript 类型，
 * 确保前端代码与数据库结构保持一致，提供类型安全。
 */

// ============================================================
// 基础类型
// ============================================================

/** 用户角色类型 */
export type UserRole = 'admin' | 'manager' | 'employee'

/** 用户角色中文名称 */
export const UserRoleLabels: Record<UserRole, string> = {
    admin: '超级管理员',
    manager: '项目经理',
    employee: '普通员工',
}

// ============================================================
// 数据表类型
// ============================================================

/**
 * 子公司/地区
 */
export interface Branch {
    id: string                  // 唯一标识（UUID）
    name: string                // 子公司名称
    code: string | null         // 子公司编码（如：BJ、SH）
    created_at: string          // 创建时间
}

/**
 * 小组
 */
export interface Group {
    id: string                  // 唯一标识
    branch_id: string           // 所属子公司ID
    name: string                // 小组名称
    manager_id: string | null   // 小组负责人ID
    created_at: string          // 创建时间
    // 关联数据（查询时可选）
    branch?: Branch             // 所属子公司信息
    manager?: User              // 负责人信息
}

/**
 * 用户（管理员/项目经理/员工）
 */
export interface User {
    id: string                  // 唯一标识
    name: string                // 姓名
    email: string               // 邮箱（登录账号）
    phone: string | null        // 手机号
    role: UserRole              // 角色
    branch_id: string | null    // 所属子公司ID
    group_id: string | null     // 所属小组ID
    is_active: boolean          // 是否在职/启用
    last_login_at: string | null // 最后登录时间
    created_at: string          // 创建时间
    updated_at: string          // 更新时间
    // 关联数据（查询时可选）
    branch?: Branch             // 所属子公司
    group?: Group               // 所属小组
}

/**
 * 绩效记录
 */
export interface PerformanceRecord {
    id: string                  // 唯一标识
    user_id: string             // 员工ID
    branch_id: string           // 子公司ID
    group_id: string | null     // 小组ID
    period: string              // 考核周期（格式：YYYY-MM）

    // 出勤数据
    actual_attendance: number   // 实际出勤天数
    required_attendance: number // 应出勤天数

    // 标注数据
    annotation_count: number    // 当月标注数量
    annotation_target: number   // 标注目标数量

    // 现场表现（1-5分）
    onsite_performance: number

    // 质检数据汇总
    total_inspected: number     // 总质检题目数
    total_errors: number        // 总错误题目数

    // 低级错误
    minor_error_count: number   // 低级错误次数

    // 备注
    remarks: string | null

    // 权重配置（百分比）
    weight_attendance: number   // 出勤权重
    weight_annotation: number   // 标注权重
    weight_onsite: number       // 现场表现权重
    weight_accuracy: number     // 准确率权重
    weight_errors: number       // 低级错误权重

    // 最终得分
    final_score: number | null

    created_at: string
    updated_at: string

    // 关联数据
    user?: User
    branch?: Branch
    group?: Group
}

/**
 * 质检数据（Excel导入）
 */
export interface QualityInspection {
    id: string                  // 唯一标识
    user_id: string             // 标注人员ID
    branch_id: string           // 子公司ID
    inspection_date: string     // 质检日期（YYYY-MM-DD）
    topic: string | null        // 所属topic
    batch_name: string | null   // 批次名称
    inspected_count: number     // 被质检题目数量
    error_count: number         // 错误题目数量
    created_at: string

    // 关联数据
    user?: User
}

/**
 * 低级错误记录
 */
export interface MinorErrorRecord {
    id: string                  // 唯一标识
    user_id: string             // 员工ID
    branch_id: string           // 子公司ID
    period: string              // 所属考核周期
    error_date: string          // 错误发生日期
    description: string | null  // 错误描述
    deduction_points: number    // 扣分（默认3分）
    created_at: string

    // 关联数据
    user?: User
}

// ============================================================
// 表单输入类型
// ============================================================

/** 新建子公司 */
export type BranchInsert = Omit<Branch, 'id' | 'created_at'>

/** 新建小组 */
export type GroupInsert = Omit<Group, 'id' | 'created_at' | 'branch' | 'manager'>

/** 新建用户 */
export type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at' | 'branch' | 'group'>

/** 新建绩效记录 */
export type PerformanceRecordInsert = Omit<PerformanceRecord,
    'id' | 'created_at' | 'updated_at' | 'final_score' | 'user' | 'branch' | 'group'>

/** 新建质检数据 */
export type QualityInspectionInsert = Omit<QualityInspection, 'id' | 'created_at' | 'user'>

/** 新建低级错误记录 */
export type MinorErrorRecordInsert = Omit<MinorErrorRecord, 'id' | 'created_at' | 'user'>

// ============================================================
// Excel 导入相关类型
// ============================================================

/**
 * Excel质检数据行格式
 * 对应Excel列：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量
 */
export interface ExcelInspectionRow {
    date: string                // 日期
    annotator_name: string      // 标注人员姓名
    topic: string               // 所属topic
    batch_name: string          // 批次名称
    inspected_count: number     // 被质检题目数量
    error_count: number         // 错误题目数量
}

// ============================================================
// 统计数据类型
// ============================================================

/** 仪表盘统计数据 */
export interface DashboardStats {
    totalEmployees: number      // 员工总数
    totalGroups: number         // 小组数量
    pendingRecords: number      // 待处理绩效记录
    averageScore: number        // 平均绩效得分
}

/** 绩效得分详情 */
export interface PerformanceScoreDetail {
    attendance_score: number    // 出勤得分
    annotation_score: number    // 标注得分
    onsite_score: number        // 现场表现得分
    accuracy_score: number      // 准确率得分
    error_deduction: number     // 低级错误扣分
    final_score: number         // 最终得分
}
