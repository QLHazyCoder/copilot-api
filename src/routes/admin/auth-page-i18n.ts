export const authPageLocaleStorageKey = "admin.locale"

export const supportedAuthPageLocales = ["en", "zh-CN"] as const

export type AuthPageLocale = (typeof supportedAuthPageLocales)[number]

export type AuthSetupMode = "initial" | "rotate" | "readonly"

export type AuthSecretSource = "none" | "env-hash" | "env-secret" | "config-hash"

type AuthPageMessages = Record<string, string>

const authPageMessages: Record<AuthPageLocale, AuthPageMessages> = {
  en: {
    "language.label": "Language",
    "language.en": "English",
    "language.zhCN": "Simplified Chinese",
    "common.managementSecret": "Management Secret",
    "login.pageTitle": "Copilot API - Admin Login",
    "login.badge": "Admin Access",
    "login.title": "Admin Console Login",
    "login.description":
      "Enter the management secret to access the copilot-api admin dashboard.",
    "login.submit": "Sign In",
    "login.error.required": "Management secret is required.",
    "login.error.failed": "Failed to sign in.",
    "login.error.invalid": "Invalid management secret.",
    "login.error.rateLimited":
      "Too many failed login attempts. Please wait before trying again.",
    "setup.pageTitle": "Copilot API - Admin Setup",
    "setup.badge": "Admin Security",
    "setup.title.initial": "Initialize Admin Secret",
    "setup.title.rotate": "Update Admin Secret",
    "setup.title.readonly": "Admin Secret Managed Externally",
    "setup.description.initial":
      "Create the management secret that will protect the admin dashboard and all admin API routes.",
    "setup.description.rotate":
      "Replace the current admin secret. Existing admin sessions will be refreshed immediately.",
    "setup.description.readonly":
      "The admin secret is currently managed by environment variables and cannot be changed from the web UI.",
    "setup.secretSource": "Secret source",
    "setup.source.none": "Not configured",
    "setup.source.config-hash": "Config file",
    "setup.source.env-secret": "Environment variable",
    "setup.source.env-hash": "Environment variable (hash)",
    "setup.confirmManagementSecret": "Confirm Management Secret",
    "setup.hint":
      "Use at least 8 characters. After saving, the secret will protect /admin and all /admin/api/* routes.",
    "setup.submit.initial": "Create Secret",
    "setup.submit.rotate": "Save New Secret",
    "setup.backToAdmin": "Back to Admin",
    "setup.error.required": "Management secret is required.",
    "setup.error.minLength":
      "Management secret must be at least 8 characters.",
    "setup.error.confirmMismatch":
      "The confirmation secret does not match.",
    "setup.error.failed": "Failed to save admin secret.",
  },
  "zh-CN": {
    "language.label": "语言",
    "language.en": "English",
    "language.zhCN": "简体中文",
    "common.managementSecret": "管理密钥",
    "login.pageTitle": "Copilot API - Admin 登录",
    "login.badge": "管理入口",
    "login.title": "管理端登录",
    "login.description":
      "请输入管理密钥以访问 copilot-api 的后台管理页面。",
    "login.submit": "登录",
    "login.error.required": "请输入管理密钥。",
    "login.error.failed": "登录失败。",
    "login.error.invalid": "管理密钥无效。",
    "login.error.rateLimited":
      "登录失败次数过多，请稍后再试。",
    "setup.pageTitle": "Copilot API - Admin 初始化",
    "setup.badge": "管理安全",
    "setup.title.initial": "初始化 Admin 管理密钥",
    "setup.title.rotate": "更新 Admin 管理密钥",
    "setup.title.readonly": "Admin 密钥由外部管理",
    "setup.description.initial":
      "创建用于保护 Admin 后台和全部 Admin API 路由的管理密钥。",
    "setup.description.rotate":
      "替换当前管理密钥。保存后，已有的 Admin 会话会立即刷新。",
    "setup.description.readonly":
      "当前 Admin 管理密钥由环境变量管理，不能在网页中直接修改。",
    "setup.secretSource": "密钥来源",
    "setup.source.none": "未配置",
    "setup.source.config-hash": "配置文件",
    "setup.source.env-secret": "环境变量",
    "setup.source.env-hash": "环境变量（哈希）",
    "setup.confirmManagementSecret": "确认管理密钥",
    "setup.hint":
      "至少使用 8 个字符。保存后，该密钥将保护 /admin 与全部 /admin/api/* 路由。",
    "setup.submit.initial": "创建密钥",
    "setup.submit.rotate": "保存新密钥",
    "setup.backToAdmin": "返回 Admin",
    "setup.error.required": "请输入管理密钥。",
    "setup.error.minLength": "管理密钥长度至少为 8 个字符。",
    "setup.error.confirmMismatch": "两次输入的管理密钥不一致。",
    "setup.error.failed": "保存管理密钥失败。",
  },
}

export function normalizeAuthPageLocale(
  locale: string | null | undefined,
): AuthPageLocale | null {
  if (!locale || typeof locale !== "string") {
    return null
  }

  const normalized = locale.trim().toLowerCase()
  if (normalized.startsWith("zh")) {
    return "zh-CN"
  }

  if (normalized.startsWith("en")) {
    return "en"
  }

  return null
}

