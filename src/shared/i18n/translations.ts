// 翻译映射表 — 中文/英文
export const zhCN = {
  // 标题栏
  menu_file: '文件', menu_edit: '编辑', menu_view: '视图', menu_help: '帮助', menu_settings: '设置', menu_plugins: '插件',
  // 面板
  panel_chat: '对话', panel_schedule: '中枢', panel_review: '审查', panel_editor: '执行体',
  panel_task_history: '历史任务', panel_blueprint: '工程蓝图', panel_add_exec: '添加执行体',
  // 工作区
  ws_review_schedule: '审查 / 中枢', ws_collapse: '« 收起', ws_expand: '展开面板',
  // 对话
  chat_placeholder: '输入开发指令...', chat_empty: '输入你的开发需求，开始对话', chat_send: '发送',
  // 中枢
  sched_decompose: '拆解', sched_decomposing: '拆解中...', sched_placeholder: '输入需求描述，AI 拆解任务...',
  sched_empty: '输入需求，AI 自动拆解为开发任务', sched_status_pending: '待执行', sched_status_running: '拆解中',
  sched_status_done: '已完成', sched_status_failed: '失败',
  // 审查
  review_review: '审查', review_decomposing: '审查中...', review_placeholder: '粘贴代码片段，AI 审查安全/规范/性能...',
  review_empty: '粘贴代码，AI 自动审查', review_pass: '通过', review_warn: '警告', review_reject: '打回',
  review_count: '审查记录',
  // 编辑器
  editor_run: '运行', editor_format: '格式化', editor_generate: '生成', editor_generating: '生成中...',
  editor_placeholder: '描述需求，例如：写一个 React 登录表单', editor_default: '输入需求，AI 自动生成代码',
  editor_loading: '生成中...', editor_failed: '生成失败，请重试',
  // 终端
  terminal_expert_mode: '底层专家模式', terminal_back: '返回主界面',
  terminal_201: '中枢调度控制台', terminal_301: '审查纠偏控制台', terminal_401: '执行逻辑控制台',
  terminal_unknown: '未知控制台', terminal_placeholder: '向 Agent 发送人工干预指令...', terminal_send: '发送',
  // 状态栏
  status_add_exec: '添加执行体', status_system_log: '系统日志',
  // 历史任务
  task_new: '+ 新建任务', task_unknown: '未知任务',
  // 蓝图
  blueprint_current_view: '当前视图', blueprint_loading: '加载中...',
  blueprint_error: '无法读取文件', blueprint_requirements: '需求清单',
  blueprint_goals: '目标对齐', blueprint_architecture: '架构结构树',
  blueprint_review_rules: '审查规则明细',
  blueprint_steps: '项目开发步骤', blueprint_summary: '总结汇报',
  // 审查
  review_error: '审查调用失败',
  // 执行体标题模板
  panel_exec_n: '执行体 {n}',
  // 系统日志面板
  syslog_title: '系统日志', syslog_empty: '暂无日志', syslog_clear: '清空',
  syslog_start: '启动日志', syslog_stop: '停止日志',
  syslog_tab_all: '全部', syslog_tab_chat: '对话', syslog_tab_center: '中枢',
  syslog_tab_review: '审查', syslog_tab_exec: '执行', syslog_tab_agent: 'Agent',
  syslog_tab_api: 'API', syslog_tab_broadcast: '广播',
  syslog_tab_read: '阅读', syslog_tab_save: '保存', syslog_tab_error: '错误',
  // 设置
  settings_title: '设置', settings_close: '关闭',
  settings_general: '通用', settings_appearance: '外观', settings_language: '语言',
  settings_model: '模型', settings_api: 'API 密钥', settings_about: '关于',
  // 通用
  general_title: '通用设置',
  // 外观
  appearance_title: '外观设置', appearance_theme: '主题', appearance_dark: '暗黑', appearance_light: '亮色',
  // 语言
  lang_title: '语言设置', lang_label: '界面语言', lang_zh: '中文', lang_en: 'English',
  // API
  api_title: 'API 密钥管理', api_subtitle: '密钥经操作系统密钥链加密存储。仅在调用 AI 时解密到内存。',
  api_cloud: '云端模型（需密钥）', api_local: '本地模型（无需密钥）', api_always_on: '始终可用',
  api_save: '保存', api_saved: '已保存', api_delete: '删除', api_add_custom: '+ 添加自定义模型',
  api_custom_name: '模型标识', api_custom_url: 'API 地址', api_custom_key: 'API Key',
  api_encrypt_note: '密钥存入磁盘前经 safeStorage.encryptString() 加密（Windows DPAPI / macOS Keychain）。只有本机上的同一操作系统用户才能解密。',
  // 关于
  about_title: '关于 Goleynx', about_version: '版本：0.1.0',
  about_desc1: '多 Agent 协同开发桌面平台', about_desc2: '让普通人也能通过对话驱动软件开发',
  // 401 工作区
  ws_pop_out: '弹出', ws_pop_back: '收回',
  ws_pop_title: '弹出文件树到 101 空间', ws_pop_back_title: '收回文件树到 401',
  ws_label: 'workspace', ws_status: '状态',
  ws_status_expand: '展开状态栏', ws_status_collapse: '收起状态栏',
  ws_empty_files: '暂无文件', ws_empty_status: '暂无状态',
  ws_loading: '加载中...', ws_code_area: '代码区',
  ws_editor_loading: '加载编辑器...',
  // 提交/终止
  btn_submit: '提交', btn_submit_title: '把这轮对话正式提交给开发流程',
  btn_stop: '终止', btn_stop_title: '终止本轮开发，全链路停止',
  // 轮次状态
  round_label: '当前运行轮次:', round_idle: '空闲', round_running: '运行中',
  round_queued: '排队中', round_stopped: '已中止',
  // 中枢面板
  sched_no_items: '暂无调度任务',
}

