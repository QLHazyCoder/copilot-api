# Gemini 格式接入开发方案（仅转 Chat 路线）

> 更新时间：2026-04-05
> 决策：Gemini 格式请求统一转为 Chat 格式；不走 messages/responses；匹配不上直接 400。

---

## 1. 需求目标

实现 Gemini 格式入口，但内部只走 `/chat/completions` 链路：
- Gemini 请求进来 -> 转成 Chat 请求
- Chat 响应回来 -> 转成 Gemini 响应
- 不做 messages/responses fallback
- 模型不匹配或不支持 chat 时，直接返回 400（提示切换模型）

---

## 2. 范围与非范围

## 本期范围（只做这些）
1. `POST /v1beta/models/{model}:generateContent`
2. `POST /v1beta/models/{model}:streamGenerateContent`（可选 `alt=sse`）
3. 基础文本场景（`contents.parts.text`）

## 非范围（本期不做）
- `countTokens`
- `/v1beta/models` 列表接口
- 文件上传/复杂多模态全量兼容
- Gemini 专有工具（Google Search 等）
- responses/messages 兜底分流

---

## 3. 关键设计

### 3.0 固定执行顺序
1. 解析 Gemini 请求并提取 `{model}`
2. 先做模型存在性与 chat 能力校验
3. 校验失败直接 400（提示切换模型）
4. 校验通过后再做 Gemini -> Chat 请求转换
5. 调用内部 `/chat/completions`
6. 将 Chat 响应转换回 Gemini 响应

### 3.1 路由
新增 `src/routes/gemini/`：
- `route.ts`
- `handler.ts`
- `translation.ts`

在 `src/server.ts` 挂载：
- `/v1beta/models/...`

### 3.2 模型校验（强约束）
收到 `{model}` 后先做校验：
1. 模型存在于缓存模型列表
2. 模型 `supported_endpoints` 包含 chat 能力（`/chat/completions` 或 `/v1/chat/completions`）

任一不满足：
- 直接 400，错误文案明确提示“请切换支持 chat 的模型”

### 3.3 请求转换（Gemini -> Chat）
- `contents[].role` -> chat `messages[].role`
- `parts[].text` -> chat 文本内容
- 流式请求映射为 `stream = true`

### 3.4 响应转换（Chat -> Gemini）
- 非流式：转为 `candidates[].content.parts[].text`
- 流式：按 Gemini SSE 形态输出增量文本
- 错误：统一转 Gemini 风格 error body

### 3.5 明确不做 fallback
不复用现有 messages/responses 回退策略。
本方案是“单路径（chat-only）”，行为要可预测、可控。

---

## 4. 开发清单（分阶段 + 每阶段自检）

### 阶段 A：路由骨架
- [ ] 新建 Gemini 路由目录与基础文件
- [ ] 在 `server.ts` 挂载 Gemini 路由

**自检**
- [ ] 不影响现有 OpenAI/Anthropic 路由
- [ ] 路径命名与现有风格一致

### 阶段 B：模型校验与 400 规则
- [ ] 接入模型存在性校验
- [ ] 接入 chat 能力校验
- [ ] 返回统一 400 错误体（提示切换模型）

**自检**
- [ ] 不支持 chat 的模型必定被拦截
- [ ] 错误信息可直接指导用户切换模型

### 阶段 C：非流式转换
- [ ] Gemini 请求体 -> Chat 请求体转换
- [ ] Chat 响应 -> Gemini 响应转换

**自检**
- [ ] 基础文本问答可闭环
- [ ] 角色映射正确（user/model）

### 阶段 D：流式转换
- [ ] `streamGenerateContent` 请求处理
- [ ] Chat 流式 chunk -> Gemini SSE 事件

**自检**
- [ ] 流式可连续输出
- [ ] 结束事件与异常事件完整

### 阶段 E：收尾清理
- [ ] 删除临时调试逻辑
- [ ] 文档仅保留最终实现路径（chat-only）

**自检**
- [ ] 无陈旧代码
- [ ] 无多路径分流残留描述

---

## 5. 方案自检（完整性/正确性/一致性）

1. **是否符合当前需求**：符合。已明确“只转 chat，不走其他端点”。
2. **是否完整**：完整覆盖路由、校验、请求转换、响应转换、错误处理、流式。
3. **是否正确**：与现有系统能力一致，可复用 chat 主链路，减少协议复杂度。
4. **是否规范一致**：遵循当前项目“翻译层 + 路由层”结构。
5. **是否有设计冲突**：无；但需确保 Gemini 新路由不覆盖现有 `/v1/*` 路由。

---

## 6. 交付标准

满足以下条件即交付：
- Gemini 请求可通过 chat-only 路线完成非流式与流式文本对话。
- 不支持 chat 的模型会直接 400 并提示切换模型。
- 代码中不存在 messages/responses 的 Gemini fallback 逻辑。