/**
 * ============================================================================
 * database.ts - 数据库类型定义文件
 * ============================================================================
 * 
 * 【文件作用】
 * 定义系统中所有数据表对应的 TypeScript 类型。
 * 让前端代码在编译时就能检查数据结构是否正确，提高代码质量。
 * 
 * 【为什么需要类型定义】
 * 1. 代码提示 - 编辑器会提示对象有哪些属性可以访问
 * 2. 编译检查 - 访问不存在的属性时会报错，避免运行时错误
 * 3. 文档作用 - 类型定义清晰说明了数据结构
 * 4. 重构安全 - 修改数据结构时，TypeScript 会标出所有需要更新的地方
 * 
 * 【TypeScript 基础语法】
 * - interface: 定义对象的形状（有哪些属性、属性是什么类型）
 * - type: 定义类型别名，可以是联合类型、交叉类型等
 * - |: 联合类型，表示"或"的关系
 * - &: 交叉类型，表示"且"的关系
 * - ?: 可选属性，可以存在也可以不存在
 * - Omit<T, K>: 工具类型，从 T 中排除 K 指定的属性
 * - Record<K, V>: 工具类型，键为 K 类型、值为 V 类型的对象
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 用户角色类型
 * 
 * 使用字面量联合类型定义，只能是这三个值之一：
 * - 'admin': 超级管理员，拥有所有权限
 * - 'manager': 项目经理，可以管理自己小组的员工
 * - 'employee': 普通员工，只能查看自己相关的数据
 * 
 * 这种方式比使用枚举(enum)更简洁，且与 JavaScript 字符串兼容
 */
export type UserRole = 'admin' | 'manager' | 'employee'

/**
 * 用户角色中文名称映射
 * 
 * Record<K, V> 是 TypeScript 内置工具类型
 * Record<UserRole, string> 表示一个对象：
 * - 键的类型是 UserRole（即 'admin' | 'manager' | 'employee'）
 * - 值的类型是 string
 * 
 * 使用 as const 可以让 TypeScript 推断出更精确的类型
 * 这里没有使用，因为我们显式指定了类型
 */
export const UserRoleLabels: Record<UserRole, string> = {
    admin: '超级管理员',
    manager: '项目经理',
    employee: '普通员工',
}

// ============================================================================
// 数据表类型定义
// ============================================================================

/**
 * 子公司/地区 (branches 表)
 * 
 * interface 用于定义对象的"形状"
 * 每个属性由"属性名: 类型"组成
 * 
 * | null 表示该属性可以是 null 值（数据库中的 NULL）
 * 这与 ? (可选属性) 不同：
 * - ?: 属性可以不存在
 * - | null: 属性必须存在，但值可以是 null
 */
export interface Branch {
    id: string                  // 唯一标识（UUID格式，如：'550e8400-e29b-41d4-a716-446655440000'）
    name: string                // 子公司名称（如：'北京总部'、'上海分公司'）
    code: string | null         // 子公司编码（如：'BJ'、'SH'），可以为空
    created_at: string          // 创建时间（ISO 8601 格式字符串，如：'2024-01-01T12:00:00.000Z'）
}

/**
 * 小组 (groups 表)
 * 
 * 小组是组织架构的第二层，每个小组属于一个子公司
 * 
 * 关于可选属性 (?)
 * branch?: Branch 表示这个属性可能存在也可能不存在
 * 这通常用于：
 * - 从数据库查询时，关联数据可能没有一起查询出来
 * - 使用 Supabase 的 select('*, branch:branches(*)') 查询时才会有值
 */
export interface Group {
    id: string                  // 唯一标识（UUID）
    branch_id: string           // 所属子公司ID（外键，关联 branches.id）
    name: string                // 小组名称（如：'标注一组'、'质检组'）
    manager_id: string | null   // 小组负责人ID（外键，关联 users.id），可以为空
    created_at: string          // 创建时间

