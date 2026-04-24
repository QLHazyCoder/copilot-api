import type {
  AuthPageLocale,
  AuthSecretSource,
  AuthSetupMode,
} from "./auth-page-i18n"

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

export function renderAdminSetupHtml(options: {
  locale: AuthPageLocale
  mode: AuthSetupMode
  sessionTtlDays: number
  secretSource: AuthSecretSource
}): string {
  const messages = getAuthPageMessages(options.locale)
  const showForm = options.mode !== "readonly"
  const title = messages[`setup.title.${options.mode}`]
  const description = messages[`setup.description.${options.mode}`]
  const submitLabel = messages[`setup.submit.${options.mode}`] ?? ""
  const sourceText = messages[`setup.source.${options.secretSource}`]

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.locale)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(messages["setup.pageTitle"])}</title>
    <style>
      :root {
        --bg-canvas: #0b1118;
        --panel: rgba(18, 30, 43, 0.96);
        --border: #2a3f56;
        --border-strong: #3f6083;
        --text: #dbe7f5;
        --muted: #9ab0c8;
        --accent: #25b39e;
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
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(37, 179, 158, 0.16), transparent 32%),
          radial-gradient(circle at bottom right, rgba(104, 168, 255, 0.12), transparent 34%),
          linear-gradient(160deg, var(--bg-canvas), #13202f);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(520px, 100%);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow: hidden;
        background: linear-gradient(180deg, rgba(27, 42, 59, 0.96), var(--panel));
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      }
      .header {
        padding: 28px 28px 18px;
        border-bottom: 1px solid rgba(42, 63, 86, 0.72);
      }
      .header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(63, 96, 131, 0.72);
        background: rgba(17, 27, 39, 0.78);
        color: var(--muted);
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
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(11, 19, 28, 0.82);
        color: var(--text);
      }
      h1 {
        margin: 14px 0 10px;
        font-size: 28px;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .body {
        padding: 24px 28px 28px;
        display: grid;
        gap: 18px;
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
        color: var(--text);
      }
      form {
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 8px;
        font-size: 14px;
      }
      input {
        width: 100%;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: rgba(11, 19, 28, 0.82);
        color: var(--text);
        font: inherit;
      }
      input:focus {
        outline: none;
        border-color: var(--border-strong);
        box-shadow: 0 0 0 4px rgba(37, 179, 158, 0.12);
      }
      button,
      a.button-link {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        padding: 12px 16px;
        border-radius: var(--radius-sm);
        border: none;
        background: linear-gradient(180deg, #2bc4ae, var(--accent));
        color: #fff;
        text-decoration: none;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .error {
        display: none;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(240, 107, 107, 0.45);
        background: rgba(107, 33, 33, 0.22);
        color: #ffd0d0;
        font-size: 14px;
      }
      .error.active {
        display: block;
      }
      .hint {
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <section class="header">
        <div class="header-top">
          <span class="badge" id="pageBadge">${escapeHtml(messages["setup.badge"])}</span>
          <div class="language-box">
            <label for="languageSelect" id="languageLabel">${escapeHtml(messages["language.label"])}</label>
            <select id="languageSelect" aria-labelledby="languageLabel">
              <option id="languageOptionEn" value="en">${escapeHtml(messages["language.en"])}</option>
              <option id="languageOptionZh" value="zh-CN">${escapeHtml(messages["language.zhCN"])}</option>
            </select>
          </div>
        </div>
        <h1 id="pageTitleText">${escapeHtml(title)}</h1>
        <p id="pageDescription">${escapeHtml(description)}</p>
      </section>
      <section class="body">
        <div class="meta">
          <p><strong id="secretSourceLabel">${escapeHtml(messages["setup.secretSource"])}</strong>: <span id="secretSourceValue">${escapeHtml(sourceText)}</span></p>
        </div>
        <div class="error" id="errorBox" role="alert"></div>
        ${showForm ?
          `<form id="setupForm">
            <label for="adminSecret">
              <span id="secretLabel">${escapeHtml(messages["common.managementSecret"])}</span>
              <input id="adminSecret" name="adminSecret" type="password" autocomplete="new-password" required>
            </label>
            <label for="adminSecretConfirm">
              <span id="confirmSecretLabel">${escapeHtml(messages["setup.confirmManagementSecret"])}</span>
              <input id="adminSecretConfirm" name="adminSecretConfirm" type="password" autocomplete="new-password" required>
            </label>
            <p class="hint" id="setupHint">${escapeHtml(messages["setup.hint"])}</p>
            <button id="submitButton" type="submit"><span id="submitButtonText">${escapeHtml(submitLabel)}</span></button>
          </form>`
        : `<a class="button-link" href="/admin"><span id="backToAdminButtonText">${escapeHtml(messages["setup.backToAdmin"])}</span></a>`}
      </section>
    </main>
    ${renderAuthPageLocaleScript({
      initialLocale: options.locale,
      mode: options.mode,
      page: "setup",
      requiresHttps: false,
      secretSource: options.secretSource,
      sessionTtlDays: options.sessionTtlDays,
      showForm,
    })}
    <script>
      const localeApi = window.__authPageLocale;
      const form = document.getElementById("setupForm");
      const errorBox = document.getElementById("errorBox");
      const submitButton = document.getElementById("submitButton");
      const secretInput = document.getElementById("adminSecret");
      const confirmInput = document.getElementById("adminSecretConfirm");

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

      if (form) {
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          clearError();

          const secret = secretInput.value.trim();
          const confirmSecret = confirmInput.value.trim();

          if (!secret) {
            showError(t("setup.error.required"));
            secretInput.focus();
            return;
          }

          if (secret.length < 8) {
            showError(t("setup.error.minLength"));
            secretInput.focus();
            return;
          }

          if (secret !== confirmSecret) {
            showError(t("setup.error.confirmMismatch"));
            confirmInput.focus();
            return;
          }

          submitButton.disabled = true;
          try {
            const response = await fetch("/admin/api/setup", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ secret, confirmSecret })
            });

            const payload = await response.json().catch(function () {
              return {};
            });

            if (!response.ok) {
              showError(payload.error?.message || t("setup.error.failed"));
              return;
            }

            window.location.href = "/admin";
          } catch (_error) {
            showError(t("setup.error.failed"));
          } finally {
            submitButton.disabled = false;
          }
        });

        secretInput.focus();
      }
    </script>
  </body>
</html>`
}
