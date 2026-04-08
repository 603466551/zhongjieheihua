# 二手房约谈耳目助手（手机优先）

一个纯前端网页工具，核心目标：

1. 把中介话术翻译成大白话（看懂潜台词）。  
2. 给出你们可直接说出口的应答话术（逻辑清晰，不被带节奏）。

## 1. 两种运行模式

### 默认模式（无模型也能用）

- 不需要 API Key。  
- 使用本地规则引擎分析潜台词与应答建议。  
- 支持手动输入对话（任何手机浏览器都可用）。

### 模型增强模式（可选）

- 可配置语音模型：用于实时音频转写。  
- 可配置语言模型：用于潜台词和应答增强。  
- 配置页支持填写 API Base、API Key、模型名、场景说明。

## 2. 手机麦克风说明

- 需要 HTTPS 页面（Cloudflare Pages 默认满足）。  
- 首次使用要允许麦克风权限。  
- 如果浏览器原生语音不可用，可切换“模型语音转写”。  
- 如果仍不可用，至少可以使用“手动输入”继续使用核心分析能力。

## 3. 本地启动（调试）

```powershell
python -m http.server 8080
```

访问 [http://localhost:8080](http://localhost:8080)。

## 4. Cloudflare 自动部署

仓库已包含工作流：

- [deploy-cloudflare-pages.yml](./.github/workflows/deploy-cloudflare-pages.yml)

当推送到 `main` 分支时自动部署。

### 4.1 首次推送

```powershell
git init
git add .
git commit -m "feat: negotiation assistant with local+model modes"
git branch -M main
git remote add origin <你的Git仓库地址>
git push -u origin main
```

### 4.2 GitHub 仓库变量

1. `Secrets`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

2. `Variables`
- `CLOUDFLARE_PROJECT_NAME`

## 5. 模型调用前为什么要写场景说明

需要。  
你在配置页里填写的“场景说明”会作为系统提示词先发给模型，让模型更懂：

- 你们是买方、程序员风格（重证据与逻辑）。  
- 预算边界不能突破。  
- 证据不足时先核验再谈价。  

这能显著减少“泛泛而谈”的回答，让建议更贴近现场可用。