    // ========== 关联数据（查询时可选填充） ==========
    // 这些属性在基本查询时不存在
    // 只有使用 join 查询（如 select('*, branch:branches(*)')）时才会有值
    branch?: Branch             // 所属子公司的完整信息
    manager?: User              // 负责人的完整信息
}

/**
 * 用户 (users 表)
 * 
 * 系统中的所有人员都是用户，通过 role 字段区分权限
 * 一个用户可以属于一个子公司和一个小组
 */
export interface User {
    id: string                  // 唯一标识（UUID）
    name: string                // 姓名（如：'张三'）
    email: string               // 邮箱，也是登录账号（如：'zhangsan@company.com'）
    phone: string | null        // 手机号，可以为空
    role: UserRole              // 角色（使用上面定义的联合类型）
    branch_id: string | null    // 所属子公司ID，管理员可能没有
    group_id: string | null     // 所属小组ID，管理员可能没有
    is_active: boolean          // 是否在职/账号是否启用
    last_login_at: string | null // 最后登录时间，新用户可能为空
    created_at: string          // 创建时间
    updated_at: string          // 最后更新时间

    // ========== 关联数据 ==========
    branch?: Branch             // 所属子公司信息
    group?: Group               // 所属小组信息
}

/**
 * 绩效记录 (performance_records 表)
 * 
 * 每条记录对应一个员工在一个月份的绩效评估
 * 包含多个维度的数据和权重配置
 * 
 * 绩效计算公式：
 * 最终得分 = 出勤得分×权重 + 标注得分×权重 + 现场表现得分×权重 + 准确率得分×权重 - 低级错误扣分
 */
export interface PerformanceRecord {
    id: string                  // 唯一标识
    user_id: string             // 员工ID（外键）
    branch_id: string           // 子公司ID（冗余存储，方便查询过滤）
    group_id: string | null     // 小组ID（冗余存储）
    period: string              // 考核周期，格式：'YYYY-MM'（如：'2024-01'）

    // ========== 出勤数据 ==========
    actual_attendance: number   // 实际出勤天数（如：22）
    required_attendance: number // 应出勤天数（如：23）
    // 出勤率 = actual_attendance / required_attendance

    // ========== 标注数据 ==========
    annotation_count: number    // 当月完成的标注数量
    annotation_target: number   // 标注目标数量
    // 完成率 = annotation_count / annotation_target

    // ========== 现场表现 ==========
    onsite_performance: number  // 现场表现评分，1-5分

    // ========== 质检数据汇总 ==========
    total_inspected: number     // 总被质检题目数
    total_errors: number        // 总错误题目数
    // 准确率 = (total_inspected - total_errors) / total_inspected

    // ========== 低级错误 ==========
    minor_error_count: number   // 低级错误次数
    // 低级错误每次扣3分

    // ========== 备注 ==========
    remarks: string | null      // 备注信息

    // ========== 权重配置（百分比，如20表示20%） ==========
    weight_attendance: number   // 出勤权重
    weight_annotation: number   // 标注权重
    weight_onsite: number       // 现场表现权重
    weight_accuracy: number     // 准确率权重
    weight_errors: number       // 低级错误权重（实际是扣分系数）

    // ========== 最终得分 ==========
    final_score: number | null  // 最终绩效得分，可能还未计算

    created_at: string
    updated_at: string

    // ========== 关联数据 ==========
    user?: User
    branch?: Branch
    group?: Group
}

/**
 * 质检数据 (quality_inspections 表)
 * 
 * 通过 Excel 导入的原始质检记录
 * 每条记录对应一次质检（某员工某天某批次的质检结果）
 */
