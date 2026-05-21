# 访客共用模型（服务端托管）

让朋友打开 `http://你的公网IP/` 即可使用**同一套模型**，无需各自填写 API Key。

## 原理

| 组件 | 作用 |
|------|------|
| `/config.json` | 告诉前端有哪些模型（不含密钥） |
| Nginx `/v1/` 反代 | 把请求转到 lemonapi，并自动加上 `Authorization: Bearer <你的Key>` |

## 服务器配置（SSH 登录后执行）

### 1. 创建公开配置

```bash
sudo mkdir -p /etc/learning-assistant
sudo nano /etc/learning-assistant/config.json
```

内容参考项目内 `deploy/config.json.example`，把 `defaultModelId` 和 `models` 改成你实际使用的模型。

```bash
sudo chmod 644 /etc/learning-assistant/config.json
```

### 2. 修改 Nginx 站点

```bash
sudo nano /etc/nginx/sites-available/learning-assistant
```

在 `server { ... }` 里、`location /assets/` **之前**加入 `deploy/nginx-api-proxy.snippet` 中的两段，并把 `YOUR_API_KEY_HERE` 换成真实 API Key。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 验证

```bash
curl -s http://127.0.0.1/config.json
```

浏览器访问 `http://47.110.77.16/config.json` 应能看到 JSON。  
页面左下角应显示 **「服务端模型」** 绿点，且能正常对话。

## 本机更新前端

```powershell
cd D:\dev\learning-assistant
npm run build
scp -r D:\dev\learning-assistant\dist\* root@47.110.77.16:/var/www/learning-assistant/
```

`config.json` 在服务器上独立维护，**不必**每次打包都上传。

## 安全说明

- API Key 只存在于 Nginx 配置（建议 `chmod 600`，仅 root 可读）
- 任何人拿到链接都能消耗你的 API 额度 → 勿公开传播，或再加访问密码（后续可做）
- 对话记录仍在各自浏览器，不会互相看到

## 多人同时使用

可以同时使用。每人浏览器各自一份对话状态；并发请求由 lemonapi 侧处理。
