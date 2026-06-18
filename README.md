# 日历同步

一个简洁的日历同步项目：网页端显示日历，手机端 APK 登记某天要做的事情，数据保存到服务器后会实时推送到网页端。

## 功能

- 展示日历端口默认 `14785`
- 登记管理端口默认 `14786`，网页上也能像 App 一样添加和取消事项
- 网页端暖色调日历，支持实时显示同步结果
- 网页端显示农历、常用节假日和事项时间段
- 时间段过期后不再显示在主日历格子里，点击日期仍可查看当天全部事项
- Android 端可配置服务器地址，并检查连接状态
- Android 端可登记日期、开始时间、结束时间、轻重缓急、事项和备注
- Android 端可取消已登记事项，网页端实时同步
- GitHub Actions 自动打包 Debug APK

## 本地运行服务器

```bash
npm install
npm start
```

打开：

```text
http://localhost:14785
http://localhost:14786
```

## 安装到手机或电脑

- iPhone / iPad：用 Safari 打开服务器地址，例如 `http://你的服务器IP:14786`，点分享按钮，选择“添加到主屏幕”。
- Windows 电脑：桌面上的 `Rli 日历展示.bat` 和 `Rli 日程登记.bat` 可以直接启动本地服务并打开软件窗口。
- 原生 iOS `.ipa` 需要 macOS、Xcode 和 Apple 签名；当前项目已提供免商店安装的 PWA 版本。

健康检查接口：

```text
http://localhost:14785/api/health
```

## 云服务器部署

1. 安装 Node.js 18 或更新版本。
2. 上传项目代码。
3. 配置邮件提醒环境变量：

```bash
export SMTP_HOST=smtp.qq.com
export SMTP_PORT=465
export SMTP_SECURE=true
export SMTP_USER=你的QQ或Foxmail邮箱
export SMTP_PASS=你的邮箱授权码
export MAIL_FROM='"日历同步" <你的QQ或Foxmail邮箱>'
export REMINDER_TO=提醒接收邮箱
export REMINDER_MINUTES=10,5
```

也可以把这些变量写到项目根目录的 `.env` 文件中，`.env` 不会提交到 Git。

4. 在项目目录执行：

```bash
npm install --omit=dev
PORT=14785 MANAGE_PORT=14786 npm start
```

5. 云服务器安全组和系统防火墙放行 `14785` 和 `14786` 端口。
6. 手机 APK 里填写服务器地址，例如：

```text
http://你的服务器IP:14785
```

如果有域名和 HTTPS，也可以填写：

```text
https://你的域名
```

## Android APK 打包

代码推送到 GitHub 仓库后，进入 GitHub：

```text
Actions -> Build Android APK -> Run workflow
```

或推送到 `main` / `master` 分支后自动运行。

打包完成后，在 workflow 的 Artifacts 里下载：

```text
rli-calendar-debug-apk
```

里面包含：

```text
app-debug.apk
```

## API

- `GET /api/health` 检查服务器
- `GET /api/events` 获取日程
- `POST /api/events` 新增日程
- `PUT /api/events/:id` 修改日程
- `DELETE /api/events/:id` 删除日程
- `GET /api/stream` 网页实时同步通道

日程数据保存在：

```text
data/events.json
```
