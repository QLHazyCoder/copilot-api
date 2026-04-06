import { adminScript } from "./script"

/* eslint-disable max-lines */
export const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Copilot API - Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg-canvas: #0b1118;
      --bg-canvas-soft: #13202f;
      --bg-surface: #162231;
      --bg-surface-soft: #1b2a3b;
      --bg-panel: #111b27;
      --border-default: #2a3f56;
      --border-strong: #3f6083;
      --text-primary: #dbe7f5;
      --text-secondary: #9ab0c8;
      --accent: #1f9d8b;
      --accent-strong: #25b39e;
      --danger: #df5555;
      --danger-strong: #f06b6b;
      --warning: #d4a53b;
      --info: #68a8ff;
      --radius-sm: 8px;
      --radius-md: 12px;
      --shadow-soft: 0 12px 28px rgba(0, 0, 0, 0.24);
      --shadow-inner: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background:
        radial-gradient(circle at 0% 0%, rgba(31, 157, 139, 0.14), transparent 34%),
        radial-gradient(circle at 100% 100%, rgba(104, 168, 255, 0.12), transparent 36%),
        linear-gradient(160deg, var(--bg-canvas), var(--bg-canvas-soft));
      color: var(--text-primary);
      min-height: 100vh;
      padding: 1rem;
      overflow: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    body::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    .container {
      width: 100%;
      min-height: calc(100vh - 2rem);
    }
    .app-layout {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 1rem;
      min-height: 100%;
      align-items: start;
    }
    .sidebar {
      background: linear-gradient(180deg, var(--bg-surface), var(--bg-panel));
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      box-shadow: var(--shadow-soft), var(--shadow-inner);
    }
    .main-content { min-width: 0; }
    .sidebar-profile {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 1.5rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: rgba(10, 19, 28, 0.78);
    }
    .sidebar-avatar-wrap {
      width: 42px;
      height: 42px;
      flex: 0 0 42px;
      position: relative;
    }
    .sidebar-avatar,
    .sidebar-avatar-fallback {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }
    .sidebar-avatar {
      display: none;
      object-fit: cover;
      border: 1px solid var(--border-strong);
    }
    .sidebar-avatar-fallback {
      display: grid;
      place-items: center;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-primary);
      background: linear-gradient(135deg, rgba(31, 157, 139, 0.42), rgba(104, 168, 255, 0.38));
    }
    .sidebar-profile-text {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
    }
    .sidebar-login {
      max-width: 100%;
      color: var(--text-primary);
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-type {
      margin-top: 0.15rem;
      max-width: 100%;
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: capitalize;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card {
      background: linear-gradient(180deg, rgba(27, 42, 59, 0.96), rgba(18, 30, 43, 0.96));
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 0.6rem 1rem 0.6rem;
      margin-bottom: 0;
      height: 760px;
      overflow: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
      box-shadow: var(--shadow-inner);
    }
    .card::-webkit-scrollbar { display: none; }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .card-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
    .models-card-header {
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .models-header-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      margin-left: auto;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .models-action-btn {
      width: 70px;
      justify-content: center;
    }
    .models-action-icon {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 14px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: linear-gradient(180deg, rgba(23, 35, 49, 0.95), rgba(17, 27, 39, 0.95));
      color: var(--text-primary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.16s ease;
    }
    .btn:hover { background: linear-gradient(180deg, rgba(33, 50, 70, 0.96), rgba(24, 36, 51, 0.96)); border-color: var(--border-strong); }
    .btn-primary { background: linear-gradient(180deg, var(--accent-strong), var(--accent)); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { background: linear-gradient(180deg, #2bc4ae, var(--accent-strong)); }
    .btn-danger { background: linear-gradient(180deg, var(--danger-strong), var(--danger)); border-color: var(--danger); color: #fff; }
    .btn-danger:hover { background: linear-gradient(180deg, #ff7878, var(--danger-strong)); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .tabs {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0;
      border-bottom: none;
      padding-bottom: 0;
      padding-top: 0.25rem;
    }
    .tab {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.875rem;
      border-radius: 8px;
      width: 100%;
      text-align: left;
      transition: all 0.15s;
    }
    .tab:hover { color: var(--text-primary); background: rgba(41, 62, 86, 0.75); }
    .tab.active {
      color: var(--text-primary);
      background: linear-gradient(90deg, rgba(31, 157, 139, 0.24), rgba(31, 157, 139, 0.08));
      border-left: 3px solid var(--accent);
      border-bottom: none;
      padding-left: calc(1rem - 3px);
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .account-list { list-style: none; }
    .account-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      margin-bottom: 0.5rem;
      background: rgba(12, 21, 31, 0.72);
      border: 1px solid var(--border-default);
      transition: all 0.16s ease;
    }
    .account-item:hover { border-color: var(--border-strong); transform: translateY(-1px); }
    .account-item.active { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(31, 157, 139, 0.3); }
    .account-item.drag-source,
    .account-item.drag-source:hover {
      opacity: 0.72;
      transform: none;
      border-style: dashed;
    }
    .account-item.drag-target-before { box-shadow: inset 0 3px 0 var(--accent); }
    .account-item.drag-target-after { box-shadow: inset 0 -3px 0 var(--accent); }
    .account-drag-handle {
      width: 40px;
      height: 40px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      cursor: grab;
      user-select: none;
    }
    .account-drag-handle.dragging,
    .account-drag-handle:active { cursor: grabbing; }
    .account-drag-handle.disabled { cursor: default; }
    .account-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--border-default); }
    .account-info { flex: 0 0 auto; width: fit-content; max-width: 100%; }
    .account-name { font-weight: 600; }
    .account-type { font-size: 0.75rem; color: var(--text-secondary); text-transform: capitalize; }
    .account-usage {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      margin-left: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
    }
    .account-usage-bars { display: flex; align-items: center; justify-content: center; gap: 1.25rem; width: fit-content; min-width: 0; margin: 0 auto; }
    .account-usage-row { width: 320px; display: grid; grid-template-columns: 82px 1fr 94px; align-items: center; gap: 0.58rem; }
    .account-usage-type { font-size: 1rem; color: var(--text-primary); font-weight: 600; text-align: right; }
    .account-usage-track { height: 7.5px; border-radius: 9999px; background: rgba(98, 118, 143, 0.34); overflow: hidden; }
    .account-usage-fill {
      --usage: 0;
      height: 100%;
      width: calc(var(--usage) * 1%);
      border-radius: inherit;
      background: var(--accent);
      transition: width 0.25s ease;
    }
    .account-usage-fill.premium { background: #1f9d8b; }
    .account-usage-fill.chat { background: #58a6ff; }
    .account-usage-fill.completions { background: #a371f7; }
    .account-usage-value { font-size: 1rem; color: var(--text-primary); font-weight: 600; text-align: left; white-space: nowrap; }
    .account-usage-error { font-size: 0.78rem; color: var(--danger); font-weight: 600; text-align: left; }
    .account-actions { margin-left: auto; display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-secondary); }
    .model-groups {
      grid-column: 1 / -1;
      width: 100%;
      display: grid;
      gap: 1rem;
    }
    .provider-group {
      display: grid;
      gap: 0.75rem;
    }
    .provider-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: linear-gradient(180deg, rgba(19, 32, 47, 0.96), rgba(16, 27, 39, 0.96));
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
      --provider-color: #7f93ab;
    }
    .provider-group-title-wrap {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .provider-group-title-wrap::before {
      content: '';
      width: 6px;
      height: 18px;
      border-radius: 999px;
      background: var(--provider-color);
      box-shadow: 0 0 12px color-mix(in srgb, var(--provider-color) 52%, transparent);
      flex: 0 0 6px;
    }
    .provider-group-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
    }
    .provider-group-count {
      font-size: 0.74rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .provider-group-stats {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .provider-toggle-btn {
      padding: 0.18rem 0.46rem;
      border: 1px solid var(--border-default);
      border-radius: 9999px;
      background: rgba(17, 30, 43, 0.86);
      color: var(--text-secondary);
      font-size: 0.72rem;
      line-height: 1;
      cursor: pointer;
    }
    .provider-toggle-btn:hover {
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    .provider-models-collapsed { display: none !important; }
    .provider-stat {
      font-size: 0.72rem;
      line-height: 1;
      border-radius: 9999px;
      padding: 0.24rem 0.46rem;
      border: 1px solid var(--border-default);
      background: rgba(17, 30, 43, 0.86);
      color: var(--text-secondary);
    }
    .provider-stat-premium {
      color: #f4e7ff;
      border-color: rgba(200, 165, 255, 0.5);
      background: rgba(145, 81, 255, 0.26);
    }
    .provider-openai .provider-group-header { --provider-color: #5aa7ff; }
    .provider-claude .provider-group-header { --provider-color: #f0b36a; }
    .provider-google .provider-group-header { --provider-color: #63c588; }
    .provider-grok .provider-group-header { --provider-color: #b28aff; }
    .provider-other .provider-group-header { --provider-color: #7f93ab; }
    .models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
    .model-card { background: rgba(12, 21, 31, 0.72); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 0.75rem; transition: all 0.15s; }
    .model-card:hover { border-color: var(--info); transform: translateY(-1px); }
    .model-card.hidden-model {
      border-style: dashed;
      border-color: rgba(122, 153, 186, 0.72);
      background: rgba(11, 19, 28, 0.72);
    }
    .model-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .model-name { flex: 1; min-width: 0; font-weight: 600; font-size: 0.94rem; color: var(--info); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .model-reasoning-wrap {
      display: inline-flex;
      align-items: center;
    }
    .model-reasoning-select {
      width: 58px;
      min-width: 58px;
      border: 1px solid rgba(63, 96, 131, 0.78);
      border-radius: 6px;
      background: rgba(20, 33, 46, 0.95);
      color: var(--text-primary);
      font-size: 0.72rem;
      line-height: 1.2;
      text-align: center;
      text-align-last: center;
      padding: 0.12rem 0.2rem;
    }
    .model-reasoning-select:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .model-right { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
    .model-visibility-action-btn {
      padding: 0.14rem 0.44rem;
      border: 1px solid rgba(239, 100, 100, 0.62);
      border-radius: 9999px;
      background: rgba(116, 37, 37, 0.34);
      color: #ffc5c5;
      font-size: 0.68rem;
      line-height: 1;
      cursor: pointer;
    }
    .model-visibility-action-btn:hover {
      border-color: rgba(255, 137, 137, 0.88);
      background: rgba(145, 44, 44, 0.42);
    }
    .model-visibility-action-btn.show {
      border-color: rgba(37, 179, 158, 0.6);
      background: rgba(25, 89, 80, 0.4);
      color: #b9f3ea;
    }
    .model-visibility-action-btn.show:hover {
      border-color: rgba(74, 219, 196, 0.88);
      background: rgba(29, 106, 95, 0.48);
    }
    .model-premium-badge { font-size: 0.7rem; line-height: 1; border-radius: 9999px; padding: 0.18rem 0.45rem; color: #f4e7ff; background: rgba(145, 81, 255, 0.9); border: 1px solid rgba(200, 165, 255, 0.85); }
    .model-multiplier { font-weight: 600; font-size: 0.875rem; white-space: nowrap; cursor: text; user-select: none; }
    .model-multiplier.paid { color: #f3d179; }
    .model-multiplier.free { color: var(--text-secondary); }
    .model-multiplier.editing { cursor: text; }
    .model-multiplier-input { width: 78px; padding: 0.2rem 0.35rem; border: 1px solid var(--border-strong); border-radius: 6px; background: rgba(20, 33, 46, 0.95); color: var(--text-primary); font-size: 0.875rem; font-weight: 600; }
    .model-meta { margin-top: 0.55rem; display: grid; gap: 0.25rem; font-size: 0.75rem; color: var(--text-secondary); }
    .model-meta-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
    }
    .model-meta-group { display: inline-flex; align-items: baseline; gap: 0.35rem; min-width: 0; }
    .model-meta-group-left { justify-self: start; }
    .model-meta-group-center {
      justify-self: center;
      align-items: center;
      gap: 0.45rem;
    }
    .model-meta-group-right {
      justify-self: end;
      margin-left: 0;
    }
    .model-meta-label { color: #7fa3c7; white-space: nowrap; }
    .model-meta-value { color: var(--text-secondary); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .usage-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .usage-card { background: rgba(12, 21, 31, 0.72); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .usage-title { font-weight: 600; text-transform: capitalize; }
    .usage-percent { font-size: 0.875rem; color: var(--text-secondary); }
    .usage-bar { height: 8px; background: rgba(40, 56, 76, 0.65); border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem; }
    .usage-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .usage-bar-fill.green { background: var(--accent); }
    .usage-bar-fill.yellow { background: var(--warning); }
    .usage-bar-fill.red { background: var(--danger); }
    .usage-bar-fill.blue { background: var(--info); }
    .usage-stats { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); }
    .usage-info { margin-top: 1rem; padding: 0.75rem; background: rgba(20, 33, 46, 0.78); border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 0.875rem; }
    .usage-summary-card {
      display: grid;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 0.2rem;
      padding: 0.7rem;
    }
    .usage-summary-card .usage-info-row { padding: 0.16rem 0; font-size: 0.9rem; align-items: center; }
    .usage-summary-card .usage-info-label { font-size: 0.9rem; }
    .usage-summary-card .usage-summary-input { font-size: 0.9rem; }
    .usage-info-row { display: flex; justify-content: space-between; padding: 0.25rem 0; gap: 0.75rem; }
    .usage-info-label { color: var(--text-secondary); }
    .usage-info-control { display: inline-flex; align-items: center; margin-left: auto; }
    .usage-summary-input {
      width: 76px;
      padding: 0.2rem 0.35rem;
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      background: rgba(20, 33, 46, 0.95);
      color: var(--text-primary);
      font-size: 0.76rem;
      text-align: center;
      cursor: default;
      user-select: none;
    }
    .usage-summary-input.editing {
      text-align: left;
      cursor: text;
      user-select: text;
    }
    .usage-log-card {
      margin-top: 1rem;
      background: rgba(12, 21, 31, 0.72);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 0 0.9rem;
      height: 560px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .usage-log-table-wrap {
      overflow: auto;
      min-height: 0;
      flex: 1;
      border-bottom: 1px solid var(--border-default);
      margin-bottom: -1px;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .usage-log-table-wrap::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    .usage-log-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    .usage-log-table th,
    .usage-log-table td {
      padding: 0.5rem 0.55rem;
      border-bottom: 1px solid rgba(42, 63, 86, 0.6);
      text-align: center;
      white-space: nowrap;
    }
    .usage-log-table th {
      color: var(--text-secondary);
      font-weight: 600;
      background: rgba(20, 33, 46, 0.55);
    }
    .usage-log-source-head {
      white-space: nowrap;
    }
    .usage-log-source-text {
      margin-right: 0.25rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .usage-log-source-filter {
      width: auto;
      min-width: 58px;
      max-width: 74px;
      margin: 0;
      padding: 0.1rem 0.2rem;
      border: 1px solid rgba(63, 96, 131, 0.7);
      border-radius: 4px;
      background: rgba(20, 33, 46, 0.95);
      color: var(--text-primary);
      font-size: 0.7rem;
      line-height: 1.15;
    }
    .usage-log-source-filter:focus {
      outline: none;
      border-color: var(--info);
    }
    .usage-log-toolbar {
      display: flex;
      justify-content: flex-end;
      padding: 0.55rem 0 0.35rem;
    }
    .usage-response-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 46px;
      padding: 0.12rem 0.48rem;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 600;
      line-height: 1.25;
      border: 1px solid transparent;
      background: rgba(73, 97, 126, 0.16);
      color: var(--text-secondary);
    }
    .usage-response-badge.streaming {
      background: rgba(72, 146, 255, 0.14);
      border-color: rgba(72, 146, 255, 0.35);
      color: #6db5ff;
    }
    .usage-response-badge.non-streaming {
      background: rgba(137, 154, 178, 0.12);
      border-color: rgba(137, 154, 178, 0.3);
      color: #c2cede;
    }
    .usage-log-table tr:last-child td { border-bottom: none; }
    .usage-log-pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 0.55rem 0 0.65rem;
    }
    .usage-log-page-info {
      min-width: 82px;
      text-align: center;
      font-size: 0.76rem;
      color: var(--text-secondary);
    }
    .usage-log-page-btn {
      min-width: 72px;
      justify-content: center;
    }
    .usage-log-page-size-wrap {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--text-secondary);
      font-size: 0.76rem;
      margin-right: 0.2rem;
    }
    .usage-log-page-size-label {
      white-space: nowrap;
    }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: none; align-items: center; justify-content: center; z-index: 100; }
    .modal-overlay.active { display: flex; }
    .modal { background: linear-gradient(180deg, var(--bg-surface), var(--bg-panel)); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 1.5rem; max-width: 400px; width: 100%; box-shadow: var(--shadow-soft); }
    .modal-title { font-size: 1.25rem; margin-bottom: 1rem; }
    .device-code { font-family: monospace; font-size: 2rem; text-align: center; padding: 1rem; background: rgba(12, 21, 31, 0.88); border: 1px solid var(--border-default); border-radius: var(--radius-sm); margin: 1rem 0; letter-spacing: 0.25rem; }
    .modal-text { color: var(--text-secondary); margin-bottom: 1rem; text-align: center; }
    .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border-default); border-top-color: var(--text-primary); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .select { padding: 0.5rem; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: rgba(20, 33, 46, 0.9); color: var(--text-primary); font-size: 0.875rem; margin-bottom: 1rem; width: 100%; }
    .label { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem; display: block; }
    .status-bar { display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.65rem; background: rgba(10, 19, 28, 0.78); border: 1px solid var(--border-default); border-radius: var(--radius-sm); margin-bottom: 0; font-size: 0.78rem; color: var(--text-secondary); }
    .sidebar-language {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      padding: 0.4rem 0.65rem;
      background: rgba(10, 19, 28, 0.78);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
    }
    .sidebar-language-label {
      margin: 0;
      display: inline-flex;
      align-items: center;
      font-size: 0.78rem;
      white-space: nowrap;
      color: var(--text-secondary);
    }
    .sidebar-language-select {
      margin: 0;
      width: auto;
      min-width: 126px;
      padding: 0.32rem 0.5rem;
      font-size: 0.78rem;
      flex: 0 0 auto;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
    .status-dot.online { background: var(--accent); }
    .refresh-btn { margin-left: auto; }
    .refresh-btn.loading svg { animation: spin 1s linear infinite; }
    .form-grid { display: grid; gap: 0.85rem; }
    .settings-header-main {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
    }
    .settings-subtitle {
      margin: 0;
      font-size: 0.76rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }
    .settings-save-wrap {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      margin-left: auto;
    }
    .settings-dirty-indicator {
      font-size: 0.72rem;
      color: #f3d179;
      padding: 0.1rem 0.45rem;
      border: 1px solid rgba(212, 165, 59, 0.45);
      border-radius: 999px;
      background: rgba(212, 165, 59, 0.12);
      white-space: nowrap;
      display: none;
    }
    .settings-dirty-indicator.active {
      display: inline-flex;
    }
    .settings-section {
      border: 1px solid rgba(53, 80, 107, 0.72);
      border-radius: var(--radius-sm);
      background: rgba(12, 21, 31, 0.58);
      padding: 0.78rem;
    }
    .settings-section-title {
      font-size: 0.82rem;
      color: var(--text-primary);
      font-weight: 600;
      margin-bottom: 0.55rem;
    }
    .input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: rgba(20, 33, 46, 0.9);
      color: var(--text-primary);
      font-size: 0.875rem;
    }
    .settings-input-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.45rem;
    }
    .settings-input-unit {
      min-width: 34px;
      text-align: center;
      padding: 0.45rem 0.5rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(63, 96, 131, 0.72);
      background: rgba(20, 33, 46, 0.85);
      color: var(--text-secondary);
      font-size: 0.8rem;
      line-height: 1;
    }
    .settings-switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.9rem;
      padding: 0.75rem 0.78rem;
      border: 1px solid rgba(53, 80, 107, 0.72);
      border-radius: var(--radius-sm);
      background: rgba(12, 21, 31, 0.58);
      cursor: pointer;
    }
    .settings-switch-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
    }
    .settings-switch-title {
      color: var(--text-primary);
      font-size: 0.84rem;
      line-height: 1.4;
    }
    .settings-switch-hint {
      color: var(--text-secondary);
      font-size: 0.74rem;
      line-height: 1.45;
    }
    .settings-switch {
      position: relative;
      width: 42px;
      height: 24px;
      flex: 0 0 42px;
    }
    .settings-switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
      margin: 0;
    }
    .settings-switch-slider {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      border: 1px solid rgba(63, 96, 131, 0.78);
      background: rgba(33, 49, 67, 0.9);
      transition: all 0.18s ease;
    }
    .settings-switch-slider::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #c7d6e8;
      transition: transform 0.18s ease;
    }
    .settings-switch input:checked + .settings-switch-slider {
      background: rgba(31, 157, 139, 0.35);
      border-color: rgba(37, 179, 158, 0.82);
    }
    .settings-switch input:checked + .settings-switch-slider::before {
      transform: translateX(18px);
      background: #ecfffc;
    }
    .hint { color: var(--text-secondary); font-size: 0.75rem; line-height: 1.5; }
    .notice {
      margin-top: 0.75rem;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      background: rgba(12, 21, 31, 0.72);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      font-size: 0.75rem;
    }
    .settings-notice {
      margin-top: 0;
      padding: 0.58rem 0.68rem;
      background: rgba(20, 33, 46, 0.52);
      border-color: rgba(63, 96, 131, 0.62);
      font-size: 0.74rem;
    }
    .mapping-form {
      display: none;
      margin-bottom: 1rem;
      padding: 0.75rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: rgba(13, 24, 36, 0.72);
    }
    .mapping-form.active { display: block; }
    .mapping-form-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto auto;
      gap: 0.5rem;
      align-items: center;
    }
    .mapping-input-inline {
      margin: 0;
      min-width: 0;
    }
    .mapping-arrow {
      color: var(--text-secondary);
      font-size: 1rem;
      line-height: 1;
      padding: 0.2rem 0.36rem;
      border: 1px solid var(--border-default);
      border-radius: 999px;
      background: rgba(18, 32, 46, 0.9);
    }
    .mapping-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.84rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: rgba(12, 21, 31, 0.52);
    }
    .mapping-col-from { width: 20%; }
    .mapping-col-to { width: 60%; }
    .mapping-col-action { width: 20%; }
    .mapping-head {
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-default);
      background: rgba(20, 33, 46, 0.8);
    }
    .mapping-head th {
      padding: 0.56rem 0.8rem;
      font-weight: 600;
      text-align: center;
    }
    .mapping-row {
      transition: background 0.16s ease;
    }
    .mapping-row:hover {
      background: rgba(29, 48, 67, 0.42);
    }
    .mapping-row:last-child .mapping-cell {
      border-bottom: none;
    }
    .mapping-cell {
      padding: 0.48rem 0.8rem;
      border-bottom: 1px solid rgba(42, 63, 86, 0.55);
      vertical-align: middle;
      text-align: center;
    }
    .mapping-cell-to {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mapping-cell-action {
      text-align: center;
    }
    .mapping-action-group {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    .mapping-action-group .btn {
      min-width: 58px;
      justify-content: center;
    }
    .mapping-model-pill {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: 96%;
      padding: 0.22rem 0.5rem;
      border-radius: 999px;
      border: 1px solid var(--border-default);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      color: var(--text-primary);
      background: rgba(18, 32, 46, 0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mapping-model-from {
      border-color: rgba(104, 168, 255, 0.55);
      background: rgba(39, 71, 104, 0.42);
    }
    .mapping-model-to {
      border-color: rgba(37, 179, 158, 0.52);
      background: rgba(28, 83, 77, 0.44);
    }
    .manual-doc {
      display: grid;
      gap: 0.9rem;
      font-size: 0.84rem;
      color: var(--text-secondary);
      line-height: 1.6;
    }
    .manual-section {
      border: 1px solid rgba(53, 80, 107, 0.72);
      border-radius: var(--radius-sm);
      background: rgba(12, 21, 31, 0.58);
      padding: 0.78rem;
      display: grid;
      gap: 0.48rem;
    }
    .manual-section-title {
      font-size: 0.86rem;
      color: var(--text-primary);
      font-weight: 600;
      margin-bottom: 0.2rem;
    }
    .manual-list {
      margin: 0;
      padding-left: 1.15rem;
      display: grid;
      gap: 0.25rem;
    }
    .manual-table-wrap {
      width: 100%;
      overflow: auto;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
    }
    .manual-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 740px;
      font-size: 0.78rem;
    }
    .manual-table th,
    .manual-table td {
      border-bottom: 1px solid rgba(42, 63, 86, 0.6);
      padding: 0.44rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    .manual-table th {
      color: var(--text-primary);
      background: rgba(20, 33, 46, 0.7);
      white-space: nowrap;
    }
    .manual-tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.1rem 0.42rem;
      border-radius: 999px;
      font-size: 0.7rem;
      line-height: 1.2;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .manual-tag.ok {
      color: #b9f3ea;
      background: rgba(25, 89, 80, 0.35);
      border-color: rgba(37, 179, 158, 0.58);
    }
    .manual-tag.no {
      color: #ffc5c5;
      background: rgba(116, 37, 37, 0.34);
      border-color: rgba(239, 100, 100, 0.62);
    }
    .manual-note {
      padding: 0.62rem 0.68rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(63, 96, 131, 0.62);
      background: rgba(20, 33, 46, 0.52);
      font-size: 0.76rem;
    }
    .manual-warning {
      border-color: rgba(239, 100, 100, 0.62);
      background: rgba(116, 37, 37, 0.24);
      color: #ffcccc;
    }
    .manual-doc a {
      color: var(--text-primary);
      font-weight: 500;
      text-decoration: underline;
      text-decoration-color: rgba(79, 199, 182, 0.68);
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      transition: color 0.15s ease, text-decoration-color 0.15s ease;
    }
    .manual-doc a:hover {
      color: #eaf4ff;
      text-decoration-color: rgba(127, 225, 210, 0.95);
    }
    .manual-doc a:visited {
      color: #cde0f3;
      text-decoration-color: rgba(107, 191, 179, 0.72);
    }
    @media (max-width: 960px) {
      body { padding: 0.75rem; }
      .container { min-height: calc(100vh - 1.5rem); }
      .app-layout { grid-template-columns: 1fr; }
      .sidebar { padding: 0.75rem; }
      .tabs {
        flex-direction: row;
        gap: 0.5rem;
        overflow-x: auto;
        border-bottom: 1px solid var(--border-default);
        padding-bottom: 0.5rem;
      }
      .tab {
        width: auto;
        white-space: nowrap;
        border-radius: 6px 6px 0 0;
      }
      .tab.active {
        border-left: none;
        border-bottom: 2px solid var(--accent);
        padding-left: 1rem;
      }
      .account-item { flex-wrap: wrap; }
      .account-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .mapping-form-row {
        grid-template-columns: 1fr;
      }
      .mapping-input-inline,
      .mapping-form-row .btn,
      .mapping-arrow {
        width: 100%;
      }
      .mapping-arrow {
        text-align: center;
      }
      .mapping-cell-to {
        justify-content: center;
      }
      .provider-group-header {
        flex-wrap: wrap;
      }
      .models-header-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .sidebar-language {
        flex-wrap: wrap;
      }
      .sidebar-language-select {
        width: 100%;
        min-width: 0;
      }
      .settings-save-wrap {
        width: 100%;
        justify-content: flex-end;
      }
      .settings-switch-row {
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-profile" id="sidebarProfile">
          <div class="sidebar-avatar-wrap">
            <img class="sidebar-avatar" id="sidebarAvatar" alt="Active account avatar">
            <div class="sidebar-avatar-fallback" id="sidebarAvatarFallback">?</div>
          </div>
          <div class="sidebar-profile-text">
            <div class="sidebar-login" id="sidebarLogin" data-i18n="status.noActiveAccount">No active account</div>
            <div class="sidebar-type" id="sidebarType" data-i18n="status.connectAccount">Connect an account</div>
          </div>
        </div>
        <div class="status-bar" id="statusBar">
          <div class="status-dot" id="statusDot"></div>
          <span id="statusText" data-i18n="status.checkingSession">Checking session...</span>
        </div>
        <div class="sidebar-language">
          <label class="sidebar-language-label" for="languageSelect" data-i18n="language.label">Language</label>
          <select class="select sidebar-language-select" id="languageSelect">
            <option value="en" data-i18n="language.en">English</option>
            <option value="zh-CN" data-i18n="language.zhCN">简体中文</option>
          </select>
        </div>
        <div class="tabs sidebar-nav">
          <button class="tab active" data-tab="accounts" data-i18n="nav.accounts">Accounts</button>
          <button class="tab" data-tab="settings" data-i18n="nav.settings">Settings</button>
          <button class="tab" data-tab="models" data-i18n="nav.models">Models</button>
          <button class="tab" data-tab="usage" data-i18n="nav.usage">Usage</button>
          <button class="tab" data-tab="model-mappings" data-i18n="nav.modelMappings">Model Mappings</button>
          <button class="tab" data-tab="manual" data-i18n="nav.manual">Manual</button>
        </div>
      </aside>
      <main class="main-content">
    <div class="tab-content active" id="tab-accounts">
      <div class="card">
        <div class="card-header">
          <span class="card-title" data-i18n="accounts.githubAccounts">GitHub Accounts</span>
          <button class="btn btn-primary" id="addAccountBtn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg>
            <span data-i18n="accounts.addAccount">Add Account</span>
          </button>
        </div>
        <ul class="account-list" id="accountList"><li class="empty-state" data-i18n="accounts.loadingAccounts">Loading accounts...</li></ul>
      </div>
    </div>
    <div class="tab-content" id="tab-models">
      <div class="card">
        <div class="card-header models-card-header">
          <span class="card-title" data-i18n="models.availableModels">Available Models</span>
          <div class="models-header-actions">
            <button class="btn btn-sm models-action-btn model-visibility-toggle" id="modelVisibilityToggle" type="button">
              <span class="models-action-icon" id="modelVisibilityToggleIcon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 2.3 5.2 1.2 7.2a1.6 1.6 0 0 0 0 1.6C2.3 10.8 4.5 13 8 13s5.7-2.2 6.8-4.2a1.6 1.6 0 0 0 0-1.6C13.7 5.2 11.5 3 8 3Zm0 8.7A3.7 3.7 0 1 1 8 4.3a3.7 3.7 0 0 1 0 7.4Zm0-5.9a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"></path></svg>
              </span>
              <span id="modelVisibilityToggleText" data-i18n="models.filterVisible">Visible</span>
            </button>
            <button class="btn btn-sm models-action-btn" id="toggleModelManageBtn" type="button">
              <span class="models-action-icon" id="modelManageToggleIcon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.75A.75.75 0 0 1 3.75 2h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 2.75Zm-2 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm2 5A.75.75 0 0 1 3.75 12h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 12.75Z"></path></svg>
              </span>
              <span id="modelManageToggleText" data-i18n="models.manage">Manage</span>
            </button>
            <button class="btn btn-sm models-action-btn refresh-btn" id="refreshModels">
              <span class="models-action-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>
              </span>
              <span data-i18n="common.refresh">Refresh</span>
            </button>
          </div>
        </div>
        <div class="models-grid" id="modelsList"><div class="empty-state" data-i18n="models.loadingModels">Loading models...</div></div>
      </div>
    </div>
    <div class="tab-content" id="tab-settings">
      <div class="card">
        <div class="card-header">
          <div class="settings-header-main">
            <span class="card-title" data-i18n="settings.trafficControl">Traffic Control</span>
            <p class="settings-subtitle" data-i18n="settings.subtitle">Configure process-wide request throttling behavior.</p>
          </div>
          <div class="settings-save-wrap">
            <span class="settings-dirty-indicator" id="settingsDirtyIndicator" data-i18n="settings.unsaved">Unsaved changes</span>
            <button class="btn btn-primary btn-sm" id="saveSettingsBtn" data-i18n="common.save" disabled>Save</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="settings-section">
            <div class="settings-section-title" data-i18n="settings.rateLimitSeconds">Rate Limit Seconds</div>
            <div class="settings-input-row">
              <input class="input" id="rateLimitSeconds" type="number" min="0" step="1" placeholder="Leave empty to disable" data-i18n-placeholder="settings.rateLimitPlaceholder">
              <span class="settings-input-unit" data-i18n="settings.secondsUnit">sec</span>
            </div>
            <p class="hint" data-i18n="settings.rateLimitHint">Minimum global interval between requests. Empty means disabled.</p>
          </div>
          <label class="settings-switch-row" for="rateLimitWait">
            <span class="settings-switch-copy">
              <span class="settings-switch-title" data-i18n="settings.rateLimitWait">Wait instead of returning HTTP 429 when rate limit is hit</span>
              <span class="settings-switch-hint" data-i18n="settings.rateLimitWaitHint">When enabled, requests queue instead of failing immediately.</span>
            </span>
            <span class="settings-switch">
              <input id="rateLimitWait" type="checkbox">
              <span class="settings-switch-slider"></span>
            </span>
          </label>
          <div class="notice settings-notice" id="settingsNotice" data-i18n="settings.loadingSettings">
            Loading settings...
          </div>
        </div>
      </div>
    </div>
    <div class="tab-content" id="tab-usage">
      <div class="card">
        <div class="card-header">
          <span class="card-title" data-i18n="usage.statistics">Usage Statistics</span>
          <button class="btn btn-sm refresh-btn" id="refreshUsage">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 0 0 0 8 2.5Z"></path></svg>
            <span data-i18n="common.refresh">Refresh</span>
          </button>
        </div>
        <div id="usageContent"><div class="empty-state" data-i18n="usage.loading">Loading usage data...</div></div>
      </div>
    </div>
    <div class="tab-content" id="tab-model-mappings">
      <div class="card">
        <div class="card-header">
          <span class="card-title" data-i18n="mappings.title">Model Mappings</span>
          <button class="btn btn-primary btn-sm" id="addMappingBtn" data-i18n="mappings.add">+ Add Mapping</button>
        </div>
        <div id="mappingFormArea" class="mapping-form">
          <div class="mapping-form-row">
            <input class="select mapping-input-inline" id="mappingFrom" placeholder="From model" data-i18n-placeholder="mappings.fromPlaceholder">
            <span class="mapping-arrow">\u2192</span>
            <select class="select mapping-input-inline" id="mappingTo"><option value="" data-i18n="mappings.loadingModels">Loading models...</option></select>
            <button class="btn btn-primary btn-sm" id="saveMappingBtn" data-i18n="common.save">Save</button>
            <button class="btn btn-sm" id="cancelMappingBtn" data-i18n="common.cancel">Cancel</button>
          </div>
        </div>
        <table class="mapping-table">
          <colgroup>
            <col class="mapping-col-from">
            <col class="mapping-col-to">
            <col class="mapping-col-action">
          </colgroup>
          <thead>
            <tr class="mapping-head">
              <th data-i18n="mappings.from">From</th>
              <th data-i18n="mappings.to">To</th>
              <th data-i18n="mappings.action">Action</th>
            </tr>
          </thead>
          <tbody id="mappingList"><tr><td colspan="3" class="empty-state" data-i18n="common.loading">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="tab-content" id="tab-manual">
      <div class="card">
        <div class="card-header">
          <div class="settings-header-main">
            <span class="card-title" data-i18n="manual.title">使用手册</span>
            <p class="settings-subtitle" data-i18n="manual.subtitle">端点映射 + 跨项目接入</p>
          </div>
        </div>
        <!-- MANUAL_CONTENT_START: Keep all user manual sections inside this block -->
        <div class="manual-doc">
          <section class="manual-warning manual-note" data-i18n-html="manual.publicAdminNoteHtml"><strong>重点：</strong>如果需要公网访问 admin 页面，可通过 Caddy 反代并在其配置中添加账号密码；<code>/admin*</code> 走后台页面；其余路径直接反代到 copilot-api 服务进行使用，或者只允许 admin 路径访问，端点结合其他项目使用。</section>

          <section class="manual-section" data-i18n-html="manual.section2Html">
            <div class="manual-section-title">1. 每个端点可用模型</div>
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
            <div class="manual-note">规则：responses 仅用于 Codex 与 gpt-5.4 相关模型；gemini 端点仅用于 Gemini 相关模型；chat/completions 与 messages 可用于所有模型。</div>
          </section>

          <section class="manual-section" data-i18n-html="manual.section3Html">
            <div class="manual-section-title">2.推荐结合 <a href="https://github.com/tbphp/gpt-load" target="_blank" rel="noopener noreferrer">GPT-Load</a>与 <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener noreferrer">New API</a>使用</div>
            <ol class="manual-list">
              <li>chat 组（openai）：可放全部模型。</li>
              <li>messages 组（anthropic）：可放全部模型。</li>
              <li>responses 组（openai-response）：仅放 Codex 与 gpt-5.4 / gpt-5.4-mini。</li>
              <li>gemini 组（gemini）：仅放 Gemini 相关模型。</li>
            </ol>
          </section>
        <!-- MANUAL_CONTENT_END -->
        </div>
      </div>
    </div>
      </main>
    </div>
  </div>
  <div class="modal-overlay" id="confirmActionModal">
    <div class="modal">
      <h2 class="modal-title" id="confirmActionTitle">Confirm</h2>
      <p class="modal-text" id="confirmActionMessage"></p>
      <div class="modal-actions">
        <button class="btn" id="confirmActionCancelBtn" data-i18n="common.cancel">Cancel</button>
        <button class="btn btn-primary" id="confirmActionConfirmBtn">Confirm</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="authModal">
    <div class="modal">
      <h2 class="modal-title" data-i18n="auth.addAccount">Add GitHub Account</h2>
      <div id="authStep1">
        <label class="label" data-i18n="auth.accountType">Account Type</label>
        <select class="select" id="accountType">
          <option value="individual" data-i18n="auth.typeIndividual">Individual</option>
          <option value="business" data-i18n="auth.typeBusiness">Business</option>
          <option value="enterprise" data-i18n="auth.typeEnterprise">Enterprise</option>
        </select>
        <p class="modal-text" data-i18n="auth.startPrompt">Click below to start the authorization process.</p>
        <div class="modal-actions">
          <button class="btn" id="cancelAuth" data-i18n="common.cancel">Cancel</button>
          <button class="btn btn-primary" id="startAuth" data-i18n="auth.startAuthorization">Start Authorization</button>
        </div>
      </div>
      <div id="authStep2" style="display:none">
        <p class="modal-text" data-i18n="auth.enterCode">Enter this code at GitHub:</p>
        <div class="device-code" id="deviceCode">--------</div>
        <p class="modal-text"><a href="" id="verificationLink" target="_blank" style="color:#58a6ff" data-i18n="auth.openGithub">Open GitHub</a></p>
        <p class="modal-text"><span class="spinner"></span> <span data-i18n="auth.waiting">Waiting for authorization...</span></p>
        <div class="modal-actions"><button class="btn" id="cancelAuth2" data-i18n="common.cancel">Cancel</button></div>
      </div>
    </div>
  </div>
  ${adminScript}
</body>
</html>`
