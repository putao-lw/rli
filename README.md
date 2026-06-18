# 日历同步

一个简洁的日历同步项目：网页端显示日历，手机端 APK 登记某天要做的事情，数据保存到服务器后会实时推送到网页端。

## 功能

- 服务端端口默认 `14785`
- 网页端暖色调日历，支持实时显示同步结果
- 网页端显示农历、常用节假日和事项时间
- Android 端可配置服务器地址，并检查连接状态
- Android 端可登记日期、时间、轻重缓急、事项和备注
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
```

健康检查接口：

```text
http://localhost:14785/api/health
```

## 云服务器部署

1. 安装 Node.js 18 或更新版本。
2. 上传项目代码。
3. 在项目目录执行：

```bash
npm install --omit=dev
PORT=14785 npm start
```

4. 云服务器安全组和系统防火墙放行 `14785` 端口。
5. 手机 APK 里填写服务器地址，例如：

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