export interface QualityInspection {
    id: string                  // 唯一标识
    user_id: string             // 被质检的员工ID（标注人员）
    branch_id: string           // 子公司ID
    inspection_date: string     // 质检日期，格式：'YYYY-MM-DD'
    topic: string | null        // 所属 topic（任务分类）
    batch_name: string | null   // 批次名称
    inspected_count: number     // 被质检题目数量
    error_count: number         // 错误题目数量
    // 准确率 = (inspected_count - error_count) / inspected_count × 100%
    created_at: string          // 数据导入时间

    // ========== 关联数据 ==========
    user?: User                 // 标注人员信息
}

/**
 * 低级错误记录 (minor_error_records 表)
 * 
 * 记录员工犯的低级错误，每次扣3分
 * 如：明显的标注错误、违反操作规范等
 */
export interface MinorErrorRecord {
    id: string                  // 唯一标识
    user_id: string             // 员工ID
    branch_id: string           // 子公司ID
    period: string              // 所属考核周期，格式：'YYYY-MM'
    error_date: string          // 错误发生日期
    description: string | null  // 错误描述
    deduction_points: number    // 扣分（默认3分）
    created_at: string

    // ========== 关联数据 ==========
    user?: User
}

// ============================================================================
// 表单输入类型（用于新建/更新操作）
// ============================================================================

/**
 * 新建子公司时的输入类型
 * 
 * Omit<T, K> 是 TypeScript 工具类型
 * Omit<Branch, 'id' | 'created_at'> 的意思是：
 * "从 Branch 类型中移除 id 和 created_at 属性"
 * 
 * 为什么要移除？
 * - id 是数据库自动生成的 UUID
 * - created_at 是数据库自动设置的时间戳
 * - 新建时不需要也不应该由前端提供这些值
 */
export type BranchInsert = Omit<Branch, 'id' | 'created_at'>

/** 新建小组时的输入类型 */
export type GroupInsert = Omit<Group, 'id' | 'created_at' | 'branch' | 'manager'>

/** 新建用户时的输入类型 */
export type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at' | 'branch' | 'group'>

/** 新建绩效记录时的输入类型 */
export type PerformanceRecordInsert = Omit<PerformanceRecord,
    'id' | 'created_at' | 'updated_at' | 'final_score' | 'user' | 'branch' | 'group'>

/** 新建质检数据时的输入类型 */
export type QualityInspectionInsert = Omit<QualityInspection, 'id' | 'created_at' | 'user'>

/** 新建低级错误记录时的输入类型 */
export type MinorErrorRecordInsert = Omit<MinorErrorRecord, 'id' | 'created_at' | 'user'>

// ============================================================================
// Excel 导入相关类型
// ============================================================================

/**
 * Excel 质检数据行格式
 * 
 * 对应 Excel 文件的列结构
 * 导入数据页面会将 Excel 的每一行解析成这个格式
 */
export interface ExcelInspectionRow {
    date: string                // 日期（原始格式可能是：2024-01-01 或 2024/1/1 或 Excel日期序号）
    annotator_name: string      // 标注人员姓名（需要匹配系统中的用户）
    topic: string               // 所属 topic
    batch_name: string          // 批次名称
    inspected_count: number     // 被质检题目数量
    error_count: number         // 错误题目数量
}

// ============================================================================
// 统计数据类型
// ============================================================================

/**
 * 仪表盘统计数据
 * 
 * 用于首页展示的汇总数据
 */
export interface DashboardStats {
    totalEmployees: number      // 员工总数
    totalGroups: number         // 小组数量
    pendingRecords: number      // 待处理绩效记录数
    averageScore: number        // 平均绩效得分
}

/**
 * 绩效得分详情
 * 
 * 展示绩效各维度的具体得分
 */
export interface PerformanceScoreDetail {
    attendance_score: number    // 出勤得分（满分由权重决定）
    annotation_score: number    // 标注得分
    onsite_score: number        // 现场表现得分
    accuracy_score: number      // 准确率得分
    error_deduction: number     // 低级错误扣分（负数）
    final_score: number         // 最终得分（各项之和减去扣分）
}
