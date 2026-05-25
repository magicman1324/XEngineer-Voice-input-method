# 语音输入法 · 同声传译

跨语言沟通同传字幕工具 — 边说边译，实时双语字幕。

七牛云 × XEngineer 暑期实训营项目。

## 功能

- **实时语音识别** — 火山引擎 ASR v3 bigmodel，WebSocket 流式传输
- **同声传译** — 豆包大模型（Ark API），中/英/日/韩/法多语言互译
- **VAD 静音检测** — 自动分割语音段落，静音超时自动断句
- **复制 / 清空 / 语言切换** — 完整交互闭环

## 架构

```
浏览器 (H5)
  ├─ AudioService   → 麦克风采集 → ScriptProcessor → PCM 16kHz
  ├─ VAD            → 音量阈值检测 → 静音分段
  ├─ ASRService     → WebSocket → 本地代理 → 火山引擎 ASR
  └─ TranslatorService → HTTP → 本地代理 → 豆包大模型

本地代理 (Node.js)
  ├─ WS 代理 :8765  → 附加鉴权头 → 火山 ASR v3/bigmodel
  └─ HTTP 代理 :8766 → 附加鉴权头 → 火山方舟 Ark API
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置鉴权信息（编辑 js/config.js）
#    asrAppid / asrToken — 火山引擎 ASR 访问密钥
#    translateApiKey       — 火山方舟 API Key (ark-...)
#    translateModel        — 推理接入点 ID (ep-...)

# 3. 启动本地代理
node proxy.js

# 4. 启动静态服务
npx serve . -p 3000 --no-clipboard

# 5. 浏览器打开 http://localhost:3000
```

## 项目结构

```
XEngineer/
├── index.html          # 主页面 (Tailwind CDN)
├── proxy.js            # 本地代理 (WebSocket + HTTP)
├── js/
│   ├── config.js       # 全局配置
│   ├── utils.js        # 工具函数
│   ├── audio.js        # AudioService — 麦克风采集
│   ├── vad.js          # VAD — 静音检测
│   ├── asr.js          # ASRService — 语音识别
│   ├── translator.js   # TranslatorService — 翻译
│   ├── ui.js           # UIManager — DOM 管理
│   └── app.js          # App — 状态机编排
├── css/
│   └── style.css       # 自定义样式
├── test/
│   └── test-pr5.js     # ASR + 翻译代理测试
└── assets/
    └── favicon.ico
```

## API 配置

所有鉴权信息集中在 `js/config.js`：

| 字段 | 说明 |
|------|------|
| `api.asrWsUrl` | ASR WebSocket 代理地址 |
| `api.asrAppid` | 火山引擎 APP ID |
| `api.asrToken` | 火山引擎 Access Token |
| `api.translateApiUrl` | 翻译 HTTP 代理地址 |
| `api.translateApiKey` | 火山方舟 API Key |
| `api.translateModel` | 推理接入点 ID |

## 测试

```bash
# 确保代理已启动，然后：
node test/test-pr5.js
```

## License

MIT