export function resolveAuthPageLocale(options: {
  acceptLanguage?: string
  queryLang?: string
}): AuthPageLocale {
  const fromQuery = normalizeAuthPageLocale(options.queryLang)
  if (fromQuery) {
    return fromQuery
  }

  const acceptLanguage = options.acceptLanguage?.trim()
  if (!acceptLanguage) {
    return "en"
  }

  for (const part of acceptLanguage.split(",")) {
    const candidate = normalizeAuthPageLocale(part.split(";")[0] ?? "")
    if (candidate) {
      return candidate
    }
  }

  return "en"
}

export function getAuthPageMessages(locale: AuthPageLocale): AuthPageMessages {
  return authPageMessages[locale]
}

export function renderAuthPageLocaleScript(options: {
  initialLocale: AuthPageLocale
  mode?: AuthSetupMode
  page: "login" | "setup"
  requiresHttps: boolean
  secretSource?: AuthSecretSource
  sessionTtlDays: number
  showForm?: boolean
}): string {
  const serializedMessages = JSON.stringify(authPageMessages)
  const serializedLocales = JSON.stringify(supportedAuthPageLocales)
  const serializedOptions = JSON.stringify(options)

  return `<script>
    const AUTH_PAGE_MESSAGES = ${serializedMessages};
    const AUTH_PAGE_SUPPORTED_LOCALES = ${serializedLocales};
    const AUTH_PAGE_CONFIG = ${serializedOptions};
    const AUTH_PAGE_LOCALE_STORAGE_KEY = ${JSON.stringify(authPageLocaleStorageKey)};

    function normalizeLocale(locale) {
      if (!locale || typeof locale !== 'string') return null;
      const lower = locale.trim().toLowerCase();
      if (lower.startsWith('zh')) return 'zh-CN';
      if (lower.startsWith('en')) return 'en';
      return null;
    }

    function getInitialLocale() {
      try {
        const fromStorage = normalizeLocale(localStorage.getItem(AUTH_PAGE_LOCALE_STORAGE_KEY));
        if (fromStorage) return fromStorage;
      } catch (_error) {}

      const fromQuery = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
      if (fromQuery) return fromQuery;

      const fromNavigator = normalizeLocale(navigator.language);
      if (fromNavigator) return fromNavigator;

      return normalizeLocale(AUTH_PAGE_CONFIG.initialLocale) || 'en';
    }

    let currentLocale = getInitialLocale();

    function t(key, vars) {
      const dict = AUTH_PAGE_MESSAGES[currentLocale] || AUTH_PAGE_MESSAGES.en;
      const fallback = AUTH_PAGE_MESSAGES.en;
      const template = dict[key] || fallback[key] || key;
      if (!vars) return template;
      return template.replace(/\\{(\\w+)\\}/g, function (_match, name) {
        return vars[name] !== undefined ? String(vars[name]) : '';
      });
    }

    function setText(id, value) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    }

    function setHtml(id, value) {
      const element = document.getElementById(id);
      if (element) {
        element.innerHTML = value;
      }
    }

    function applyLoginLocale() {
      setText('pageBadge', t('login.badge'));
      setText('pageTitleText', t('login.title'));
      setText('pageDescription', t('login.description'));
      setText('secretLabel', t('common.managementSecret'));
      setText('submitButtonText', t('login.submit'));
    }

    function applySetupLocale() {
      setText('pageBadge', t('setup.badge'));
      setText('pageTitleText', t('setup.title.' + AUTH_PAGE_CONFIG.mode));
      setText('pageDescription', t('setup.description.' + AUTH_PAGE_CONFIG.mode));
      setText('secretSourceLabel', t('setup.secretSource'));
      setText('secretSourceValue', t('setup.source.' + AUTH_PAGE_CONFIG.secretSource));
      setText('secretLabel', t('common.managementSecret'));
      setText('confirmSecretLabel', t('setup.confirmManagementSecret'));
      setText('setupHint', t('setup.hint'));
      if (AUTH_PAGE_CONFIG.showForm) {
        setText('submitButtonText', t('setup.submit.' + AUTH_PAGE_CONFIG.mode));
      } else {
        setText('backToAdminButtonText', t('setup.backToAdmin'));
      }
    }

    function applyLocale(locale, persist) {
      const normalized = normalizeLocale(locale) || 'en';
      if (!AUTH_PAGE_SUPPORTED_LOCALES.includes(normalized)) {
        return;
      }

      currentLocale = normalized;
      document.documentElement.lang = normalized;
      document.title = t(AUTH_PAGE_CONFIG.page + '.pageTitle');

      const languageSelect = document.getElementById('languageSelect');
      if (languageSelect) {
        languageSelect.value = normalized;
      }

      setText('languageLabel', t('language.label'));
      setText('languageOptionEn', t('language.en'));
      setText('languageOptionZh', t('language.zhCN'));

      if (AUTH_PAGE_CONFIG.page === 'login') {
        applyLoginLocale();
      } else {
        applySetupLocale();
      }

      if (persist) {
        try {
          localStorage.setItem(AUTH_PAGE_LOCALE_STORAGE_KEY, normalized);
        } catch (_error) {}
      }
    }

    window.__authPageLocale = {
      t,
      getCurrentLocale: function () { return currentLocale; },
      setLocale: function (locale, persist) { applyLocale(locale, persist !== false); }
    };

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
      languageSelect.addEventListener('change', function (event) {
        const target = event.target;
        if (!target) return;
        applyLocale(target.value, true);
      });
    }

    applyLocale(currentLocale, true);
  </script>`
}
