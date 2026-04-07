/* eslint-disable max-lines */
import { adminMessages, supportedAdminLocales } from "./i18n"

export const adminScript = `<script>
    const API_BASE = '/admin/api';
    const LOCALE_STORAGE_KEY = 'admin.locale';
  const ACTIVE_TAB_STORAGE_KEY = 'admin.activeTab';
    const MODELS_COLLAPSED_STORAGE_KEY = 'admin.modelsCollapsedProviders';
    const MODELS_VISIBILITY_FILTER_STORAGE_KEY = 'admin.modelsVisibilityFilter';
    const USAGE_LOG_ENDPOINT_FILTER_STORAGE_KEY = 'admin.usageLogEndpointFilter';
    const USAGE_LOG_PAGE_SIZE_STORAGE_KEY = 'admin.usageLogPageSize';
    const DEFAULT_USAGE_LOG_PAGE_SIZE = 13;
    const USAGE_LOG_PAGE_SIZE_OPTIONS = [13, 20, 50, 100];
    const SUPPORTED_LOCALES = ${JSON.stringify(supportedAdminLocales)};
  const KNOWN_TABS = ['accounts', 'settings', 'models', 'usage', 'model-mappings', 'manual'];

    const messages = ${JSON.stringify(adminMessages)};

    let pollInterval = null;
    let currentInterval = 5;
    let usagePollInterval = null;
    let accountsPollInterval = null;
    let isPollingAccounts = false;
    let premiumMultipliers = {};
    let modelCardMetadata = {};
    let reasoningEfforts = {};
    let modelSupportedReasoningEfforts = {};
    let hiddenModels = new Set();
    let modelVisibilityFilter = 'visible';
    let isModelManageMode = false;
    let latestModelsPayload = null;
    let collapsedProviders = new Set();
    let usageLogEndpointFilter = '';
    let usageLogEndpointOptions = [];
    let usageLogPageSize = DEFAULT_USAGE_LOG_PAGE_SIZE;
    let usageLogCursor = null;
    let usageLogNextCursor = null;
    let usageLogCursorStack = [];
    let usageLogPageIndex = 1;
    let usageLogsRequestSeq = 0;
    let isFetchingUsageLogs = false;
    let usageLogLoadErrorMessage = null;
    let draggedAccountElement = null;
    let draggedAccountInitialOrder = [];
    let didDropAccount = false;
    let isDraggingAccount = false;
    let isSavingAccountOrder = false;
    let settingsLoadedState = null;
    let confirmActionResolve = null;

    function normalizeLocale(locale) {
      if (!locale || typeof locale !== 'string') return null;
      const lower = locale.toLowerCase();
      if (lower.startsWith('zh')) return 'zh-CN';
      if (lower.startsWith('en')) return 'en';
      return null;
    }

    function getInitialLocale() {
      const fromStorage = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
      if (fromStorage) return fromStorage;
      const fromQuery = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
      if (fromQuery) return fromQuery;
      return normalizeLocale(navigator.language) || 'en';
    }

    let currentLocale = getInitialLocale();

    function t(key, vars) {
      const dict = messages[currentLocale] || messages.en;
      const fallback = messages.en;
      const template = dict[key] || fallback[key] || key;
      if (!vars) return template;
      return template.replace(/\\{(\\w+)\\}/g, function (_match, name) {
        return vars[name] !== undefined ? String(vars[name]) : '';
      });
    }

    function formatNumber(value) {
      return new Intl.NumberFormat(currentLocale).format(value);
    }

    function formatDate(value) {
      return new Intl.DateTimeFormat(currentLocale).format(new Date(value));
    }

    function formatDateTime(value) {
      return new Intl.DateTimeFormat(currentLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date(value));
    }

    function formatAccountType(accountType) {
      if (accountType === 'business') return t('auth.typeBusiness');
      if (accountType === 'enterprise') return t('auth.typeEnterprise');
      return t('auth.typeIndividual');
    }

    function normalizeModelVisibilityFilter(value) {
      return value === 'hidden' ? 'hidden' : 'visible';
    }

    function setModelVisibilityFilter(value, persist) {
      modelVisibilityFilter = normalizeModelVisibilityFilter(value);
      if (persist) {
        localStorage.setItem(MODELS_VISIBILITY_FILTER_STORAGE_KEY, modelVisibilityFilter);
      }
      updateModelVisibilityToggleButton();
    }

    function getModelVisibilityIconMarkup() {
      if (modelVisibilityFilter === 'hidden') {
        return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3c1.2 0 2.3.25 3.28.7l-1.09 1.1A6.4 6.4 0 0 0 8 4.3c-2.9 0-4.78 1.74-5.9 3.7a.8.8 0 0 0 0 .78c.45.8 1.05 1.57 1.84 2.22l1.07-1.07a2.94 2.94 0 0 1-.2-1.05A3.2 3.2 0 0 1 5.2 7.3L1.57 3.66A.75.75 0 1 1 2.63 2.6l11.8 11.8a.75.75 0 1 1-1.06 1.06l-1.48-1.48A7.3 7.3 0 0 1 8 13C4.5 13 2.3 10.8 1.2 8.8a1.6 1.6 0 0 1 0-1.6C2.3 5.2 4.5 3 8 3Zm0 2.8a2.2 2.2 0 0 0-1.52 3.79l3.11-3.11A2.2 2.2 0 0 0 8 5.8Zm2.4 2.4-3.1 3.1c.22.06.46.1.7.1a2.2 2.2 0 0 0 2.2-2.2c0-.24-.03-.47-.1-.7Z"></path></svg>';
      }

      return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 2.3 5.2 1.2 7.2a1.6 1.6 0 0 0 0 1.6C2.3 10.8 4.5 13 8 13s5.7-2.2 6.8-4.2a1.6 1.6 0 0 0 0-1.6C13.7 5.2 11.5 3 8 3Zm0 8.7A3.7 3.7 0 1 1 8 4.3a3.7 3.7 0 0 1 0 7.4Zm0-5.9a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"></path></svg>';
    }

    function updateModelVisibilityToggleButton() {
      const button = document.getElementById('modelVisibilityToggle');
      if (!button) return;

      const icon = document.getElementById('modelVisibilityToggleIcon');
      const text = document.getElementById('modelVisibilityToggleText');
      const isHiddenView = modelVisibilityFilter === 'hidden';

      if (icon) {
        icon.innerHTML = getModelVisibilityIconMarkup();
      }

      if (text) {
        text.textContent = t(isHiddenView ? 'models.filterHidden' : 'models.filterVisible');
      }

      const label = t(isHiddenView ? 'models.filterHidden' : 'models.filterVisible');
      button.title = label;
      button.setAttribute('aria-label', label);
    }

    function getModelManageIconMarkup() {
      if (isModelManageMode) {
        return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z"></path></svg>';
      }

      return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.75A.75.75 0 0 1 3.75 2h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 2.75Zm-2 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm2 5A.75.75 0 0 1 3.75 12h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 12.75Z"></path></svg>';
    }

    function updateModelManageButton() {
      const button = document.getElementById('toggleModelManageBtn');
      if (!button) return;

      const icon = document.getElementById('modelManageToggleIcon');
      const text = document.getElementById('modelManageToggleText');
      const label = t(isModelManageMode ? 'models.manageDone' : 'models.manage');

      if (icon) {
        icon.innerHTML = getModelManageIconMarkup();
      }

      if (text) {
        text.textContent = label;
      }

      button.title = label;
      button.setAttribute('aria-label', label);
      button.classList.toggle('btn-primary', isModelManageMode);
    }

    function rerenderModelsFromCache() {
      if (latestModelsPayload && Array.isArray(latestModelsPayload.data)) {
        renderModels(latestModelsPayload);
        return;
      }

      void fetchModels();
    }

    function isConfirmActionModalOpen() {
      const modal = document.getElementById('confirmActionModal');
      return Boolean(modal && modal.classList.contains('active'));
    }

    function closeConfirmActionModal(confirmed) {
      const modal = document.getElementById('confirmActionModal');
      if (modal) {
        modal.classList.remove('active');
      }

      const resolve = confirmActionResolve;
      confirmActionResolve = null;
      if (resolve) {
        resolve(Boolean(confirmed));
      }
    }

    function openConfirmActionModal(options) {
      const modal = document.getElementById('confirmActionModal');
      const titleEl = document.getElementById('confirmActionTitle');
      const messageEl = document.getElementById('confirmActionMessage');
      const confirmBtn = document.getElementById('confirmActionConfirmBtn');

      if (!modal || !titleEl || !messageEl || !confirmBtn) {
        return Promise.resolve(false);
      }

      if (confirmActionResolve) {
        confirmActionResolve(false);
        confirmActionResolve = null;
      }

      titleEl.textContent = options.title;
      messageEl.textContent = options.message;
      confirmBtn.textContent = options.confirmText;
      confirmBtn.classList.toggle('btn-danger', options.tone === 'danger');
      confirmBtn.classList.toggle('btn-primary', options.tone !== 'danger');

      modal.classList.add('active');

      return new Promise(function (resolve) {
        confirmActionResolve = resolve;
      });
    }

    function normalizePercent(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }

    function renderUsageBar(label, percent, toneClass, isUnlimited) {
      const normalized = isUnlimited ? 100 : normalizePercent(percent);
      const valueText = isUnlimited ? '∞' : (normalized.toFixed(1) + '%');
      return '<div class="account-usage-row">' +
        '<span class="account-usage-type">' + label + '</span>' +
        '<div class="account-usage-track">' +
          '<div class="account-usage-fill ' + toneClass + '" style="--usage:' + normalized + '"></div>' +
        '</div>' +
        '<span class="account-usage-value">' + valueText + '</span>' +
      '</div>';
    }

    function renderAccountUsage(usage) {
      if (!usage || usage.status !== 'ok') {
        return '<div class="account-usage-error">' + t('accounts.fetchFailed') + '</div>';
      }

      return '<div class="account-usage-bars">' +
        renderUsageBar(t('accounts.metricPremium'), usage.premiumPercent, 'premium', usage.premiumUnlimited) +
        renderUsageBar(t('accounts.metricChat'), usage.chatPercent, 'chat', usage.chatUnlimited) +
        renderUsageBar(t('accounts.metricCompletions'), usage.completionsPercent, 'completions', usage.completionsUnlimited) +
      '</div>';
    }

    function applyI18n() {
      document.title = t('app.title');
      document.documentElement.lang = currentLocale;

      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
      });

      document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-html');
        if (key) el.innerHTML = t(key);
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
      });

      const languageSelect = document.getElementById('languageSelect');
      if (languageSelect) languageSelect.value = currentLocale;
      updateModelVisibilityToggleButton();
      updateModelManageButton();
    }

    function refreshLocalizedData() {
      fetchAccounts();
      fetchStatus();
      fetchSettings();
      const activeTab = document.querySelector('.tab.active');
      if (!activeTab) return;
      if (activeTab.dataset.tab === 'models') fetchModels();
      if (activeTab.dataset.tab === 'usage') fetchUsage();
      if (activeTab.dataset.tab === 'model-mappings') fetchMappings();
      syncUsagePolling();
    }

    function setLocale(locale, persist) {
      const normalized = normalizeLocale(locale) || 'en';
      if (!SUPPORTED_LOCALES.includes(normalized)) return;
      currentLocale = normalized;
      if (persist) localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
      applyI18n();
      refreshLocalizedData();
    }

    function stopUsagePolling() {
      if (usagePollInterval) {
        clearInterval(usagePollInterval);
        usagePollInterval = null;
      }
    }

    function startUsagePolling() {
      stopUsagePolling();
      usagePollInterval = setInterval(function () {
        void fetchUsage(true);
      }, 8000);
    }

    function stopAccountsPolling() {
      if (accountsPollInterval) {
        clearInterval(accountsPollInterval);
        accountsPollInterval = null;
      }
      isPollingAccounts = false;
    }

    function startAccountsPolling() {
      stopAccountsPolling();
      accountsPollInterval = setInterval(function () {
        if (isPollingAccounts) {
          return;
        }

        isPollingAccounts = true;
        Promise.all([fetchAccounts(), fetchStatus()]).finally(function () {
          isPollingAccounts = false;
        });
      }, 8000);
    }

    function syncUsagePolling() {
      const activeTab = document.querySelector('.tab.active');
      if (activeTab && activeTab.dataset.tab === 'usage') {
        startUsagePolling();
      } else {
        stopUsagePolling();
      }

      if (activeTab && activeTab.dataset.tab === 'accounts') {
        startAccountsPolling();
        return;
      }

      stopAccountsPolling();
    }

    function isKnownTab(tabName) {
      return typeof tabName === 'string' && KNOWN_TABS.includes(tabName);
    }

    function setActiveTab(tabName, persist) {
      const normalizedTab = isKnownTab(tabName) ? tabName : 'accounts';
      const targetTab = document.querySelector('.tab[data-tab="' + normalizedTab + '"]');
      const targetContent = document.getElementById('tab-' + normalizedTab);

      if (!targetTab || !targetContent) {
        return;
      }

      document.querySelectorAll('.tab').forEach(function (tEl) { tEl.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (cEl) { cEl.classList.remove('active'); });

      targetTab.classList.add('active');
      targetContent.classList.add('active');

      if (persist) {
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, normalizedTab);
      }

      if (normalizedTab === 'accounts') {
        fetchAccounts();
        fetchStatus();
      }
      if (normalizedTab === 'settings') fetchSettings();
      if (normalizedTab === 'models') fetchModels();
      if (normalizedTab === 'usage') fetchUsage();
      if (normalizedTab === 'model-mappings') fetchMappings();
      syncUsagePolling();
    }

    function restoreActiveTab() {
      const fromStorage = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      setActiveTab(fromStorage, false);
    }

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setActiveTab(tab.dataset.tab, true);
      });
    });

    function readSettingsFormState() {
      const rawRateLimitSeconds = document.getElementById('rateLimitSeconds').value.trim();
      const rateLimitSeconds = rawRateLimitSeconds === '' ? null : Number(rawRateLimitSeconds);
      const rateLimitWait = document.getElementById('rateLimitWait').checked;
      const anthropicApiKey = document.getElementById('anthropicApiKey').value.trim();
      const gatewayApiKey = document.getElementById('gatewayApiKey').value.trim();
      return {
        rawRateLimitSeconds,
        rateLimitSeconds,
        rateLimitWait,
        anthropicApiKey,
        gatewayApiKey
      };
    }

    function isSameSettingsState(left, right) {
      if (!left || !right) return false;
      return left.rateLimitSeconds === right.rateLimitSeconds
        && left.rateLimitWait === right.rateLimitWait
        && left.anthropicApiKey === right.anthropicApiKey
        && left.gatewayApiKey === right.gatewayApiKey;
    }

    function updateSettingsDirtyState() {
      const saveButton = document.getElementById('saveSettingsBtn');
      const dirtyIndicator = document.getElementById('settingsDirtyIndicator');
      if (!saveButton || !dirtyIndicator) return;

      if (!settingsLoadedState) {
        saveButton.disabled = true;
        dirtyIndicator.classList.remove('active');
        return;
      }

      const currentState = readSettingsFormState();
      const isDirty = !isSameSettingsState(settingsLoadedState, currentState);
      saveButton.disabled = !isDirty;
      dirtyIndicator.classList.toggle('active', isDirty);
    }

    async function fetchSettings() {
      try {
        const res = await fetch(API_BASE + '/settings');
        const data = await res.json();
        document.getElementById('rateLimitSeconds').value = data.rateLimitSeconds ?? '';
        document.getElementById('rateLimitWait').checked = Boolean(data.rateLimitWait);
        document.getElementById('anthropicApiKey').value = '';
        document.getElementById('gatewayApiKey').value = '';
        const anthropicApiKeyStatusEl = document.getElementById('anthropicApiKeyStatus');
        const hasAnthropicApiKey = Boolean(data.hasAnthropicApiKey);
        anthropicApiKeyStatusEl.textContent = hasAnthropicApiKey
          ? t('settings.anthropicApiKeyStatusSet')
          : t('settings.anthropicApiKeyStatusNotSet');
        anthropicApiKeyStatusEl.classList.toggle('is-set', hasAnthropicApiKey);
        anthropicApiKeyStatusEl.classList.toggle('is-unset', !hasAnthropicApiKey);

        const gatewayApiKeyStatusEl = document.getElementById('gatewayApiKeyStatus');
        const hasAuthApiKey = Boolean(data.hasAuthApiKey);
        gatewayApiKeyStatusEl.textContent = hasAuthApiKey
          ? t('settings.gatewayApiKeyStatusSet')
          : t('settings.gatewayApiKeyStatusNotSet');
        gatewayApiKeyStatusEl.classList.toggle('is-set', hasAuthApiKey);
        gatewayApiKeyStatusEl.classList.toggle('is-unset', !hasAuthApiKey);

        settingsLoadedState = {
          rateLimitSeconds:
            data.rateLimitSeconds === null || data.rateLimitSeconds === undefined ?
              null
            : Number(data.rateLimitSeconds),
          rateLimitWait: Boolean(data.rateLimitWait),
          anthropicApiKey: '',
          gatewayApiKey: ''
        };

        const notices = [t('settings.noticeProcessWide')];
        if (data.envOverride?.rateLimitSeconds || data.envOverride?.rateLimitWait) {
          const overrides = [];
          if (data.envOverride.rateLimitSeconds) overrides.push('RATE_LIMIT');
          if (data.envOverride.rateLimitWait) overrides.push('RATE_LIMIT_WAIT');
          notices.push(t('settings.noticeEnvOverride', { names: overrides.join(', ') }));
        } else {
          notices.push(t('settings.noticeSavedValues'));
        }
        document.getElementById('settingsNotice').textContent = notices.join(' ');
        updateSettingsDirtyState();
      } catch (_error) {
        settingsLoadedState = null;
        document.getElementById('settingsNotice').textContent = t('settings.failedLoad');
        updateSettingsDirtyState();
      }
    }

    async function saveSettings() {
      const btn = document.getElementById('saveSettingsBtn');
      const currentState = readSettingsFormState();

      if (
        currentState.rawRateLimitSeconds !== ''
        && (!Number.isFinite(currentState.rateLimitSeconds) || currentState.rateLimitSeconds <= 0)
      ) {
        alert(t('settings.validationRateLimit'));
        return;
      }

      btn.disabled = true;
      try {
        const requestBody = {
          rateLimitSeconds: currentState.rateLimitSeconds,
          rateLimitWait: currentState.rateLimitWait
        };
        if (currentState.anthropicApiKey !== '') {
          requestBody.anthropicApiKey = currentState.anthropicApiKey;
        }
        if (currentState.gatewayApiKey !== '') {
          requestBody.authApiKey = currentState.gatewayApiKey;
        }

        const res = await fetch(API_BASE + '/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error?.message || t('settings.failedSave'));
          updateSettingsDirtyState();
          return;
        }
        await fetchSettings();
      } catch (_error) {
        alert(t('settings.failedSave'));
        updateSettingsDirtyState();
      }
    }

    async function clearAnthropicApiKey() {
      const confirmed = await openConfirmActionModal({
        title: t('settings.clearAnthropicApiKeyConfirmTitle'),
        message: t('settings.clearAnthropicApiKeyConfirmMessage'),
        confirmText: t('settings.clearAnthropicApiKey'),
        tone: 'danger'
      });

      if (!confirmed) {
        return;
      }

      const clearButton = document.getElementById('clearAnthropicApiKeyBtn');
      clearButton.disabled = true;

      try {
        const res = await fetch(API_BASE + '/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearAnthropicApiKey: true })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error?.message || t('settings.failedSave'));
          return;
        }

        await fetchSettings();
      } catch (_error) {
        alert(t('settings.failedSave'));
      } finally {
        clearButton.disabled = false;
      }
    }

    async function clearGatewayApiKey() {
      const confirmed = await openConfirmActionModal({
        title: t('settings.clearGatewayApiKeyConfirmTitle'),
        message: t('settings.clearGatewayApiKeyConfirmMessage'),
        confirmText: t('settings.clearGatewayApiKey'),
        tone: 'danger'
      });

      if (!confirmed) {
        return;
      }

      const clearButton = document.getElementById('clearGatewayApiKeyBtn');
      clearButton.disabled = true;

      try {
        const res = await fetch(API_BASE + '/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearAuthApiKey: true })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error?.message || t('settings.failedSave'));
          return;
        }

        await fetchSettings();
      } catch (_error) {
        alert(t('settings.failedSave'));
      } finally {
        clearButton.disabled = false;
      }
    }

    async function fetchAccounts() {
      try {
        const res = await fetch(API_BASE + '/accounts');
        const data = await res.json();
        renderAccounts(data);
      } catch (_error) {
        document.getElementById('accountList').innerHTML = '<li class="empty-state">' + t('accounts.failedLoad') + '</li>';
      }
    }

    function getAccountList() {
      return document.getElementById('accountList');
    }

    function getRenderedAccountItems() {
      const list = getAccountList();
      if (!list) {
        return [];
      }
      return Array.from(list.querySelectorAll('.account-item[data-account-id]'));
    }

    function getRenderedAccountOrder() {
      return getRenderedAccountItems()
        .map(function (item) { return item.dataset.accountId || ''; })
        .filter(Boolean);
    }

    function clearAccountDragPreview() {
      document.querySelectorAll('.account-item.drag-target-before, .account-item.drag-target-after').forEach(function (item) {
        item.classList.remove('drag-target-before', 'drag-target-after');
      });
    }

    function resetAccountDragState() {
      clearAccountDragPreview();
      document.querySelectorAll('.account-item.drag-source').forEach(function (item) {
        item.classList.remove('drag-source');
      });
      document.querySelectorAll('.account-drag-handle.dragging').forEach(function (handle) {
        handle.classList.remove('dragging');
      });
      draggedAccountElement = null;
      draggedAccountInitialOrder = [];
      didDropAccount = false;
      isDraggingAccount = false;
    }

    function applyAccountOrderToDom(accountIds) {
      const list = getAccountList();
      if (!list) {
        return;
      }

      const itemMap = new Map(getRenderedAccountItems().map(function (item) {
        return [item.dataset.accountId, item];
      }));

      accountIds.forEach(function (accountId) {
        const item = itemMap.get(accountId);
        if (item) {
          list.appendChild(item);
        }
      });
    }

    function hasSameAccountOrder(left, right) {
      if (left.length !== right.length) {
        return false;
      }

      return left.every(function (value, index) {
        return value === right[index];
      });
    }

    async function persistAccountOrder(accountIds, previousOrder) {
      if (isSavingAccountOrder) {
        return;
      }

      isSavingAccountOrder = true;

      try {
        const res = await fetch(API_BASE + '/accounts/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountIds: accountIds })
        });

        if (!res.ok) {
          applyAccountOrderToDom(previousOrder);
          await fetchAccounts();
          alert(t('accounts.failedReorder'));
        }
      } catch (_error) {
        applyAccountOrderToDom(previousOrder);
        await fetchAccounts();
        alert(t('accounts.failedReorder'));
      } finally {
        isSavingAccountOrder = false;
      }
    }

    function handleAccountListDragStart(event) {
      if (isSavingAccountOrder) {
        event.preventDefault();
        return;
      }

      const handle = event.target.closest('.account-drag-handle');
      if (!handle || handle.classList.contains('disabled')) {
        return;
      }

      const item = handle.closest('.account-item');
      if (!item || !item.dataset.accountId) {
        return;
      }

      draggedAccountElement = item;
      draggedAccountInitialOrder = getRenderedAccountOrder();
      didDropAccount = false;
      isDraggingAccount = true;
      clearAccountDragPreview();
      item.classList.add('drag-source');
      handle.classList.add('dragging');

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.dataset.accountId);
      }
    }

    function handleAccountListDragOver(event) {
      if (!isDraggingAccount || !draggedAccountElement) {
        return;
      }

      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }

      const list = getAccountList();
      if (!list) {
        return;
      }

      const targetItem = event.target.closest('.account-item');
      clearAccountDragPreview();

      if (!targetItem) {
        if (list.lastElementChild !== draggedAccountElement) {
          list.appendChild(draggedAccountElement);
        }
        return;
      }

      if (targetItem === draggedAccountElement) {
        return;
      }

      const rect = targetItem.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + (rect.height / 2);
      const referenceNode = insertAfter ? targetItem.nextSibling : targetItem;
      list.insertBefore(draggedAccountElement, referenceNode);
      targetItem.classList.add(insertAfter ? 'drag-target-after' : 'drag-target-before');
    }

    function handleAccountListDrop(event) {
      if (!isDraggingAccount || !draggedAccountElement) {
        return;
      }

      event.preventDefault();
      didDropAccount = true;
      clearAccountDragPreview();

      const nextOrder = getRenderedAccountOrder();
      const previousOrder = draggedAccountInitialOrder.slice();

      if (!hasSameAccountOrder(nextOrder, previousOrder)) {
        void persistAccountOrder(nextOrder, previousOrder);
      }
    }

    function handleAccountListDragEnd() {
      if (!draggedAccountElement) {
        resetAccountDragState();
        return;
      }

      if (!didDropAccount && draggedAccountInitialOrder.length > 0) {
        applyAccountOrderToDom(draggedAccountInitialOrder);
      }

      resetAccountDragState();
    }

    async function fetchStatus() {
      try {
        const res = await fetch(API_BASE + '/auth/status');
        const data = await res.json();
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const avatar = document.getElementById('sidebarAvatar');
        const avatarFallback = document.getElementById('sidebarAvatarFallback');
        const sidebarLogin = document.getElementById('sidebarLogin');
        const sidebarType = document.getElementById('sidebarType');

        function setSidebarFallback(label) {
          avatar.style.display = 'none';
          avatar.removeAttribute('src');
          avatarFallback.style.display = 'grid';
          avatarFallback.textContent = label;
        }

        if (data.authenticated) {
          dot.classList.add('online');
          text.textContent = t('status.connected');

          const login = data.activeAccount?.login || t('usage.unknown');
          const accountType = data.activeAccount?.accountType || 'individual';
          const avatarUrl = data.activeAccount?.avatarUrl || '';

          sidebarLogin.textContent = login;
          sidebarType.textContent = t('status.accountLabel', { type: formatAccountType(accountType) });

          if (avatarUrl) {
            avatar.src = avatarUrl;
            avatar.style.display = 'block';
            avatarFallback.style.display = 'none';
          } else {
            setSidebarFallback((login.slice(0, 1) || '?').toUpperCase());
          }
        } else {
          dot.classList.remove('online');
          text.textContent = t('status.notConnected');
          sidebarLogin.textContent = t('status.noActiveAccount');
          sidebarType.textContent = t('status.connectAccount');
          setSidebarFallback('!');
        }
      } catch (_error) {
        document.getElementById('statusText').textContent = t('status.connectionError');
        document.getElementById('sidebarLogin').textContent = t('status.connectionError');
        document.getElementById('sidebarType').textContent = t('status.checkLocalServer');
        const avatar = document.getElementById('sidebarAvatar');
        const avatarFallback = document.getElementById('sidebarAvatarFallback');
        avatar.style.display = 'none';
        avatarFallback.style.display = 'grid';
        avatarFallback.textContent = '!';
      }
    }

    function renderAccounts(data) {
      const list = document.getElementById('accountList');
      if (!data.accounts || data.accounts.length === 0) {
        list.innerHTML = '<li class="empty-state">' + t('accounts.noAccounts') + '</li>';
        return;
      }
      const canReorder = data.accounts.length > 1;
      const dragHint = escapeHtml(t('accounts.dragToSort'));
      list.innerHTML = data.accounts.map(function (acc) {
        const safeAccountId = escapeHtml(acc.id);
        const safeAvatarUrl = escapeHtml(acc.avatarUrl || '');
        const safeLogin = escapeHtml(acc.login);
        return '<li class="account-item ' + (acc.isActive ? 'active' : '') + '" data-account-id="' + safeAccountId + '">' +
          '<div class="account-drag-handle' + (canReorder ? '' : ' disabled') + '" draggable="' + (canReorder ? 'true' : 'false') + '"' + (canReorder ? ' title="' + dragHint + '" aria-label="' + dragHint + '"' : '') + '>' +
          '<img class="account-avatar" src="' + safeAvatarUrl + '" alt="" draggable="false" onerror="this.style.display=\\'none\\'">' +
          '</div>' +
          '<div class="account-info">' +
            '<div class="account-name">' + safeLogin + '</div>' +
            '<div class="account-type">' + formatAccountType(acc.accountType) + '</div>' +
          '</div>' +
          '<div class="account-usage">' + renderAccountUsage(acc.usage) + '</div>' +
          '<div class="account-actions">' +
          (acc.isActive ? '<button class="btn btn-primary btn-sm" type="button">' + t('accounts.active') + '</button>' : '<button class="btn btn-sm" onclick="switchAccount(\\'' + acc.id + '\\')">' + t('accounts.switch') + '</button>') +
          '<button class="btn btn-sm btn-danger" onclick="deleteAccount(\\'' + acc.id + '\\', \\'' + acc.login + '\\')">' + t('accounts.delete') + '</button>' +
          '</div></li>';
      }).join('');
    }

    async function switchAccount(id) {
      const shouldSwitch = await openConfirmActionModal({
        title: t('accounts.switch'),
        message: t('accounts.switchConfirm'),
        confirmText: t('accounts.switch'),
        tone: 'primary'
      });
      if (!shouldSwitch) return;

      try {
        const res = await fetch(API_BASE + '/accounts/' + id + '/activate', { method: 'POST' });
        if (res.ok) {
          resetUsageLogPagination();
          fetchAccounts();
          fetchStatus();
          const activeTab = document.querySelector('.tab.active');
          if (activeTab && activeTab.dataset.tab === 'usage') {
            void fetchUsage(true);
          }
        } else {
          const data = await res.json();
          alert(data.error?.message || t('accounts.failedSwitch'));
        }
      } catch (_error) {
        alert(t('accounts.failedSwitch'));
      }
    }

    async function deleteAccount(id, login) {
      const shouldDelete = await openConfirmActionModal({
        title: t('common.delete'),
        message: t('accounts.deleteConfirm', { login }),
        confirmText: t('common.delete'),
        tone: 'danger'
      });
      if (!shouldDelete) return;

      try {
        const res = await fetch(API_BASE + '/accounts/' + id, { method: 'DELETE' });
        if (res.ok) {
          resetUsageLogPagination();
          fetchAccounts();
          fetchStatus();
          const activeTab = document.querySelector('.tab.active');
          if (activeTab && activeTab.dataset.tab === 'usage') {
            void fetchUsage(true);
          }
        } else {
          const data = await res.json();
          alert(data.error?.message || t('accounts.failedDelete'));
        }
      } catch (_error) {
        alert(t('accounts.failedDelete'));
      }
    }

    async function fetchPremiumMultipliers() {
      try {
        const res = await fetch(API_BASE + '/premium-multipliers');
        const data = await res.json();

        const hiddenModelList = Array.isArray(data.hiddenModels)
          ? data.hiddenModels.filter(function (modelId) { return typeof modelId === 'string' && modelId.length > 0; })
          : [];

        return {
          multipliers: data.multipliers && typeof data.multipliers === 'object' ? data.multipliers : {},
          modelCardMetadata: data.modelCardMetadata && typeof data.modelCardMetadata === 'object' ? data.modelCardMetadata : {},
          reasoningEfforts: data.reasoningEfforts && typeof data.reasoningEfforts === 'object' ? data.reasoningEfforts : {},
          modelSupportedReasoningEfforts: data.modelSupportedReasoningEfforts && typeof data.modelSupportedReasoningEfforts === 'object' ? data.modelSupportedReasoningEfforts : {},
          hiddenModels: hiddenModelList
        };
      } catch (_error) {
        return { multipliers: {}, modelCardMetadata: {}, reasoningEfforts: {}, modelSupportedReasoningEfforts: {}, hiddenModels: [] };
      }
    }

    function getConfiguredMultiplier(modelId) {
      const value = premiumMultipliers[modelId];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return 0;
      }
      return value;
    }

    function getModelCardInfo(modelId) {
      const value = modelCardMetadata[modelId];
      if (!value || typeof value !== 'object') {
        return { contextWindowTokens: null, features: [] };
      }

      const contextWindowTokens =
        typeof value.contextWindowTokens === 'number' && Number.isFinite(value.contextWindowTokens) && value.contextWindowTokens > 0
          ? value.contextWindowTokens
          : null;
      const features =
        Array.isArray(value.features)
          ? value.features.filter(function (feature) { return typeof feature === 'string' && feature.length > 0; })
          : [];

      return { contextWindowTokens, features };
    }

    function formatContextWindow(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return t('usage.na');
      }

      if (value >= 1000000) {
        const millionValue = value / 1000000;
        const millionText = millionValue >= 100 ? millionValue.toFixed(0) : millionValue.toFixed(1);
        return (millionText.endsWith('.0') ? millionText.slice(0, -2) : millionText) + 'M';
      }

      if (value >= 1000) {
        const kiloValue = value / 1000;
        const kiloText = kiloValue >= 100 ? kiloValue.toFixed(0) : kiloValue.toFixed(1);
        return (kiloText.endsWith('.0') ? kiloText.slice(0, -2) : kiloText) + 'K';
      }

      return formatNumber(value);
    }

    function toFeatureKey(feature) {
      if (typeof feature !== 'string') {
        return null;
      }

      const normalized = feature.trim().toLowerCase();
      if (!normalized) {
        return null;
      }

      if (normalized === 'tool calls') return 'toolCalls';
      if (normalized === 'parallel tool calls') return 'parallelToolCalls';
      if (normalized === 'streaming') return 'streaming';
      if (normalized === 'structured outputs') return 'structuredOutputs';
      if (normalized === 'vision') return 'vision';
      if (normalized === 'embeddings') return 'embeddings';
      if (normalized === 'thinking') return 'thinking';

      return null;
    }

    function getSimplifiedFeatureKeys(features) {
      if (!Array.isArray(features) || features.length === 0) {
        return [];
      }

      const resolved = new Set(
        features
          .map(function (feature) { return toFeatureKey(feature); })
          .filter(function (featureKey) { return typeof featureKey === 'string'; })
      );

      const simplified = [];

      if (resolved.has('toolCalls') || resolved.has('parallelToolCalls')) {
        simplified.push('tools');
      }
      if (resolved.has('vision')) {
        simplified.push('vision');
      }
      if (resolved.has('embeddings')) {
        simplified.push('embeddings');
      }

      return simplified;
    }

    function formatModelFeatures(features) {
      const simplifiedKeys = getSimplifiedFeatureKeys(features);
      if (simplifiedKeys.length === 0) {
        return t('models.featureNone');
      }

      const labels = simplifiedKeys.map(function (featureKey) {
        return t('models.featureSimple.' + featureKey);
      });

      return labels.join(currentLocale === 'zh-CN' ? '、' : ', ');
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function loadCollapsedProviders() {
      try {
        const value = localStorage.getItem(MODELS_COLLAPSED_STORAGE_KEY);
        if (!value) {
          return new Set();
        }

        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
          return new Set();
        }

        const keys = parsed.filter(function (providerKey) {
          return typeof providerKey === 'string' && providerKey.length > 0;
        });

        return new Set(keys);
      } catch (_error) {
        return new Set();
      }
    }

    function persistCollapsedProviders() {
      localStorage.setItem(MODELS_COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(collapsedProviders)));
    }

    function isProviderCollapsed(providerKey) {
      return collapsedProviders.has(providerKey);
    }

    function setProviderCollapsed(providerKey, collapsed) {
      if (collapsed) {
        collapsedProviders.add(providerKey);
      } else {
        collapsedProviders.delete(providerKey);
      }
      persistCollapsedProviders();
    }

    function formatMultiplierLabel(multiplier) {
      if (multiplier <= 0) {
        return t('models.free');
      }
      return Number.isInteger(multiplier) ? ('x' + multiplier) : ('x' + multiplier.toString());
    }

    function isModelHidden(modelId) {
      return hiddenModels.has(modelId);
    }

    function shouldDisplayModel(modelId) {
      return modelVisibilityFilter === 'hidden' ? isModelHidden(modelId) : !isModelHidden(modelId);
    }

    function getModelProviderKey(modelId) {
      if (typeof modelId !== 'string') {
        return 'other';
      }

      const lower = modelId.toLowerCase();

      if (
        lower.startsWith('gpt-')
        || lower.startsWith('o1')
        || lower.startsWith('o3')
        || lower.startsWith('o4')
        || lower.startsWith('text-embedding-')
      ) {
        return 'openai';
      }
      if (lower.startsWith('claude-')) {
        return 'claude';
      }
      if (lower.startsWith('gemini-')) {
        return 'google';
      }
      if (lower.startsWith('grok-')) {
        return 'grok';
      }

      return 'other';
    }

    function isGptFiveOrAboveModel(modelId) {
      if (typeof modelId !== 'string') {
        return false;
      }

      const match = modelId.toLowerCase().match(/^gpt-([0-9]+)/);
      if (!match) {
        return false;
      }

      const major = Number(match[1]);
      return Number.isFinite(major) && major >= 5;
    }

    function modelSupportsReasoningEffort(modelId) {
      const supported = modelSupportedReasoningEfforts[modelId];
      return Array.isArray(supported) && supported.length > 0;
    }

    function getModelSupportedEfforts(modelId) {
      const supported = modelSupportedReasoningEfforts[modelId];
      if (!Array.isArray(supported) || supported.length === 0) {
        return [];
      }
      return supported;
    }

    function getConfiguredReasoningEffort(modelId) {
      const value = reasoningEfforts[modelId];
      const supported = getModelSupportedEfforts(modelId);
      if (supported.length > 0 && supported.includes(value)) {
        return value;
      }
      // 默认返回支持列表中的最后一个（通常是最高的）
      if (supported.length > 0) {
        return supported[supported.length - 1];
      }
      return 'high';
    }

    function getProviderLabel(providerKey) {
      if (providerKey === 'openai') return 'OpenAI';
      if (providerKey === 'claude') return 'Claude';
      if (providerKey === 'google') return 'Google';
      if (providerKey === 'grok') return 'Grok';
      return currentLocale === 'zh-CN' ? '其他' : 'Other';
    }

    function formatProviderCountLabel(count) {
      if (currentLocale === 'zh-CN') {
        return '共 ' + formatNumber(count);
      }
      return formatNumber(count) + ' models';
    }

    function getNumericSegments(value) {
      if (typeof value !== 'string' || value.length === 0) {
        return [];
      }

      const matches = value.match(/\\d+/g);
      if (!matches) {
        return [];
      }

      return matches
        .map(function (segment) { return Number(segment); })
        .filter(function (segment) { return Number.isFinite(segment); });
    }

    function getModelPrimaryNumericSource(model) {
      if (
        model
        && typeof model.display_name === 'string'
        && model.display_name.trim().length > 0
      ) {
        return model.display_name;
      }

      if (model && typeof model.id === 'string') {
        return model.id;
      }

      return '';
    }

    function getModelNumericSequence(model) {
      const primarySource = getModelPrimaryNumericSource(model);
      const primarySequence = getNumericSegments(primarySource);
      if (primarySequence.length > 0) {
        return primarySequence;
      }

      if (model && typeof model.id === 'string') {
        return getNumericSegments(model.id);
      }

      return [];
    }

    function compareNumericSequencesDesc(sequenceA, sequenceB) {
      const minLength = Math.min(sequenceA.length, sequenceB.length);
      for (let index = 0; index < minLength; index += 1) {
        const diff = sequenceB[index] - sequenceA[index];
        if (diff !== 0) {
          return diff;
        }
      }

      return sequenceB.length - sequenceA.length;
    }

    function compareModelsForDisplay(modelA, modelB) {
      const multiplierA = getConfiguredMultiplier(modelA.id);
      const multiplierB = getConfiguredMultiplier(modelB.id);
      const isPremiumA = multiplierA >= 1;
      const isPremiumB = multiplierB >= 1;

      if (isPremiumA !== isPremiumB) {
        return isPremiumA ? -1 : 1;
      }

      const numericSequenceA = getModelNumericSequence(modelA);
      const numericSequenceB = getModelNumericSequence(modelB);
      const hasNumericA = numericSequenceA.length > 0;
      const hasNumericB = numericSequenceB.length > 0;

      if (hasNumericA !== hasNumericB) {
        return hasNumericA ? -1 : 1;
      }

      if (hasNumericA && hasNumericB) {
        const numericDiff = compareNumericSequencesDesc(numericSequenceA, numericSequenceB);
        if (numericDiff !== 0) {
          return numericDiff;
        }

        const idNumericSequenceA = getNumericSegments(modelA.id);
        const idNumericSequenceB = getNumericSegments(modelB.id);
        if (idNumericSequenceA.length > 0 && idNumericSequenceB.length > 0) {
          const idNumericDiff = compareNumericSequencesDesc(idNumericSequenceA, idNumericSequenceB);
          if (idNumericDiff !== 0) {
            return idNumericDiff;
          }
        }
      }

      const multiplierDiff = multiplierB - multiplierA;
      if (multiplierDiff !== 0) {
        return multiplierDiff;
      }

      return modelA.id.localeCompare(modelB.id);
    }

    function renderModelCard(model) {
      const multiplier = getConfiguredMultiplier(model.id);
      const encodedModelId = encodeURIComponent(model.id);
      const multiplierClass = multiplier >= 1 ? 'paid' : 'free';
      const isPremium = multiplier >= 1;
      const isHiddenModel = isModelHidden(model.id);
      const metadata = getModelCardInfo(model.id);
      const contextWindowText = formatContextWindow(metadata.contextWindowTokens);
      const featuresText = formatModelFeatures(metadata.features);
      const safeModelId = escapeHtml(model.id);
      const safeContextWindowText = escapeHtml(contextWindowText);
      const safeFeaturesText = escapeHtml(featuresText);
      const visibilityActionText = isHiddenModel ? t('models.show') : t('models.hide');
      const visibilityActionClass = isHiddenModel ? 'model-visibility-action-btn show' : 'model-visibility-action-btn';
      const showReasoningSelector = modelSupportsReasoningEffort(model.id);
      const reasoningEffort = getConfiguredReasoningEffort(model.id);
      const supportedEfforts = getModelSupportedEfforts(model.id);
      const visibilityActionMarkup = isModelManageMode
        ? '<button type="button" class="' + visibilityActionClass + '" data-model-id="' + encodedModelId + '" data-current-hidden="' + (isHiddenModel ? '1' : '0') + '">' + escapeHtml(visibilityActionText) + '</button>'
        : '';
      const reasoningSelectorMarkup = showReasoningSelector
        ? '<label class="model-reasoning-wrap">'
          + '<select class="model-reasoning-select" data-model-id="' + encodedModelId + '">'
          + (supportedEfforts.includes('none') ? '<option value="none"' + (reasoningEffort === 'none' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.none')) + '</option>' : '')
          + (supportedEfforts.includes('minimal') ? '<option value="minimal"' + (reasoningEffort === 'minimal' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.minimal')) + '</option>' : '')
          + (supportedEfforts.includes('low') ? '<option value="low"' + (reasoningEffort === 'low' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.low')) + '</option>' : '')
          + (supportedEfforts.includes('medium') ? '<option value="medium"' + (reasoningEffort === 'medium' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.medium')) + '</option>' : '')
          + (supportedEfforts.includes('high') ? '<option value="high"' + (reasoningEffort === 'high' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.high')) + '</option>' : '')
          + (supportedEfforts.includes('xhigh') ? '<option value="xhigh"' + (reasoningEffort === 'xhigh' ? ' selected' : '') + '>' + escapeHtml(t('models.reasoningOption.xhigh')) + '</option>' : '')
          + '</select>'
          + '</label>'
        : '';
      const reasoningRightMarkup = reasoningSelectorMarkup;

      return '<div class="model-card' + (isHiddenModel ? ' hidden-model' : '') + '">'
        + '<div class="model-top">'
        + '<div class="model-name" title="' + safeModelId + '">' + safeModelId + '</div>'
        + '<div class="model-right">'
        + visibilityActionMarkup
        + (isPremium ? '<span class="model-premium-badge">' + t('models.premium') + '</span>' : '')
        + '<span class="model-multiplier ' + multiplierClass + '" data-model-id="' + encodedModelId + '">' + formatMultiplierLabel(multiplier) + '</span>'
        + '</div>'
        + '</div>'
        + '<div class="model-meta">'
        + '<div class="model-meta-row">'
        + '<span class="model-meta-group model-meta-group-left">'
        + '<span class="model-meta-label">' + t('models.features') + '</span>'
        + '<span class="model-meta-value">' + safeFeaturesText + '</span>'
        + '</span>'
        + '<span class="model-meta-group model-meta-group-right">'
        + reasoningRightMarkup
        + '<span class="model-meta-label">' + t('models.contextWindow') + '</span>'
        + '<span class="model-meta-value">' + safeContextWindowText + '</span>'
        + '</span>'
        + '</div>'
        + '</div>'
        + '</div>';
    }

    function applyPremiumBadge(multiplierEl, multiplier) {
      const right = multiplierEl.closest('.model-right');
      if (!right) {
        return;
      }

      const existingBadge = right.querySelector('.model-premium-badge');

      if (multiplier >= 1) {
        if (existingBadge) {
          existingBadge.textContent = t('models.premium');
          return;
        }

        const badge = document.createElement('span');
        badge.className = 'model-premium-badge';
        badge.textContent = t('models.premium');
        right.insertBefore(badge, multiplierEl);
        return;
      }

      if (existingBadge) {
        existingBadge.remove();
      }
    }

    function applyMultiplierDisplay(multiplierEl, multiplier) {
      multiplierEl.classList.remove('editing', 'free', 'paid');
      multiplierEl.classList.add(multiplier >= 1 ? 'paid' : 'free');
      applyPremiumBadge(multiplierEl, multiplier);
      multiplierEl.textContent = formatMultiplierLabel(multiplier);
      delete multiplierEl.dataset.editing;
    }

    async function saveMultiplier(modelId, multiplier) {
      const res = await fetch(API_BASE + '/premium-multipliers/' + encodeURIComponent(modelId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier })
      });

      if (!res.ok) {
        const data = await res.json().catch(function () { return {}; });
        throw new Error(data.error?.message || t('models.failedSaveMultiplier'));
      }

      premiumMultipliers[modelId] = multiplier;
    }

    async function saveReasoningEffort(modelId, effort) {
      const res = await fetch(API_BASE + '/reasoning-efforts/' + encodeURIComponent(modelId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effort })
      });

      if (!res.ok) {
        const data = await res.json().catch(function () { return {}; });
        throw new Error(data.error?.message || t('models.failedSaveReasoningEffort'));
      }

      reasoningEfforts[modelId] = effort;
    }

    async function saveModelVisibility(modelId, hidden) {
      const res = await fetch(API_BASE + '/model-visibility/' + encodeURIComponent(modelId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden })
      });

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        throw new Error(data.error?.message || t('models.failedSaveVisibility'));
      }

      const nextHiddenModels = Array.isArray(data.hiddenModels)
        ? data.hiddenModels.filter(function (item) { return typeof item === 'string' && item.length > 0; })
        : [];

      hiddenModels = new Set(nextHiddenModels);
    }

    function startMultiplierEdit(multiplierEl) {
      if (multiplierEl.dataset.editing === '1') {
        return;
      }

      const encodedModelId = multiplierEl.dataset.modelId || '';
      const modelId = decodeURIComponent(encodedModelId);
      const currentValue = getConfiguredMultiplier(modelId);

      multiplierEl.dataset.editing = '1';
      multiplierEl.classList.add('editing');
      multiplierEl.innerHTML = '<input class="model-multiplier-input" type="number" min="0" step="0.01" value="' + currentValue + '">';

      const input = multiplierEl.querySelector('input');
      if (!input) {
        applyMultiplierDisplay(multiplierEl, currentValue);
        return;
      }

      input.focus();
      input.select();

      let completed = false;

      const complete = async function (shouldSave) {
        if (completed) return;
        completed = true;

        if (!shouldSave) {
          applyMultiplierDisplay(multiplierEl, currentValue);
          return;
        }

        const nextValue = Number(input.value);
        if (!Number.isFinite(nextValue) || nextValue < 0) {
          alert(t('models.invalidMultiplier'));
          applyMultiplierDisplay(multiplierEl, currentValue);
          return;
        }

        try {
          await saveMultiplier(modelId, nextValue);
          applyMultiplierDisplay(multiplierEl, nextValue);
          rerenderModelsFromCache();
        } catch (error) {
          alert(error instanceof Error ? error.message : t('models.failedSaveMultiplier'));
          applyMultiplierDisplay(multiplierEl, currentValue);
        }
      };

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          void complete(false);
        }
      });

      input.addEventListener('blur', function () {
        void complete(true);
      });
    }

    async function fetchModels() {
      const btn = document.getElementById('refreshModels');
      btn.classList.add('loading');
      try {
        const [modelsRes, premiumConfig] = await Promise.all([
          fetch(API_BASE + '/models'),
          fetchPremiumMultipliers()
        ]);
        const data = await modelsRes.json();
        premiumMultipliers = premiumConfig.multipliers;
        modelCardMetadata = premiumConfig.modelCardMetadata;
        reasoningEfforts = premiumConfig.reasoningEfforts;
        modelSupportedReasoningEfforts = premiumConfig.modelSupportedReasoningEfforts;
        hiddenModels = new Set(premiumConfig.hiddenModels);
        latestModelsPayload = data;
        renderModels(latestModelsPayload);
      } catch (_error) {
        latestModelsPayload = null;
        document.getElementById('modelsList').innerHTML = '<div class="empty-state">' + t('models.failedLoad') + '</div>';
      } finally {
        btn.classList.remove('loading');
      }
    }

    function renderModels(data) {
      const container = document.getElementById('modelsList');
      if (!data.data || data.data.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t('models.noModels') + '</div>';
        return;
      }

      const modelsForView = data.data.filter(function (model) {
        return shouldDisplayModel(model.id);
      });

      if (modelsForView.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t(modelVisibilityFilter === 'hidden' ? 'models.noHiddenModels' : 'models.noVisibleModels') + '</div>';
        return;
      }

      const providerOrder = ['claude', 'google', 'openai', 'grok', 'other'];
      const groupedModels = {
        openai: [],
        claude: [],
        google: [],
        grok: [],
        other: []
      };

      modelsForView.forEach(function (model) {
        const providerKey = getModelProviderKey(model.id);
        groupedModels[providerKey].push(model);
      });

      const groupedMarkup = providerOrder.map(function (providerKey) {
        const models = groupedModels[providerKey];
        if (!models || models.length === 0) {
          return '';
        }

        const sortedModels = models.slice().sort(compareModelsForDisplay);
        const premiumCount = sortedModels.filter(function (model) {
          return getConfiguredMultiplier(model.id) >= 1;
        }).length;

        const providerLabel = escapeHtml(getProviderLabel(providerKey));
        const countLabel = escapeHtml(formatProviderCountLabel(sortedModels.length));
        const premiumLabel = escapeHtml(t('models.premium') + ' ' + formatNumber(premiumCount));
        const isCollapsed = isProviderCollapsed(providerKey);
        const providerKeyAttr = escapeHtml(providerKey);
        const toggleLabel = escapeHtml(t(isCollapsed ? 'models.expand' : 'models.collapse'));
        const modelsGridClass = isCollapsed ? 'models-grid provider-models-collapsed' : 'models-grid';

        return '<section class="provider-group provider-' + providerKey + '">'
          + '<div class="provider-group-header">'
          + '<div class="provider-group-title-wrap">'
          + '<span class="provider-group-title">' + providerLabel + '</span>'
          + '<span class="provider-group-count">' + countLabel + '</span>'
          + '</div>'
          + '<div class="provider-group-stats">'
          + '<span class="provider-stat provider-stat-premium">' + premiumLabel + '</span>'
          + '<button type="button" class="provider-toggle-btn" data-provider-key="' + providerKeyAttr + '">' + toggleLabel + '</button>'
          + '</div>'
          + '</div>'
          + '<div class="' + modelsGridClass + '">' + sortedModels.map(function (model) { return renderModelCard(model); }).join('') + '</div>'
          + '</section>';
      }).filter(Boolean).join('');

      container.innerHTML = '<div class="model-groups">' + groupedMarkup + '</div>';

      container.querySelectorAll('.model-multiplier').forEach(function (multiplierEl) {
        multiplierEl.addEventListener('dblclick', function () {
          startMultiplierEdit(multiplierEl);
        });
      });

      container.querySelectorAll('.model-visibility-action-btn').forEach(function (visibilityBtn) {
        visibilityBtn.addEventListener('click', async function () {
          const encodedModelId = visibilityBtn.dataset.modelId || '';
          const modelId = decodeURIComponent(encodedModelId);
          const currentlyHidden = visibilityBtn.dataset.currentHidden === '1';
          const nextHidden = !currentlyHidden;

          visibilityBtn.disabled = true;
          try {
            await saveModelVisibility(modelId, nextHidden);
            rerenderModelsFromCache();
          } catch (error) {
            alert(error instanceof Error ? error.message : t('models.failedSaveVisibility'));
          } finally {
            visibilityBtn.disabled = false;
          }
        });
      });

      container.querySelectorAll('.model-reasoning-select').forEach(function (selectEl) {
        selectEl.addEventListener('change', async function () {
          const encodedModelId = selectEl.dataset.modelId || '';
          const modelId = decodeURIComponent(encodedModelId);
          const previousEffort = getConfiguredReasoningEffort(modelId);
          const nextEffort = selectEl.value;

          if (nextEffort !== 'low' && nextEffort !== 'medium' && nextEffort !== 'high' && nextEffort !== 'xhigh') {
            selectEl.value = previousEffort;
            return;
          }

          selectEl.disabled = true;
          try {
            await saveReasoningEffort(modelId, nextEffort);
          } catch (error) {
            selectEl.value = previousEffort;
            alert(error instanceof Error ? error.message : t('models.failedSaveReasoningEffort'));
          } finally {
            selectEl.disabled = false;
          }
        });
      });

      container.querySelectorAll('.provider-toggle-btn').forEach(function (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          const providerKey = toggleBtn.dataset.providerKey;
          if (!providerKey) {
            return;
          }

          const providerGroup = toggleBtn.closest('.provider-group');
          if (!providerGroup) {
            return;
          }

          const modelsGrid = providerGroup.querySelector('.models-grid');
          if (!modelsGrid) {
            return;
          }

          const nextCollapsed = !modelsGrid.classList.contains('provider-models-collapsed');
          modelsGrid.classList.toggle('provider-models-collapsed', nextCollapsed);
          setProviderCollapsed(providerKey, nextCollapsed);
          toggleBtn.textContent = t(nextCollapsed ? 'models.expand' : 'models.collapse');
        });
      });
    }

    function normalizeUsageLogEndpointFilter(value) {
      if (typeof value !== 'string') {
        return '';
      }

      return value.trim();
    }

    function setUsageLogEndpointFilter(value, persist) {
      usageLogEndpointFilter = normalizeUsageLogEndpointFilter(value);
      if (persist) {
        localStorage.setItem(USAGE_LOG_ENDPOINT_FILTER_STORAGE_KEY, usageLogEndpointFilter);
      }
    }

    function normalizeUsageLogEndpointOptions(value) {
      if (!Array.isArray(value)) {
        return [];
      }

      const uniqueValues = new Set();
      value.forEach(function (item) {
        if (typeof item !== 'string') {
          return;
        }

        const endpoint = item.trim();
        if (!endpoint) {
          return;
        }

        uniqueValues.add(endpoint);
      });

      return Array.from(uniqueValues);
    }

    function normalizeUsageLogPageSize(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        return DEFAULT_USAGE_LOG_PAGE_SIZE;
      }
      if (!USAGE_LOG_PAGE_SIZE_OPTIONS.includes(parsed)) {
        return DEFAULT_USAGE_LOG_PAGE_SIZE;
      }
      return parsed;
    }

    function setUsageLogPageSize(value, persist) {
      usageLogPageSize = normalizeUsageLogPageSize(value);
      if (persist) {
        localStorage.setItem(USAGE_LOG_PAGE_SIZE_STORAGE_KEY, String(usageLogPageSize));
      }
    }

    function getUsageLogPageSizeSelector() {
      const options = USAGE_LOG_PAGE_SIZE_OPTIONS.map(function (size) {
        return '<option value="' + size + '">' + size + '</option>';
      }).join('');

      return '<label class="usage-log-page-size-wrap"><span class="usage-log-page-size-label">' + escapeHtml(t('usage.logPageSize')) + '</span><select class="usage-log-source-filter" id="usageLogPageSizeSelect">' + options + '</select></label>';
    }

    function resetUsageLogPagination() {
      usageLogCursor = null;
      usageLogNextCursor = null;
      usageLogCursorStack = [];
      usageLogPageIndex = 1;
      usageLogLoadErrorMessage = null;
    }

    function getUsageLogsRequestUrl(cursorOverride) {
      const params = new URLSearchParams();
      const cursorValue = cursorOverride === undefined ? usageLogCursor : cursorOverride;
      params.set('limit', String(usageLogPageSize));
      if (usageLogEndpointFilter) {
        params.set('endpoint', usageLogEndpointFilter);
      }
      if (cursorValue) {
        params.set('cursor', cursorValue);
      }
      return API_BASE + '/usage-logs?' + params.toString();
    }

    function isUsageCursorValidationError(logsPayload) {
      const error = logsPayload && logsPayload.error ? logsPayload.error : null;
      const errorType = typeof error?.type === 'string' ? error.type : '';
      const errorMessage = typeof error?.message === 'string' ? error.message : '';
      return errorType === 'validation_error' && errorMessage.toLowerCase().includes('cursor');
    }

    function updateUsageLogControlsDisabledState() {
      const endpointFilterSelect = document.getElementById('usageLogEndpointFilter');
      if (endpointFilterSelect) {
        endpointFilterSelect.disabled = isFetchingUsageLogs;
      }

      const pageSizeSelect = document.getElementById('usageLogPageSizeSelect');
      if (pageSizeSelect) {
        pageSizeSelect.disabled = isFetchingUsageLogs;
      }

      const prevPageBtn = document.getElementById('usageLogPrevPageBtn');
      if (prevPageBtn) {
        prevPageBtn.disabled = isFetchingUsageLogs || usageLogPageIndex <= 1;
      }

      const nextPageBtn = document.getElementById('usageLogNextPageBtn');
      if (nextPageBtn) {
        nextPageBtn.disabled = isFetchingUsageLogs || !usageLogNextCursor;
      }
    }

    function getUsageLogEndpointHeaderFilter() {
      let options = '<option value="">' + escapeHtml(t('usage.logEndpointAll')) + '</option>';

      usageLogEndpointOptions.forEach(function (endpoint) {
        options += '<option value="' + escapeHtml(endpoint) + '">' + escapeHtml(endpoint) + '</option>';
      });

      return '<select class="usage-log-source-filter" id="usageLogEndpointFilter">' + options + '</select>';
    }

    function normalizeUsageTestIntervalMinutes(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
      }
      return Math.floor(value);
    }

    function getTestIntervalDisplayValue(rawValue) {
      return rawValue === '' ? t('usage.testDisabled') : rawValue;
    }

    function startUsageTestIntervalEdit(input) {
      if (input.dataset.editing === '1') {
        return;
      }

      input.dataset.editing = '1';
      input.readOnly = false;
      input.classList.add('editing');
      input.value = input.dataset.savedValue || '';
      input.focus();
      input.select();
    }

    function finishUsageTestIntervalEdit(input, rawValue) {
      const safeRawValue = rawValue || '';
      input.dataset.editing = '0';
      input.readOnly = true;
      input.classList.remove('editing');
      input.value = getTestIntervalDisplayValue(safeRawValue);
    }

    function isUsageTestIntervalEditing(element) {
      return Boolean(
        element
        && element.id === 'usageTestIntervalMinutesInput'
        && element.dataset
        && element.dataset.editing === '1'
      );
    }

    async function saveUsageTestInterval(input) {
      const previousRawValue = input.dataset.savedValue || '';
      const disabledDisplayText = t('usage.testDisabled');
      const rawValue = input.value.trim();
      let normalizedRawValue = rawValue;

      if (normalizedRawValue === '' || normalizedRawValue === disabledDisplayText) {
        normalizedRawValue = '';
      }

      let usageTestIntervalMinutes = null;

      if (normalizedRawValue !== '') {
        const parsed = Number(normalizedRawValue);
        if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
          alert(t('usage.validationTestInterval'));
          finishUsageTestIntervalEdit(input, previousRawValue);
          return;
        }
        usageTestIntervalMinutes = parsed;
      }

      input.disabled = true;
      try {
        const res = await fetch(API_BASE + '/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usageTestIntervalMinutes })
        });
        const payload = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          alert(payload.error?.message || t('usage.failedSaveTestInterval'));
          finishUsageTestIntervalEdit(input, previousRawValue);
          return;
        }

        const savedValue = normalizeUsageTestIntervalMinutes(payload.settings?.usageTestIntervalMinutes);
        const nextRawValue = savedValue === null ? '' : String(savedValue);
        input.dataset.savedValue = nextRawValue;
        finishUsageTestIntervalEdit(input, nextRawValue);
      } catch (_error) {
        alert(t('usage.failedSaveTestInterval'));
        finishUsageTestIntervalEdit(input, previousRawValue);
      } finally {
        input.disabled = false;
      }
    }

    async function fetchUsage(options) {
      const btn = document.getElementById('refreshUsage');
      const useSilent = options === true || (options && typeof options === 'object' && options.silent === true);
      const nav =
        options
        && typeof options === 'object'
        && (options.nav === 'next' || options.nav === 'prev') ?
          options.nav
        : null;
      const recoverFromCursorError = Boolean(
        options
        && typeof options === 'object'
        && options.recoverFromCursorError === true,
      );

      const activeElement = document.activeElement;
      const isEditingInterval = isUsageTestIntervalEditing(activeElement);
      if (useSilent && isEditingInterval) {
        return;
      }

      if (isFetchingUsageLogs) {
        return;
      }

      let targetCursor = usageLogCursor;
      let targetCursorStack = usageLogCursorStack.slice();
      let targetPageIndex = usageLogPageIndex;

      if (nav === 'prev') {
        if (targetPageIndex <= 1) {
          return;
        }
        targetCursor = targetCursorStack.pop() || null;
        targetPageIndex = Math.max(1, targetPageIndex - 1);
      } else if (nav === 'next') {
        if (!usageLogNextCursor) {
          return;
        }
        targetCursorStack.push(targetCursor);
        targetCursor = usageLogNextCursor;
        targetPageIndex += 1;
      }

      const requestSeq = ++usageLogsRequestSeq;
      isFetchingUsageLogs = true;
      updateUsageLogControlsDisabledState();

      if (!useSilent) btn.classList.add('loading');
      try {
        const [usageRes, logsRes, settingsRes] = await Promise.all([
          fetch(API_BASE + '/usage-summary'),
          fetch(getUsageLogsRequestUrl(targetCursor)),
          fetch(API_BASE + '/settings')
        ]);

        const data = await usageRes.json().catch(function () { return {}; });
        const logsPayload = await logsRes.json().catch(function () { return {}; });
        const settingsPayload = await settingsRes.json().catch(function () { return {}; });

        if (requestSeq !== usageLogsRequestSeq) {
          return;
        }

        if (!usageRes.ok) {
          throw new Error('usage_failed');
        }

        if (useSilent && isUsageTestIntervalEditing(document.activeElement)) {
          return;
        }

        usageLogLoadErrorMessage = null;
        let logs = [];

        if (!logsRes.ok) {
          if (!recoverFromCursorError && isUsageCursorValidationError(logsPayload)) {
            resetUsageLogPagination();
            isFetchingUsageLogs = false;
            updateUsageLogControlsDisabledState();
            void fetchUsage({ silent: true, recoverFromCursorError: true });
            return;
          }

          usageLogLoadErrorMessage =
            typeof logsPayload?.error?.message === 'string' && logsPayload.error.message ?
              logsPayload.error.message
            : t('usage.failedLoad');
          usageLogNextCursor = null;
          usageLogEndpointOptions = [];
        } else {
          logs = Array.isArray(logsPayload.logs) ? logsPayload.logs : [];
          usageLogEndpointOptions = normalizeUsageLogEndpointOptions(logsPayload?.pagination?.endpoints);
          const nextCursor =
            logsPayload
            && logsPayload.pagination
            && typeof logsPayload.pagination.nextCursor === 'string'
            && logsPayload.pagination.nextCursor ?
              logsPayload.pagination.nextCursor
            : null;
          const hasMore = Boolean(logsPayload?.pagination?.hasMore);

          usageLogCursor = targetCursor;
          usageLogCursorStack = targetCursorStack;
          usageLogPageIndex = targetPageIndex;
          usageLogNextCursor = hasMore ? nextCursor : null;
        }

        const testIntervalMinutes = normalizeUsageTestIntervalMinutes(settingsPayload.usageTestIntervalMinutes);
        renderUsage(data, logs, testIntervalMinutes, usageLogLoadErrorMessage);
      } catch (_error) {
        if (requestSeq !== usageLogsRequestSeq) {
          return;
        }
        document.getElementById('usageContent').innerHTML = '<div class="empty-state">' + t('usage.failedLoad') + '</div>';
      } finally {
        if (requestSeq === usageLogsRequestSeq) {
          isFetchingUsageLogs = false;
        }
        updateUsageLogControlsDisabledState();
        if (!useSilent) btn.classList.remove('loading');
      }
    }

    function renderUsage(data, logs, testIntervalMinutes, logsErrorMessage) {
      const container = document.getElementById('usageContent');
      if (!data.quota_snapshots) {
        container.innerHTML = '<div class="empty-state">' + t('usage.noData') + '</div>';
        return;
      }

      const quotas = data.quota_snapshots;
      const resetDateText = escapeHtml(data.quota_reset_date ? formatDate(data.quota_reset_date) : t('usage.na'));
      const chatEnabledText = escapeHtml(data.chat_enabled ? t('usage.yes') : t('usage.no'));
      const intervalInputRawValue = testIntervalMinutes === null ? '' : String(testIntervalMinutes);
      const intervalInputDisplayValue = getTestIntervalDisplayValue(intervalInputRawValue);

      let html = '<div class="usage-grid">';

      for (const [key, quota] of Object.entries(quotas)) {
        const percentUsed = quota.unlimited ? 0 : (100 - quota.percent_remaining);
        const used = quota.unlimited ? 0 : (quota.entitlement - quota.remaining);
        let barColor = 'green';
        if (percentUsed > 75) barColor = 'yellow';
        if (percentUsed > 90) barColor = 'red';
        if (quota.unlimited) barColor = 'blue';

        html += '<div class="usage-card"><div class="usage-header"><span class="usage-title">' + key.replace(/_/g, ' ') + '</span>' +
          '<span class="usage-percent">' + (quota.unlimited ? t('usage.unlimited') : t('usage.usedPercent', { percent: percentUsed.toFixed(1) })) + '</span></div>' +
          '<div class="usage-bar"><div class="usage-bar-fill ' + barColor + '" style="width: ' + (quota.unlimited ? 100 : percentUsed) + '%"></div></div>' +
          '<div class="usage-stats"><span>' + (quota.unlimited ? '∞' : formatNumber(used)) + ' / ' + (quota.unlimited ? '∞' : formatNumber(quota.entitlement)) + '</span>' +
          '<span>' + (quota.unlimited ? '∞' : t('usage.remaining', { value: formatNumber(quota.remaining) })) + '</span></div></div>';
      }

      html += '<div class="usage-card usage-summary-card">'
        + '<div class="usage-info-row"><span class="usage-info-label">' + t('usage.chatEnabled') + '</span><span>' + chatEnabledText + '</span></div>'
        + '<div class="usage-info-row"><span class="usage-info-label">' + t('usage.quotaResetDate') + '</span><span>' + resetDateText + '</span></div>'
        + '<div class="usage-info-row"><span class="usage-info-label">' + t('usage.testInterval') + '</span><span class="usage-info-control"><input class="usage-summary-input" id="usageTestIntervalMinutesInput" type="text" value="' + escapeHtml(intervalInputDisplayValue) + '" readonly autocomplete="off" spellcheck="false"></span></div>'
        + '</div>';

      html += '</div>';

      const usageLogs = Array.isArray(logs) ? logs : [];
      const endpointHeaderFilter = getUsageLogEndpointHeaderFilter();
      html += '<div class="usage-log-card">';

      if (usageLogs.length === 0) {
        html += '<div class="usage-log-toolbar">' + endpointHeaderFilter + '</div>';
        html += '<div class="empty-state">' + escapeHtml(logsErrorMessage || t('usage.logEmpty')) + '</div>';
      } else {
        html += '<div class="usage-log-table-wrap"><table class="usage-log-table">'
          + '<thead><tr>'
          + '<th>' + t('usage.logTime') + '</th>'
          + '<th>' + t('usage.logSource') + '</th>'
          + '<th>' + t('usage.logResponseType') + '</th>'
          + '<th>' + t('usage.logStatusCode') + '</th>'
          + '<th class="usage-log-source-head"><span class="usage-log-source-text">' + t('usage.logEndpoint') + '</span>' + endpointHeaderFilter + '</th>'
          + '<th>' + t('usage.logModel') + '</th>'
          + '<th>' + t('usage.logMultiplier') + '</th>'
          + '<th>' + t('usage.logPremium') + '</th>'
          + '<th>' + t('usage.logChat') + '</th>'
          + '<th>' + t('usage.logCompletions') + '</th>'
          + '</tr></thead><tbody>';

        html += usageLogs.map(function (log) {
          const createdAt =
            typeof log.createdAt === 'string' ?
              escapeHtml(formatDateTime(log.createdAt))
            : escapeHtml(t('usage.unknown'));
          const emptyCellText = '——';

          const source = t('usage.logSourceRequest');
          let responseTypeText = emptyCellText;
          let responseTypeClass = '';
          if (log.responseType === 'streaming') {
            responseTypeText = t('usage.logResponseTypeStreaming');
            responseTypeClass = 'streaming';
          } else if (log.responseType === 'non_streaming') {
            responseTypeText = t('usage.logResponseTypeNonStreaming');
            responseTypeClass = 'non-streaming';
          } else {
            responseTypeText = t('usage.unknown');
          }
          const responseType =
            responseTypeClass ?
              '<span class="usage-response-badge ' + responseTypeClass + '">' + escapeHtml(responseTypeText) + '</span>'
            : escapeHtml(responseTypeText);
          const statusCode =
            typeof log.statusCode === 'number' && Number.isFinite(log.statusCode) ?
              String(Math.trunc(log.statusCode))
            : emptyCellText;
          const endpoint =
            typeof log.endpoint === 'string' && log.endpoint ?
              escapeHtml(log.endpoint)
            : escapeHtml(emptyCellText);
          const model =
            typeof log.model === 'string' && log.model ?
              escapeHtml(log.model)
            : escapeHtml(emptyCellText);
          const multiplier =
            typeof log.multiplier === 'number' && Number.isFinite(log.multiplier) ?
              escapeHtml(formatNumber(log.multiplier))
            : escapeHtml(emptyCellText);
          const premiumUsed =
            typeof log.premiumUsed === 'number' && Number.isFinite(log.premiumUsed) ?
              formatNumber(log.premiumUsed)
            : emptyCellText;
          const premiumEntitlement =
            typeof log.premiumEntitlement === 'number' && Number.isFinite(log.premiumEntitlement) ?
              formatNumber(log.premiumEntitlement)
            : emptyCellText;
          const chatUsed =
            typeof log.chatUsed === 'number' && Number.isFinite(log.chatUsed) ?
              formatNumber(log.chatUsed)
            : emptyCellText;
          const completionsUsed =
            typeof log.completionsUsed === 'number' && Number.isFinite(log.completionsUsed) ?
              formatNumber(log.completionsUsed)
            : emptyCellText;

          const premiumText = escapeHtml(premiumUsed + ' / ' + premiumEntitlement);
          const chatText = escapeHtml(chatUsed);
          const completionsText = escapeHtml(completionsUsed);

          return '<tr>'
            + '<td>' + createdAt + '</td>'
            + '<td>' + escapeHtml(source) + '</td>'
            + '<td>' + responseType + '</td>'
            + '<td>' + escapeHtml(statusCode) + '</td>'
            + '<td>' + endpoint + '</td>'
            + '<td>' + model + '</td>'
            + '<td>' + multiplier + '</td>'
            + '<td>' + premiumText + '</td>'
            + '<td>' + chatText + '</td>'
            + '<td>' + completionsText + '</td>'
            + '</tr>';
        }).join('');

        html += '</tbody></table></div>';
      }

      const isPrevDisabled = isFetchingUsageLogs || usageLogPageIndex <= 1;
      const isNextDisabled = isFetchingUsageLogs || !usageLogNextCursor;
      const pageSizeSelector = getUsageLogPageSizeSelector();
      html += '<div class="usage-log-pagination">'
        + pageSizeSelector
        + '<button class="btn btn-sm usage-log-page-btn" id="usageLogPrevPageBtn"' + (isPrevDisabled ? ' disabled' : '') + '>' + escapeHtml(t('usage.logPagePrev')) + '</button>'
        + '<span class="usage-log-page-info">' + escapeHtml(t('usage.logPageIndicator', { page: usageLogPageIndex })) + '</span>'
        + '<button class="btn btn-sm usage-log-page-btn" id="usageLogNextPageBtn"' + (isNextDisabled ? ' disabled' : '') + '>' + escapeHtml(t('usage.logPageNext')) + '</button>'
        + '</div>';

      html += '</div>';

      container.innerHTML = html;

      const endpointFilterSelect = document.getElementById('usageLogEndpointFilter');
      if (endpointFilterSelect) {
        endpointFilterSelect.value = usageLogEndpointFilter;
        endpointFilterSelect.addEventListener('change', function () {
          if (isFetchingUsageLogs) {
            return;
          }
          setUsageLogEndpointFilter(endpointFilterSelect.value, true);
          resetUsageLogPagination();
          void fetchUsage(true);
        });
      }

      const pageSizeSelect = document.getElementById('usageLogPageSizeSelect');
      if (pageSizeSelect) {
        pageSizeSelect.value = String(usageLogPageSize);
        pageSizeSelect.addEventListener('change', function () {
          if (isFetchingUsageLogs) {
            return;
          }
          setUsageLogPageSize(pageSizeSelect.value, true);
          resetUsageLogPagination();
          void fetchUsage(true);
        });
      }

      const prevPageBtn = document.getElementById('usageLogPrevPageBtn');
      if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function () {
          if (isFetchingUsageLogs || usageLogPageIndex <= 1) {
            return;
          }
          void fetchUsage({ silent: true, nav: 'prev' });
        });
      }

      const nextPageBtn = document.getElementById('usageLogNextPageBtn');
      if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function () {
          if (isFetchingUsageLogs || !usageLogNextCursor) {
            return;
          }
          void fetchUsage({ silent: true, nav: 'next' });
        });
      }

      updateUsageLogControlsDisabledState();

      const intervalInput = document.getElementById('usageTestIntervalMinutesInput');
      if (!intervalInput) {
        return;
      }

      intervalInput.dataset.savedValue = intervalInputRawValue;
      intervalInput.dataset.editing = '0';

      intervalInput.addEventListener('dblclick', function () {
        startUsageTestIntervalEdit(intervalInput);
      });

      intervalInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          intervalInput.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finishUsageTestIntervalEdit(intervalInput, intervalInput.dataset.savedValue || '');
          intervalInput.blur();
        }
      });

      intervalInput.addEventListener('blur', function () {
        if (intervalInput.dataset.editing !== '1') {
          return;
        }
        void saveUsageTestInterval(intervalInput);
      });
    }

    function showModal(show) {
      document.getElementById('authModal').classList.toggle('active', show);
      if (!show && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (!show) {
        showStep(1);
      }
    }

    function showStep(step) {
      document.getElementById('authStep1').style.display = step === 1 ? 'block' : 'none';
      document.getElementById('authStep2').style.display = step === 2 ? 'block' : 'none';
    }

    async function startAuth() {
      try {
        const res = await fetch(API_BASE + '/auth/device-code', { method: 'POST' });
        const data = await res.json();
        if (data.error) {
          alert(data.error.message);
          return;
        }
        document.getElementById('deviceCode').textContent = data.userCode;
        document.getElementById('verificationLink').href = data.verificationUri;
        showStep(2);
        const accountType = document.getElementById('accountType').value;
        currentInterval = data.interval || 5;
        pollInterval = setInterval(function () { pollAuth(data.deviceCode, accountType); }, currentInterval * 1000);
      } catch (_error) {
        alert(t('auth.failedStart'));
      }
    }

    async function pollAuth(deviceCode, accountType) {
      try {
        const res = await fetch(API_BASE + '/auth/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode, accountType })
        });
        const data = await res.json();
        if (data.success) {
          clearInterval(pollInterval);
          pollInterval = null;
          showModal(false);
          resetUsageLogPagination();
          await Promise.all([fetchAccounts(), fetchStatus()]);
          const activeTab = document.querySelector('.tab.active');
          if (activeTab && activeTab.dataset.tab === 'usage') {
            void fetchUsage(true);
          }
        } else if (data.error) {
          clearInterval(pollInterval);
          pollInterval = null;
          alert(data.error.message);
          showStep(1);
        } else if (data.slowDown && data.interval) {
          clearInterval(pollInterval);
          currentInterval = data.interval;
          pollInterval = setInterval(function () { pollAuth(deviceCode, accountType); }, currentInterval * 1000);
        }
      } catch (_error) {
        // Keep polling quietly
      }
    }

    async function fetchMappings() {
      try {
        const res = await fetch(API_BASE + '/model-mappings');
        const data = await res.json();
        renderMappings(data.modelMapping || {});
      } catch (_error) {
        document.getElementById('mappingList').innerHTML = '<tr><td colspan="3" class="empty-state">' + t('mappings.failedLoad') + '</td></tr>';
      }
    }

    function safeDecodeURIComponent(value) {
      try {
        return decodeURIComponent(value);
      } catch (_error) {
        return value;
      }
    }

    function getCopiedMappingFrom(from, modelMapping) {
      const hasMapping = function (key) {
        return Object.prototype.hasOwnProperty.call(modelMapping, key);
      };

      let candidate = from + '-copy';
      if (!hasMapping(candidate)) {
        return candidate;
      }

      let index = 2;
      while (hasMapping(candidate)) {
        candidate = from + '-copy-' + index;
        index += 1;
      }

      return candidate;
    }

    async function copyMappingEntry(from, to) {
      try {
        const listRes = await fetch(API_BASE + '/model-mappings');
        if (!listRes.ok) {
          alert(t('mappings.copyFailed'));
          return;
        }

        const listData = await listRes.json();
        const modelMapping = listData.modelMapping || {};
        const copiedFrom = getCopiedMappingFrom(from, modelMapping);

        const copyRes = await fetch(API_BASE + '/model-mappings/' + encodeURIComponent(copiedFrom), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to })
        });

        if (!copyRes.ok) {
          alert(t('mappings.copyFailed'));
          return;
        }

        await fetchMappings();
      } catch (_error) {
        alert(t('mappings.copyFailed'));
      }
    }

    function renderMappings(mappings) {
      const tbody = document.getElementById('mappingList');
      const entries = Object.entries(mappings);
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">' + t('mappings.noMappings') + '</td></tr>';
        return;
      }
      tbody.innerHTML = entries.map(function ([from, to]) {
        const safeFrom = escapeHtml(from);
        const safeTo = escapeHtml(to);
        const encodedFrom = encodeURIComponent(from);
        const encodedTo = encodeURIComponent(to);

        return '<tr class="mapping-row">'
          + '<td class="mapping-cell"><span class="mapping-model-pill mapping-model-from">' + safeFrom + '</span></td>'
          + '<td class="mapping-cell mapping-cell-to"><span class="mapping-model-pill mapping-model-to">' + safeTo + '</span></td>'
          + '<td class="mapping-cell mapping-cell-action"><span class="mapping-action-group"><button class="btn btn-sm mapping-copy-btn" data-mapping-from="' + encodedFrom + '" data-mapping-to="' + encodedTo + '">' + t('common.copy') + '</button><button class="btn btn-danger btn-sm mapping-delete-btn" data-mapping-from="' + encodedFrom + '">' + t('common.delete') + '</button></span></td>'
          + '</tr>';
      }).join('');
    }

    async function deleteMapping(from) {
      const shouldDelete = await openConfirmActionModal({
        title: t('common.delete'),
        message: t('mappings.deleteConfirm', { from }),
        confirmText: t('common.delete'),
        tone: 'danger'
      });
      if (!shouldDelete) return;

      try {
        const res = await fetch(API_BASE + '/model-mappings/' + encodeURIComponent(from), { method: 'DELETE' });
        if (res.ok) {
          fetchMappings();
        } else {
          const d = await res.json();
          alert(d.error?.message || t('mappings.failedDelete'));
        }
      } catch (_error) {
        alert(t('mappings.failedDelete'));
      }
    }

    window.deleteMapping = deleteMapping;

    async function loadModelOptions() {
      const sel = document.getElementById('mappingTo');
      try {
        const res = await fetch(API_BASE + '/models');
        const data = await res.json();
        sel.innerHTML = '<option value="">' + t('mappings.selectTargetModel') + '</option>' +
          (data.data || []).map(function (m) { return '<option value="' + m.id + '">' + m.id + '</option>'; }).join('');
      } catch (_error) {
        sel.innerHTML = '<option value="">' + t('mappings.failedLoadModels') + '</option>';
      }
    }

    document.getElementById('addAccountBtn').addEventListener('click', function () { showModal(true); });
    document.getElementById('cancelAuth').addEventListener('click', function () { showModal(false); });
    document.getElementById('cancelAuth2').addEventListener('click', function () { showModal(false); });
    document.getElementById('startAuth').addEventListener('click', startAuth);
    document.getElementById('confirmActionCancelBtn').addEventListener('click', function () {
      closeConfirmActionModal(false);
    });
    document.getElementById('confirmActionConfirmBtn').addEventListener('click', function () {
      closeConfirmActionModal(true);
    });
    document.getElementById('confirmActionModal').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) {
        closeConfirmActionModal(false);
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isConfirmActionModalOpen()) {
        closeConfirmActionModal(false);
      }
    });
    document.getElementById('accountList').addEventListener('dragstart', handleAccountListDragStart);
    document.getElementById('accountList').addEventListener('dragover', handleAccountListDragOver);
    document.getElementById('accountList').addEventListener('drop', handleAccountListDrop);
    document.getElementById('accountList').addEventListener('dragend', handleAccountListDragEnd);
    document.getElementById('refreshModels').addEventListener('click', fetchModels);
    document.getElementById('toggleModelManageBtn').addEventListener('click', function () {
      isModelManageMode = !isModelManageMode;
      updateModelManageButton();
      rerenderModelsFromCache();
    });
    document.getElementById('modelVisibilityToggle').addEventListener('click', function () {
      const nextFilter = modelVisibilityFilter === 'hidden' ? 'visible' : 'hidden';
      setModelVisibilityFilter(nextFilter, true);
      rerenderModelsFromCache();
    });
    document.getElementById('refreshUsage').addEventListener('click', fetchUsage);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('rateLimitSeconds').addEventListener('input', updateSettingsDirtyState);
    document.getElementById('rateLimitWait').addEventListener('change', updateSettingsDirtyState);
    document.getElementById('anthropicApiKey').addEventListener('input', updateSettingsDirtyState);
    document.getElementById('gatewayApiKey').addEventListener('input', updateSettingsDirtyState);
    document.getElementById('clearAnthropicApiKeyBtn').addEventListener('click', function () {
      void clearAnthropicApiKey();
    });
    document.getElementById('clearGatewayApiKeyBtn').addEventListener('click', function () {
      void clearGatewayApiKey();
    });

    document.getElementById('addMappingBtn').addEventListener('click', function () {
      document.getElementById('mappingFormArea').classList.add('active');
      document.getElementById('mappingFrom').value = '';
      loadModelOptions();
      document.getElementById('mappingFrom').focus();
    });

    document.getElementById('cancelMappingBtn').addEventListener('click', function () {
      document.getElementById('mappingFormArea').classList.remove('active');
    });

    document.getElementById('saveMappingBtn').addEventListener('click', async function () {
      const from = document.getElementById('mappingFrom').value.trim();
      const to = document.getElementById('mappingTo').value.trim();
      if (!from || !to) {
        alert(t('mappings.bothRequired'));
        return;
      }
      try {
        const res = await fetch(API_BASE + '/model-mappings/' + encodeURIComponent(from), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to })
        });
        if (res.ok) {
          document.getElementById('mappingFormArea').classList.remove('active');
          fetchMappings();
        } else {
          const d = await res.json();
          alert(d.error?.message || t('mappings.failedSave'));
        }
      } catch (_error) {
        alert(t('mappings.failedSave'));
      }
    });

    document.getElementById('mappingList').addEventListener('click', function (event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const copyButton = target.closest('.mapping-copy-btn');
      if (copyButton) {
        const encodedFrom = copyButton.dataset.mappingFrom || '';
        const encodedTo = copyButton.dataset.mappingTo || '';
        void copyMappingEntry(
          safeDecodeURIComponent(encodedFrom),
          safeDecodeURIComponent(encodedTo),
        );
        return;
      }

      const deleteButton = target.closest('.mapping-delete-btn');
      if (deleteButton) {
        const encodedFrom = deleteButton.dataset.mappingFrom || '';
        void deleteMapping(safeDecodeURIComponent(encodedFrom));
      }
    });

    document.getElementById('languageSelect').addEventListener('change', function (event) {
      setLocale(event.target.value, true);
    });

    collapsedProviders = loadCollapsedProviders();
    setModelVisibilityFilter(localStorage.getItem(MODELS_VISIBILITY_FILTER_STORAGE_KEY), false);
    setUsageLogEndpointFilter(localStorage.getItem(USAGE_LOG_ENDPOINT_FILTER_STORAGE_KEY), false);
    setUsageLogPageSize(localStorage.getItem(USAGE_LOG_PAGE_SIZE_STORAGE_KEY), false);
    resetUsageLogPagination();

    applyI18n();
    restoreActiveTab();
    fetchAccounts();
    fetchStatus();
  </script>`
