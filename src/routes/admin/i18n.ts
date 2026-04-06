export const supportedAdminLocales = ["en", "zh-CN"] as const

export type AdminLocale = (typeof supportedAdminLocales)[number]

export const adminMessages: Record<AdminLocale, Record<string, string>> = {
  en: {
    "app.title": "Copilot API - Dashboard",
    "language.label": "Language",
    "language.en": "English",
    "language.zhCN": "简体中文",
    "common.refresh": "Refresh",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.loading": "Loading...",
    "common.delete": "Delete",
    "common.copy": "Copy",
    "common.model": "model",
    "nav.accounts": "Accounts",
    "nav.settings": "Settings",
    "nav.models": "Models",
    "nav.usage": "Usage",
    "nav.modelMappings": "Model Mappings",
    "nav.manual": "Manual",
    "status.checkingSession": "Checking session...",
    "status.connected": "Session connected",
    "status.notConnected": "Session not connected",
    "status.connectionError": "Connection error",
    "status.checkLocalServer": "Check local server",
    "status.noActiveAccount": "No active account",
    "status.connectAccount": "Connect an account",
    "status.accountLabel": "{type} account",
    "accounts.githubAccounts": "GitHub Accounts",
    "accounts.addAccount": "Add Account",
    "accounts.loadingAccounts": "Loading accounts...",
    "accounts.failedLoad": "Failed to load accounts",
    "accounts.noAccounts":
      "No accounts configured. Click Add Account to get started.",
    "accounts.active": "Active",
    "accounts.switch": "Switch",
    "accounts.delete": "Delete",
    "accounts.switchConfirm": "Switch to this account?",
    "accounts.deleteConfirm":
      'Delete account "{login}"? This cannot be undone.',
    "accounts.failedSwitch": "Failed to switch account",
    "accounts.failedDelete": "Failed to delete account",
    "accounts.failedReorder": "Failed to save account order",
    "accounts.dragToSort": "Drag to reorder",
    "accounts.usage": "Usage",
    "accounts.fetchFailed": "Fetch failed",
    "accounts.metricPremium": "Premium",
    "accounts.metricChat": "Chat",
    "accounts.metricCompletions": "Comp",
    "models.availableModels": "Available Models",
    "models.loadingModels": "Loading models...",
    "models.failedLoad": "Failed to load models. Please add an account first.",
    "models.noModels": "No models available",
    "models.premium": "Premium",
    "models.free": "Free",
    "models.manage": "Manage",
    "models.manageDone": "Done",
    "models.hide": "Hide",
    "models.show": "Show",
    "models.filterVisible": "Visible",
    "models.filterHidden": "Hidden",
    "models.noVisibleModels": "No visible models",
    "models.noHiddenModels": "No hidden models",
    "models.failedSaveVisibility": "Failed to update model visibility",
    "models.expand": "Expand",
    "models.collapse": "Collapse",
    "models.invalidMultiplier":
      "Multiplier must be a number greater than or equal to 0",
    "models.failedSaveMultiplier": "Failed to save multiplier",
    "models.failedSaveReasoningEffort": "Failed to save reasoning effort",
    "models.reasoningOption.none": "None",
    "models.reasoningOption.minimal": "Minimal",
    "models.reasoningOption.low": "Low",
    "models.reasoningOption.medium": "Medium",
    "models.reasoningOption.high": "High",
    "models.reasoningOption.xhigh": "XHigh",
    "models.contextWindow": "Context",
    "models.features": "Features",
    "models.featureNone": "None",
    "models.feature.toolCalls": "tool calls",
    "models.feature.parallelToolCalls": "parallel tool calls",
    "models.feature.streaming": "streaming",
    "models.feature.structuredOutputs": "structured outputs",
    "models.feature.vision": "vision",
    "models.feature.embeddings": "embeddings",
    "models.feature.thinking": "thinking",
    "models.featureSimple.tools": "tools",
    "models.featureSimple.vision": "vision",
    "models.featureSimple.embeddings": "embeddings",
    "settings.trafficControl": "Traffic Control",
    "settings.subtitle": "Configure process-wide request throttling behavior.",
    "settings.unsaved": "Unsaved changes",
    "settings.rateLimitSeconds": "Rate Limit Seconds",
    "settings.secondsUnit": "sec",
    "settings.rateLimitPlaceholder": "Leave empty to disable",
    "settings.rateLimitHint":
      "Minimum global interval between requests. Empty means disabled.",
    "settings.rateLimitWait":
      "Wait instead of returning HTTP 429 when rate limit is hit",
    "settings.rateLimitWaitHint":
      "When enabled, requests queue instead of failing immediately.",
    "settings.loadingSettings": "Loading settings...",
    "settings.noticeProcessWide":
      "This rate limit is process-wide, not per account or per client.",
    "settings.noticeEnvOverride":
      "Environment variables currently override: {names}.",
    "settings.noticeSavedValues":
      "Saved values apply immediately and persist in config.json.",
    "settings.failedLoad": "Failed to load settings.",
    "settings.validationRateLimit":
      "Rate limit seconds must be greater than 0, or left empty.",
    "settings.failedSave": "Failed to save settings",
    "usage.statistics": "Usage Statistics",
    "usage.loading": "Loading usage data...",
    "usage.failedLoad":
      "Failed to load usage data. Please add an account first.",
    "usage.noData": "No usage data available",
    "usage.unlimited": "Unlimited",
    "usage.usedPercent": "{percent}% used",
    "usage.remaining": "{value} remaining",
    "usage.quotaResetDate": "Quota Reset Date",
    "usage.chatEnabled": "Chat Enabled (periodic test)",
    "usage.testInterval": "Test Interval (min)",
    "usage.testDisabled": "No test",
    "usage.validationTestInterval":
      "Test interval must be an integer greater than 0, or left empty.",
    "usage.failedSaveTestInterval": "Failed to save test interval",
    "usage.yes": "Yes",
    "usage.no": "No",
    "usage.unknown": "Unknown",
    "usage.na": "N/A",
    "usage.logTitle": "Usage Logs",
    "usage.logEmpty": "No usage logs yet",
    "usage.logTime": "Time",
    "usage.logSource": "Source",
    "usage.logEndpointAll": "All Endpoints",
    "usage.logSourceAll": "All",
    "usage.logSourceRequest": "Request",
    "usage.logResponseType": "Response Type",
    "usage.logResponseTypeStreaming": "Streaming",
    "usage.logResponseTypeNonStreaming": "Non-streaming",
    "usage.logEndpoint": "Endpoint",
    "usage.logModel": "Model",
    "usage.logMultiplier": "Multiplier",
    "usage.logStatusCode": "Status",
    "usage.logDelta": "Delta",
    "usage.logPremium": "Premium",
    "usage.logChat": "Chat",
    "usage.logCompletions": "Completions",
    "usage.logPagePrev": "Prev",
    "usage.logPageNext": "Next",
    "usage.logPageIndicator": "Page {page}",
    "usage.logPageSize": "Rows",
    "mappings.title": "Model Mappings",
    "mappings.add": "+ Add Mapping",
    "mappings.from": "From",
    "mappings.to": "To",
    "mappings.action": "Action",
    "mappings.fromPlaceholder": "From model",
    "mappings.loadingModels": "Loading models...",
    "mappings.failedLoad": "Failed to load mappings",
    "mappings.noMappings": "No mappings configured.",
    "mappings.deleteConfirm": 'Delete mapping for "{from}"?',
    "mappings.failedDelete": "Failed to delete mapping",
    "mappings.selectTargetModel": "Select target model",
    "mappings.failedLoadModels": "Failed to load models",
    "mappings.bothRequired": "Both fields are required",
    "mappings.failedSave": "Failed to save",
    "mappings.copyFailed": "Failed to copy mapping",
    // MANUAL_I18N_START
    "manual.title": "User Manual",
    "manual.subtitle": "Endpoint mapping + cross-project integration",
    "manual.publicAdminNoteHtml":
      "<strong>Key:</strong> If public access to the admin page is needed, use Caddy reverse proxy and configure basic auth in Caddy; route <code>/admin*</code> to admin pages; for other paths, either reverse proxy directly to copilot-api for API usage, or only allow admin-path access and use endpoints through other projects.",
    "manual.section2Html": `<div class="manual-section-title">1. Available models by endpoint</div>
<div class="manual-table-wrap">
  <table class="manual-table">
    <thead>
      <tr>
        <th>Model</th>
        <th>chat/completions</th>
        <th>responses</th>
        <th>messages</th>
        <th>gemini</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>gpt-4.1</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>gpt-5.2</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>gpt-codex series</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>gpt-5.4</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>gpt-5.4-mini</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>Claude series</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
      <tr><td>Gemini series</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag ok">Available</span></td></tr>
      <tr><td>grok-code-fast-1</td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td><td><span class="manual-tag ok">Available</span></td><td><span class="manual-tag no">Unavailable</span></td></tr>
    </tbody>
  </table>
</div>
<div class="manual-note">Rules: responses is only for Codex and gpt-5.4 related models; gemini endpoint is only for Gemini models; chat/completions and messages can be used for all models.</div>`,
    "manual.section3Html": `<div class="manual-section-title">2. Recommended to use with <a href="https://github.com/tbphp/gpt-load" target="_blank" rel="noopener noreferrer">GPT-Load</a> and <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener noreferrer">New API</a></div>
<ol class="manual-list">
  <li>chat group (openai): all models are allowed.</li>
  <li>messages group (anthropic): all models are allowed.</li>
  <li>responses group (openai-response): only Codex + gpt-5.4 / gpt-5.4-mini.</li>
  <li>gemini group (gemini): only Gemini models.</li>
</ol>`,
    // MANUAL_I18N_END
    "auth.addAccount": "Add GitHub Account",
    "auth.accountType": "Account Type",
    "auth.typeIndividual": "Individual",
    "auth.typeBusiness": "Business",
    "auth.typeEnterprise": "Enterprise",
    "auth.startPrompt": "Click below to start the authorization process.",
    "auth.startAuthorization": "Start Authorization",
    "auth.enterCode": "Enter this code at GitHub:",
    "auth.openGithub": "Open GitHub",
    "auth.waiting": "Waiting for authorization...",
    "auth.failedStart": "Failed to start authorization",
  },
  "zh-CN": {
    "app.title": "Copilot API - 控制台",
    "language.label": "语言",
    "language.en": "English",
    "language.zhCN": "简体中文",
    "common.refresh": "刷新",
    "common.save": "保存",
    "common.cancel": "取消",
    "common.loading": "加载中...",
    "common.delete": "删除",
    "common.copy": "复制",
    "common.model": "模型",
    "nav.accounts": "账号",
    "nav.settings": "设置",
    "nav.models": "模型",
    "nav.usage": "用量",
    "nav.modelMappings": "模型映射",
    "nav.manual": "使用手册",
    "status.checkingSession": "正在检查会话...",
    "status.connected": "会话已连接",
    "status.notConnected": "会话未连接",
    "status.connectionError": "连接错误",
    "status.checkLocalServer": "请检查本地服务",
    "status.noActiveAccount": "无活跃账号",
    "status.connectAccount": "请先连接账号",
    "status.accountLabel": "{type} 账户",
    "accounts.githubAccounts": "GitHub 账号",
    "accounts.addAccount": "添加账号",
    "accounts.loadingAccounts": "正在加载账号...",
    "accounts.failedLoad": "加载账号失败",
    "accounts.noAccounts": "尚未配置账号。点击“添加账号”开始。",
    "accounts.active": "当前",
    "accounts.switch": "切换",
    "accounts.delete": "删除",
    "accounts.switchConfirm": "确认切换到该账号吗？",
    "accounts.deleteConfirm": "删除账号“{login}”？此操作不可撤销。",
    "accounts.failedSwitch": "切换账号失败",
    "accounts.failedDelete": "删除账号失败",
    "accounts.failedReorder": "保存账号顺序失败",
    "accounts.dragToSort": "拖动调整顺序",
    "accounts.usage": "用量",
    "accounts.fetchFailed": "获取失败",
    "accounts.metricPremium": "高级",
    "accounts.metricChat": "聊天",
    "accounts.metricCompletions": "补全",
    "models.availableModels": "可用模型",
    "models.loadingModels": "正在加载模型...",
    "models.failedLoad": "加载模型失败，请先添加账号。",
    "models.noModels": "暂无可用模型",
    "models.premium": "高级",
    "models.free": "免费",
    "models.manage": "管理",
    "models.manageDone": "完成",
    "models.hide": "隐藏",
    "models.show": "显示",
    "models.filterVisible": "可见",
    "models.filterHidden": "隐藏",
    "models.noVisibleModels": "暂无可见模型",
    "models.noHiddenModels": "暂无隐藏模型",
    "models.failedSaveVisibility": "更新模型显隐失败",
    "models.expand": "展开",
    "models.collapse": "收起",
    "models.invalidMultiplier": "倍率必须是大于等于 0 的数字",
    "models.failedSaveMultiplier": "保存倍率失败",
    "models.failedSaveReasoningEffort": "保存推理强度失败",
    "models.reasoningOption.none": "无",
    "models.reasoningOption.minimal": "极低",
    "models.reasoningOption.low": "低",
    "models.reasoningOption.medium": "中",
    "models.reasoningOption.high": "高",
    "models.reasoningOption.xhigh": "超高",
    "models.contextWindow": "上下文",
    "models.features": "功能",
    "models.featureNone": "无",
    "models.feature.toolCalls": "工具调用",
    "models.feature.parallelToolCalls": "并行工具调用",
    "models.feature.streaming": "流式输出",
    "models.feature.structuredOutputs": "结构化输出",
    "models.feature.vision": "视觉",
    "models.feature.embeddings": "向量嵌入",
    "models.feature.thinking": "思考预算",
    "models.featureSimple.tools": "工具",
    "models.featureSimple.vision": "视觉",
    "models.featureSimple.embeddings": "向量嵌入",
    "settings.trafficControl": "流量控制",
    "settings.subtitle": "配置进程级请求限流行为。",
    "settings.unsaved": "有未保存更改",
    "settings.rateLimitSeconds": "限流秒数",
    "settings.secondsUnit": "秒",
    "settings.rateLimitPlaceholder": "留空表示关闭限流",
    "settings.rateLimitHint": "请求之间的全局最小间隔。留空表示不限制。",
    "settings.rateLimitWait": "触发限流时等待，而不是直接返回 HTTP 429",
    "settings.rateLimitWaitHint": "开启后，请求将排队等待，而不是立即失败。",
    "settings.loadingSettings": "正在加载设置...",
    "settings.noticeProcessWide":
      "该限流作用于整个进程，而不是单个账号或单个客户端。",
    "settings.noticeEnvOverride": "当前被环境变量覆盖：{names}。",
    "settings.noticeSavedValues": "保存后立即生效，并持久化到 config.json。",
    "settings.failedLoad": "加载设置失败。",
    "settings.validationRateLimit": "限流秒数必须大于 0，或留空。",
    "settings.failedSave": "保存设置失败",
    "usage.statistics": "用量统计",
    "usage.loading": "正在加载用量数据...",
    "usage.failedLoad": "加载用量数据失败，请先添加账号。",
    "usage.noData": "暂无用量数据",
    "usage.unlimited": "无限制",
    "usage.usedPercent": "已使用 {percent}%",
    "usage.remaining": "剩余 {value}",
    "usage.quotaResetDate": "额度重置日期",
    "usage.chatEnabled": "聊天可用（定时测试）",
    "usage.testInterval": "测试时间间隔（分钟）",
    "usage.testDisabled": "不测试",
    "usage.validationTestInterval": "测试间隔必须是大于 0 的整数，或留空。",
    "usage.failedSaveTestInterval": "保存测试间隔失败",
    "usage.yes": "是",
    "usage.no": "否",
    "usage.unknown": "未知",
    "usage.na": "无",
    "usage.logTitle": "使用日志",
    "usage.logEmpty": "暂无使用日志",
    "usage.logTime": "时间",
    "usage.logSource": "来源",
    "usage.logEndpointAll": "全部端点",
    "usage.logSourceAll": "全选",
    "usage.logSourceRequest": "请求",
    "usage.logResponseType": "响应类型",
    "usage.logResponseTypeStreaming": "流式",
    "usage.logResponseTypeNonStreaming": "非流",
    "usage.logEndpoint": "端点",
    "usage.logModel": "模型",
    "usage.logMultiplier": "倍率",
    "usage.logStatusCode": "状态码",
    "usage.logDelta": "增量",
    "usage.logPremium": "高级额度",
    "usage.logChat": "聊天用量",
    "usage.logCompletions": "补全用量",
    "usage.logPagePrev": "上一页",
    "usage.logPageNext": "下一页",
    "usage.logPageIndicator": "第 {page} 页",
    "usage.logPageSize": "每页",
    "mappings.title": "模型映射",
    "mappings.add": "+ 新增映射",
    "mappings.from": "源模型",
    "mappings.to": "目标模型",
    "mappings.action": "操作",
    "mappings.fromPlaceholder": "输入源模型",
    "mappings.loadingModels": "正在加载模型...",
    "mappings.failedLoad": "加载映射失败",
    "mappings.noMappings": "暂无映射配置。",
    "mappings.deleteConfirm": "确认删除“{from}”的映射吗？",
    "mappings.failedDelete": "删除映射失败",
    "mappings.selectTargetModel": "选择目标模型",
    "mappings.failedLoadModels": "加载模型失败",
    "mappings.bothRequired": "两个字段都必填",
    "mappings.failedSave": "保存失败",
    "mappings.copyFailed": "复制映射失败",
    // MANUAL_I18N_START
    "manual.title": "使用手册",
    "manual.subtitle": "端点映射 + 跨项目接入",
    "manual.publicAdminNoteHtml":
      "<strong>重点：</strong>如果需要公网访问 admin 页面，可通过 Caddy 反代并在其配置中添加账号密码；<code>/admin*</code> 走后台页面；其余路径直接反代到 copilot-api 服务进行使用，或者只允许 admin 路径访问，端点结合其他项目使用。",
    "manual.section2Html": `<div class="manual-section-title">1. 每个端点可用模型</div>
<div class="manual-table-wrap">
  <table class="manual-table">
    <thead>
      <tr>
        <th>模型</th>
        <th>chat/completions</th>
        <th>responses</th>
        <th>messages</th>
        <th>gemini</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>gpt-4.1</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>gpt-5.2</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>gpt-codex 系列</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>gpt-5.4</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>gpt-5.4-mini</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>Claude 系列</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
      <tr><td>Gemini 系列</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag ok">可用</span></td></tr>
      <tr><td>grok-code-fast-1</td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td><td><span class="manual-tag ok">可用</span></td><td><span class="manual-tag no">不可用</span></td></tr>
    </tbody>
  </table>
</div>
<div class="manual-note">规则：responses 仅用于 Codex 与 gpt-5.4 相关模型；gemini 端点仅用于 Gemini 相关模型；chat/completions 与 messages 可用于所有模型。</div>`,
    "manual.section3Html": `<div class="manual-section-title">2.推荐结合 <a href="https://github.com/tbphp/gpt-load" target="_blank" rel="noopener noreferrer">GPT-Load</a>与 <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener noreferrer">New API</a>使用</div>
<ol class="manual-list">
  <li>chat 组（openai）：可放全部模型。</li>
  <li>messages 组（anthropic）：可放全部模型。</li>
  <li>responses 组（openai-response）：仅放 Codex 与 gpt-5.4 / gpt-5.4-mini。</li>
  <li>gemini 组（gemini）：仅放 Gemini 相关模型。</li>
</ol>`,
    // MANUAL_I18N_END
    "auth.addAccount": "添加 GitHub 账号",
    "auth.accountType": "账号类型",
    "auth.typeIndividual": "个人",
    "auth.typeBusiness": "企业（Business）",
    "auth.typeEnterprise": "企业（Enterprise）",
    "auth.startPrompt": "点击下方按钮开始授权流程。",
    "auth.startAuthorization": "开始授权",
    "auth.enterCode": "请在 GitHub 输入以下代码：",
    "auth.openGithub": "打开 GitHub",
    "auth.waiting": "等待授权中...",
    "auth.failedStart": "启动授权失败",
  },
}
