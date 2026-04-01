# 西安二手房约谈助手（本地网页版）

一个纯前端小工具：你先输入“起始报价 + 最高可接受价”，约谈时用语音或手动输入对话，页面会实时识别中介常见话术、判断意图，并给出建议回复与下一口价建议。

## 1. 使用方式

1. 在浏览器打开 `index.html`。  
2. 填写并保存价格边界（单位：万元）。  
3. 约谈现场选择当前发言方：  
   - 对方说话时选 `中介/业主方`
   - 你们说话时选 `我方`
4. 点击“开始监听”做实时识别；识别不稳时可手动输入文本并提交。  
5. 每次对方发言后，查看右侧“话术识别 + 建议回答 + 下一口价建议”。

## 2. 浏览器建议

- 推荐：Chrome / Edge 最新版（支持 `SpeechRecognition`）。  
- 若浏览器不支持语音识别，仍可用“手动输入”功能。  
- 语音识别通常需要麦克风权限；请在浏览器弹窗中允许。

## 3. 启动本地静态服务（可选）

直接双击 `index.html` 就能用。  
如果你希望更稳定地调试，可在该目录运行：

```powershell
python -m http.server 8080
```

然后访问：`http://localhost:8080`

## 4. 设计边界与提示

- 这是“现场决策辅助”，不是法律或金融建议。  
- 语音识别在嘈杂环境会有误差，关键句建议手动修正。  
- 规则引擎基于常见关键词，适合快速提醒，不等于对方真实意图的绝对判断。  

## 5. Git + Cloudflare 自动部署

仓库已包含 GitHub Action：  
`/.github/workflows/deploy-cloudflare-pages.yml`

当你 push 到 `main` 分支时，会自动发布到 Cloudflare Pages。

### 5.1 首次初始化与推送

```powershell
git init
git add .
git commit -m "feat: add negotiation web app and cloudflare pages auto deploy"
git branch -M main
git remote add origin <你的Git仓库地址>
git push -u origin main
```

### 5.2 在 GitHub 仓库里配置以下项

1. Repository Secrets  
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
2. Repository Variables  
   - `CLOUDFLARE_PROJECT_NAME`（Cloudflare Pages 项目名）

### 5.3 Cloudflare API Token 权限建议

- `Account` -> `Cloudflare Pages:Edit`
- `Zone` 权限不是必需（仅 Pages 部署可不配）

配置完成后，后续每次 `git push` 到 `main` 都会自动部署。
