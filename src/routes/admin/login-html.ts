import type { AuthPageLocale } from "./auth-page-i18n"

import {
  getAuthPageMessages,
  renderAuthPageLocaleScript,
} from "./auth-page-i18n"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function renderAdminLoginHtml(options: {
  locale: AuthPageLocale
  sessionTtlDays: number
  requiresHttps: boolean
}): string {
  const messages = getAuthPageMessages(options.locale)
  const requiresHttpsNote =
    options.requiresHttps ?
      `<p class="hint" id="httpsNote">${escapeHtml(messages["common.requiresHttpsNote"])}</p>`
    : `<p class="hint" id="httpsNote" style="display:none"></p>`

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.locale)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(messages["login.pageTitle"])}</title>
    <style>
      :root {
        --bg-canvas: #0b1118;
        --bg-surface: #162231;
        --bg-panel: rgba(18, 30, 43, 0.96);
        --border-default: #2a3f56;
        --border-strong: #3f6083;
        --text-primary: #dbe7f5;
        --text-secondary: #9ab0c8;
        --accent: #25b39e;
        --accent-soft: rgba(37, 179, 158, 0.2);
        --danger: #f06b6b;
        --radius-md: 16px;
        --radius-sm: 10px;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--text-primary);
        background:
          radial-gradient(circle at 0% 0%, rgba(37, 179, 158, 0.16), transparent 32%),
          radial-gradient(circle at 100% 100%, rgba(104, 168, 255, 0.12), transparent 34%),
          linear-gradient(160deg, var(--bg-canvas), #13202f);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(420px, 100%);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(27, 42, 59, 0.96), var(--bg-panel));
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
        overflow: hidden;
      }
      .panel-header {
        padding: 28px 28px 18px;
        border-bottom: 1px solid rgba(42, 63, 86, 0.72);
      }
      .header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(63, 96, 131, 0.72);
        background: rgba(17, 27, 39, 0.78);
        color: var(--text-secondary);
        font-size: 12px;
      }
      .language-box {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--text-secondary);
        font-size: 12px;
      }
      .language-box select {
        min-width: 120px;
        padding: 6px 8px;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: rgba(11, 19, 28, 0.82);
        color: var(--text-primary);
      }
      h1 {
        margin: 14px 0 10px;
        font-size: 28px;
        line-height: 1.15;
      }
      p {
        margin: 0;
        color: var(--text-secondary);
        line-height: 1.6;
      }
      .panel-body {
        padding: 24px 28px 28px;
        display: grid;
        gap: 18px;
      }
      label {
        display: grid;
        gap: 8px;
        font-size: 14px;
      }
      input {
        width: 100%;
        padding: 12px 14px;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-sm);
        background: rgba(11, 19, 28, 0.82);
        color: var(--text-primary);
        font: inherit;
      }
      input:focus {
        outline: none;
        border-color: var(--border-strong);
        box-shadow: 0 0 0 4px rgba(37, 179, 158, 0.12);
      }
      button {
        width: 100%;
        padding: 12px 16px;
        border: none;
        border-radius: var(--radius-sm);
        background: linear-gradient(180deg, #2bc4ae, var(--accent));
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .meta {
        display: grid;
        gap: 8px;
        padding: 14px;
        border: 1px solid rgba(42, 63, 86, 0.72);
        border-radius: var(--radius-sm);
        background: rgba(17, 27, 39, 0.68);
      }
      .meta strong {
        color: var(--text-primary);
      }
      .hint {
        font-size: 13px;
      }
      .error {
        display: none;
        padding: 12px 14px;
        border: 1px solid rgba(240, 107, 107, 0.45);
        border-radius: var(--radius-sm);
        background: rgba(107, 33, 33, 0.22);
        color: #ffd0d0;
        font-size: 14px;
      }
      .error.active {
        display: block;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <section class="panel-header">
        <div class="header-top">
          <span class="eyebrow" id="pageBadge">${escapeHtml(messages["login.badge"])}</span>
          <div class="language-box">
            <label for="languageSelect" id="languageLabel">${escapeHtml(messages["language.label"])}</label>
            <select id="languageSelect" aria-labelledby="languageLabel">
              <option id="languageOptionEn" value="en">${escapeHtml(messages["language.en"])}</option>
              <option id="languageOptionZh" value="zh-CN">${escapeHtml(messages["language.zhCN"])}</option>
            </select>
          </div>
        </div>
        <h1 id="pageTitleText">${escapeHtml(messages["login.title"])}</h1>
        <p id="pageDescription">${escapeHtml(messages["login.description"])}</p>
      </section>
      <section class="panel-body">
        <div class="meta">
          <p><strong id="scopeLabel">${escapeHtml(messages["login.scope"])}</strong>: <span id="scopeValue">${escapeHtml(messages["login.scopeValue"])}</span></p>
        </div>
        ${requiresHttpsNote}
        <div class="error" id="errorBox" role="alert"></div>
        <form id="loginForm">
          <label for="adminSecret">
            <span id="secretLabel">${escapeHtml(messages["common.managementSecret"])}</span>
            <input id="adminSecret" name="adminSecret" type="password" autocomplete="current-password" required>
          </label>
          <button id="submitButton" type="submit"><span id="submitButtonText">${escapeHtml(messages["login.submit"])}</span></button>
        </form>
      </section>
    </main>
    ${renderAuthPageLocaleScript({
      initialLocale: options.locale,
      page: "login",
      requiresHttps: options.requiresHttps,
      sessionTtlDays: options.sessionTtlDays,
    })}
    <script>
      const localeApi = window.__authPageLocale;
      const form = document.getElementById("loginForm");
      const input = document.getElementById("adminSecret");
      const errorBox = document.getElementById("errorBox");
      const submitButton = document.getElementById("submitButton");

      function t(key, vars) {
        return localeApi.t(key, vars);
      }

      function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.add("active");
      }

      function clearError() {
        errorBox.textContent = "";
        errorBox.classList.remove("active");
      }

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearError();

        const secret = input.value.trim();
        if (!secret) {
          showError(t("login.error.required"));
          input.focus();
          return;
        }

        submitButton.disabled = true;
        try {
          const response = await fetch("/admin/api/session/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ secret })
          });

          const payload = await response.json().catch(function () {
            return {};
          });

          if (!response.ok) {
            if (response.status === 401) {
              showError(t("login.error.invalid"));
            } else if (response.status === 429) {
              showError(t("login.error.rateLimited"));
            } else {
              showError(payload.error?.message || t("login.error.failed"));
            }
            return;
          }

          window.location.href = "/admin";
        } catch (_error) {
          showError(t("login.error.failed"));
        } finally {
          submitButton.disabled = false;
        }
      });

      input.focus();
    </script>
  </body>
</html>`
}
