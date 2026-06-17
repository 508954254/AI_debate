# 🤖 AI 辩论赛

> 两大 AI 模型正面交锋，三位 AI 裁判公平裁决 —— 一个完整的 AI 辩论竞技平台。

---

## 📖 目录

- [项目概览](#项目概览)
- [架构设计](#架构设计)
- [辩论流程](#辩论流程)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [配置说明](#配置说明)
- [技术栈](#技术栈)
- [WebSocket 协议](#websocket-协议)
- [裁判评分机制](#裁判评分机制)
- [常见问题](#常见问题)

---

## 项目概览

这是一个实时 AI 辩论赛平台，用户可以设定辩题，选择两大 AI 模型分别作为正反方进行辩论，三位独立 AI 裁判从五个维度同时打分，最终根据**总分**裁定胜负。

### 核心特性

- 🎤 **完整的辩论赛制**：立论陈词 → 自由辩论（可配置轮数）→ 总结陈词 → 裁判评分
- ⚡ **实时流式输出**：基于 SSE 流式传输，逐字显示发言内容，观感流畅
- ⚖️ **三裁判合议制**：三位裁判并行评分，按总分统计票数，评出胜方
- 🎨 **暗色主题 UI**：深色调玻璃拟态设计，渐变动画，撒花特效
- 📜 **对战记录**：自动保存最近 20 场辩论到本地，支持展开查看详情
- 🔄 **自动重试**：API 调用失败时自动重试，长内容自动裁剪
- 🎲 **随机匹配**：一键随机选择正反方模型和辩题
- 🌡️ **温度可调**：辩论创造性从 0（谨慎）到 2（狂野）自由调节

---

## 架构设计

```
Frontend (React 19 + Vite 8)         Backend (Python FastAPI)
┌──────────────────────────┐        ┌───────────────────────────┐
│  App.jsx (状态管理)        │  WebSocket  │  main.py (WS endpoint)    │
│  ├── ConfigPanel.jsx      │◄──────────►│  ├── debate.py (编排器)    │
│  ├── DebateView.jsx       │  stream    │  └── api_client.py (SSE)  │
│  ├── JudgeResult.jsx      │            │                           │
│  └── HistoryPanel.jsx     │            │  ── 中转站 API ──          │
├──────────────────────────┤            │  /v1/chat/completions     │
│  utils/parseJudgeJSON.js │            │  /v1/models               │
│  App.css (样式)           │            └───────────────────────────┘
└──────────────────────────┘
```

**数据流**：用户配置参数 → 前端通过 WebSocket 发送 `start` 消息 → 后端辩论编排器依次调用模型 API → SSE 流式解析 → token 逐字推送到前端 → 前端 `requestAnimationFrame` 批量渲染

---

## 辩论流程

```
Phase 1: 立论陈词 (opening)
  ├── 正方开篇立论 (200-300 字)
  └── 反方开篇立论 (200-300 字)

Phase 2: 自由辩论 (free_debate, 默认 3 轮)
  └── 每轮:
      ├── 正方发言 (150-250 字)
      └── 反方发言 (150-250 字)

Phase 3: 总结陈词 (closing)
  ├── 正方最终总结 (200-300 字)
  └── 反方最终总结 (200-300 字)

Phase 4: 裁判评分 (judge)
  ├── 三位裁判并行评分 (JSON 格式)
  └── 合议结果: 按总分判定胜负
```

**重要机制**：任一方发言失败（API 返回空内容或超时），辩论立即终止并提示错误。这确保双方必须都能正常发言才算完整场次。

---

## 快速开始

### 环境要求

| 组件 | 要求 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |

### 1. 配置 API

编辑 `backend/config.py`：

```python
API_BASE_URL = "https://你的中转站地址"     # OpenAI 兼容格式
API_KEY = "sk-你的API密钥"
DEFAULT_MODEL_PRO = "gpt-5.5"              # 正方默认模型
DEFAULT_MODEL_CON = "claude-opus-4-8"      # 反方默认模型
DEFAULT_MODEL_JUDGES = ["gpt-5.5", "claude-opus-4-8", "deepseek-v4-pro"]
```

### 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端运行在 `http://0.0.0.0:8000`，含热重载（修改代码自动重启）。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 `http://localhost:5173`，含 HMR 热更新。

### 4. 开始辩论

1. 浏览器打开 `http://localhost:5173`
2. 在前端页面选择正反方模型、三位裁判模型
3. 输入辩题（或点击 🎲 随机生成）
4. 调整自由辩论轮数和温度
5. 点击「🚀 开始辩论」

---

## 项目结构

```
AI辩论赛/
├── README.md                    # 本文件
├── .gitignore
├── backend/
│   ├── main.py                  # FastAPI 入口，REST API + WebSocket
│   ├── debate.py                # 辩论编排器 (DebateOrchestrator)
│   ├── api_client.py            # OpenAI 兼容 API 客户端 (SSE 流式)
│   ├── config.py                # API 地址、密钥、默认配置
│   └── requirements.txt         # Python 依赖
└── frontend/
    ├── package.json             # 项目依赖和脚本
    ├── vite.config.js           # Vite 配置 (含代理)
    ├── index.html               # HTML 入口
    ├── eslint.config.js         # ESLint 配置
    ├── public/
    │   ├── favicon.svg          # 网站图标
    │   └── icons.svg            # SVG 图标集
    └── src/
        ├── main.jsx             # React 入口
        ├── App.jsx              # 根组件 (状态管理 + WebSocket)
        ├── App.css              # 全局样式 (1934 行)
        ├── index.css            # 基础样式重置
        ├── utils/
        │   └── parseJudgeJSON.js  # 裁判 JSON 解析工具
        ├── components/
        │   ├── ConfigPanel.jsx    # 配置面板 (模型/辩题/参数)
        │   ├── DebateView.jsx     # 辩论实时显示 (时间线+裁判卡片)
        │   ├── JudgeResult.jsx    # 最终裁判结果 (撒花+分数卡)
        │   ├── HistoryPanel.jsx   # 对战历史记录
        │   ├── ConfirmDialog.jsx  # 通用确认弹窗
        │   └── ConfirmDialog.css  # 弹窗样式
        └── assets/
            ├── hero.png          # 首页横幅 (未使用)
            ├── react.svg         # React 图标
            └── vite.svg          # Vite 图标
```

---

## 配置说明

### 后端配置 (`config.py`)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `API_KEY` | API 密钥 | (见源文件) |
| `DEFAULT_MODEL_PRO` | 正方默认模型 | `gpt-5.5` |
| `DEFAULT_MODEL_CON` | 反方默认模型 | `claude-opus-4-8` |
| `DEFAULT_MODEL_JUDGES` | 默认三位裁判模型 | `[gpt-5.5, claude-opus-4-8, deepseek-v4-pro]` |
| `DEFAULT_FREE_ROUNDS` | 默认自由辩论轮数 | `3` |

### 前端配置 (`vite.config.js`)

| 配置 | 说明 |
|------|------|
| `proxy./ws` | WebSocket 代理 → `ws://localhost:8000` |
| `proxy./api` | API 请求代理 → `http://localhost:8000` |

### 辩论参数

| 参数 | 范围 | 说明 |
|------|------|------|
| 自由辩论轮数 | 1-10 | 正反方各发言 N 轮 |
| 辩论温度 | 0.0-2.0 | 0=确定性, 1=平衡, 2=创造性 |

---

## 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| **前端框架** | React | ^19.2 |
| **构建工具** | Vite | ^8.0 |
| **后端框架** | FastAPI | ≥0.104 |
| **服务器** | Uvicorn | ≥0.24 |
| **HTTP 客户端** | httpx | ≥0.25 |
| **通信协议** | WebSocket | — |
| **样式方案** | 纯 CSS (Glassmorphism) | — |

---

## WebSocket 协议

### 前端 → 后端

```json
// 开始辩论
{ "type": "start", "config": { "model_pro": "...", "model_con": "...", "judge_models": [...], "topic": "...", "free_rounds": 3, "temperature": 0.8 } }

// 停止辩论
{ "type": "stop" }
```

### 后端 → 前端

| type | 说明 | 携带字段 |
|------|------|----------|
| `phase` | 阶段切换 | `phase`: "opening"/"free_debate"/"closing"/"judge" |
| `round` | 回合信息 | `round`, `total` |
| `speaker` | 开始发言 | `debater`: "pro"/"con", `label`, `model` |
| `token` | 流式文字 | `text` |
| `retry` | 发言重试 | `debater`, `message` |
| `speaker_done` | 发言完成 | `debater`, `char_count` |
| `speaker_failed` | 发言失败 | `debater`, `message` |
| `judge_start` | 裁判启动 | `judge_idx`, `judge_name`, `judge_model` |
| `judge_token` | 裁判流式输出 | `judge_idx`, `text` |
| `judge_retry` | 裁判重试 | `judge_idx`, `message` |
| `judge_done` | 裁判完成 | `judge_idx`, `full_text` |
| `judge_error` | 裁判出错 | `judge_idx`, `message` |
| `done` | 辩论结束 | — |
| `error` | 全局错误 | `message` |
| `stopped` | 用户停止 | — |

---

## 裁判评分机制

### 评分维度 (每项 1-10 分)

| 维度 | 说明 |
|------|------|
| 逻辑严密性 | 论证是否严谨、有无逻辑漏洞 |
| 论据充分性 | 是否有足够的事实和数据支撑 |
| 反驳能力 | 是否有效回应了对方的攻击 |
| 表达能力 | 语言是否清晰、有力、有感染力 |
| 辩论风度 | 是否保持理性和尊重 |

### 胜负判定

```
每位裁判: 正方5项总分 vs 反方5项总分 → 票投高分方
最终: 获得 ≥2 票的一方获胜，否则平局
```

- **按实际分数统计票数**，不信任模型输出的 `winner` 字段
- 总分严格比较：`p > c` 正方胜, `c > p` 反方胜，相等则平局
- 仅统计成功解析 JSON 的裁判，至少需要 1 位有效裁判

### 总分显示

- 每位裁判满分：5维度 × 10分 = 50分
- 总分卡：3位裁判累加 / 满分150分
- 不足3位有效裁判时，按实际有效裁判数缩放满分

---

## 常见问题

### Q: 模型发言卡住或超时怎么办？

后端设置了 120 秒超时和最多 2 次自动重试（间隔 2 秒）。如果两次都失败，当前发言方失败。建议使用稳定的模型（gpt、claude、qwen 系列），避免使用 grok-fast、小型模型等不稳定的模型。

### Q: 裁判解析结果为空？

裁判模型有时不按 JSON 格式输出。系统已内置多层容错解析：
1. 直接 JSON.parse
2. 提取 markdown 代码块 ` ```json ... ``` `
3. 正则提取最外层 `{...}`
4. 修复 LLM 常见错误（尾部多余逗号）

如果仍解析失败，在结果页会显示原始裁判输出供人工查看。

### Q: 网页打不开？

1. 确认后端已启动：访问 `http://localhost:8000/` 应返回 JSON
2. 确认前端已启动：`npm run dev` 应在 `http://localhost:5173` 运行
3. 检查防火墙是否阻止了端口

### Q: 如何添加新模型？

在配置面板的下拉列表中会自动加载中转站可用模型。如果模型未显示，刷新页面重新获取模型列表，或手动输入模型名称。

### Q: 对战记录存在哪里？

存储在浏览器 `localStorage` 中，最多保存最近 20 条。清空浏览器数据会导致记录丢失。

---

## 开发说明

### 后端

- `debate.py` 中的 `DebateOrchestrator` 是核心编排器，管理完整的辩论生命周期
- `_safe_format()` 函数用于安全替换 prompt 中的变量，自动转义花括号防止 KeyError
- 裁判通过 `asyncio.Queue` 并行运行，结果汇总后统一返回
- 发言过短（<15字符）或裁判回复过短（<30字符）自动触发重试
- 调试日志已开启，可在后端终端查看 `[DEBUG]` 输出

### 前端

- `App.jsx` 是唯一的状态管理组件，通过 WebSocket 事件驱动状态变更
- 流式内容通过 `requestAnimationFrame` 批量刷新到时间线
- `parseJudgeJSON.js` 是三处裁判 JSON 解析的共享实现
- 样式采用深色调玻璃拟态设计，`App.css` 包含全部 1934 行样式

### 构建生产版本

```bash
cd frontend
npm run build          # 输出到 dist/
npm run preview        # 预览构建结果
```

---

## 许可证

MIT License