export const enUS: typeof zhCN = {
  menu_file: 'File', menu_edit: 'Edit', menu_view: 'View', menu_help: 'Help', menu_settings: 'Settings', menu_plugins: 'Plugins',
  panel_chat: 'Chat', panel_schedule: 'Scheduler', panel_review: 'Review', panel_editor: 'Executor',
  panel_task_history: 'History', panel_blueprint: 'Blueprint', panel_add_exec: 'Add Executor',
  ws_review_schedule: 'Review / Scheduler', ws_collapse: '« Collapse', ws_expand: 'Expand',
  chat_placeholder: 'Enter a development command...', chat_empty: 'Enter your request to start', chat_send: 'Send',
  sched_decompose: 'Decompose', sched_decomposing: 'Decomposing...', sched_placeholder: 'Describe the requirement...',
  sched_empty: 'Enter a requirement for AI task decomposition',
  sched_status_pending: 'Pending', sched_status_running: 'Running', sched_status_done: 'Done', sched_status_failed: 'Failed',
  review_review: 'Review', review_decomposing: 'Reviewing...', review_placeholder: 'Paste code for security/style/performance review...',
  review_empty: 'Paste code for AI review', review_pass: 'Pass', review_warn: 'Warn', review_reject: 'Reject',
  review_count: 'Review Records',
  editor_run: 'Run', editor_format: 'Format', editor_generate: 'Generate', editor_generating: 'Generating...',
  editor_placeholder: 'Describe what to build, e.g. Create a React login form',
  editor_default: 'Enter requirement for AI code generation', editor_loading: 'Generating...', editor_failed: 'Generation failed, retry',
  terminal_expert_mode: 'Expert Mode', terminal_back: 'Back', terminal_201: 'Scheduler Console',
  terminal_301: 'Review Console', terminal_401: 'Executor Console', terminal_unknown: 'Unknown Console',
  terminal_placeholder: 'Send manual intervention...', terminal_send: 'Send',
  status_add_exec: 'Add Executor', status_system_log: 'System Log',
  task_new: '+ New Task', task_unknown: 'Unknown Task',
  blueprint_current_view: 'Current View', blueprint_loading: 'Loading...',
  blueprint_error: 'Cannot read file', blueprint_requirements: 'Requirements',
  blueprint_goals: 'Goals', blueprint_architecture: 'Architecture',
  blueprint_review_rules: 'Review Rules',
  blueprint_steps: 'Dev Steps', blueprint_summary: 'Summary',
  review_error: 'Review failed',
  panel_exec_n: 'Executor {n}',
  syslog_title: 'System Log', syslog_empty: 'No logs yet', syslog_clear: 'Clear',
  syslog_start: 'Start Log', syslog_stop: 'Stop Log',
  syslog_tab_all: 'All', syslog_tab_chat: 'Chat', syslog_tab_center: 'Center',
  syslog_tab_review: 'Review', syslog_tab_exec: 'Exec', syslog_tab_agent: 'Agent',
  syslog_tab_api: 'API', syslog_tab_broadcast: 'BCast',
  syslog_tab_read: 'Read', syslog_tab_save: 'Save', syslog_tab_error: 'Errors',
  settings_title: 'Settings', settings_close: 'Close',
  settings_general: 'General', settings_appearance: 'Appearance', settings_language: 'Language',
  settings_model: 'Model', settings_api: 'API Keys', settings_about: 'About',
  general_title: 'General Settings',
  appearance_title: 'Appearance', appearance_theme: 'Theme', appearance_dark: 'Dark', appearance_light: 'Light',
  lang_title: 'Language', lang_label: 'Language', lang_zh: '中文', lang_en: 'English',
  api_title: 'API Key Management', api_subtitle: 'Keys encrypted via OS keychain. Decrypted in-memory only for AI calls.',
  api_cloud: 'Cloud Models (Key Required)', api_local: 'Local Models (No Key)', api_always_on: 'Always Available',
  api_save: 'Save', api_saved: 'Saved', api_delete: 'Delete', api_add_custom: '+ Add Custom',
  api_custom_name: 'Model ID', api_custom_url: 'API URL', api_custom_key: 'API Key',
  api_encrypt_note: 'Keys encrypted with safeStorage.encryptString() (Windows DPAPI / macOS Keychain). Only the same OS user can decrypt.',
  about_title: 'About Goleynx', about_version: 'Version: 0.1.0',
  about_desc1: 'Multi-Agent Collaborative Development Desktop Platform', about_desc2: 'Drive software development through conversation',
  ws_pop_out: 'Pop Out', ws_pop_back: 'Back',
  ws_pop_title: 'Pop file tree to 101', ws_pop_back_title: 'Bring back to 401',
  ws_label: 'workspace', ws_status: 'Status',
  ws_status_expand: 'Expand status', ws_status_collapse: 'Collapse status',
  ws_empty_files: 'No files', ws_empty_status: 'No status',
  ws_loading: 'Loading...', ws_code_area: 'Code',
  ws_editor_loading: 'Loading editor...',
  btn_submit: 'Submit', btn_submit_title: 'Submit for development flow',
  btn_stop: 'Stop', btn_stop_title: 'Stop development, halt all',
  round_label: 'Round:', round_idle: 'Idle', round_running: 'Running',
  round_queued: 'Queued', round_stopped: 'Stopped',
  sched_no_items: 'No schedule tasks',
}

export type LangKey = keyof typeof zhCN
