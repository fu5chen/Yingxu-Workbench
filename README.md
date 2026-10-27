# 映序工作台 · Yingxu Workbench

图片、视频和对话创作工作台，包含参考素材上传、提示词优化、后台生成队列、生成历史、结果预览和下载。

使用 React、Vinext / Vite 构建界面，配合本地运行时、数据库和对象存储。数据库和素材保存在项目目录，模型生成需要自行配置有效的 API Key。

## 快速开始

需要 **Node.js 22.13 或更高版本（推荐 Node.js 24）**、npm 和 Git。视频缩略图可选安装 FFmpeg，并加入 PATH。

```sh
git clone https://github.com/fu5chen/Yingxu-Workbench.git
cd Yingxu-Workbench
npm run install:ci
npm run setup
```

`setup` 会复制空白配置、构建应用、生成本机随机凭据，并应用数据库迁移。已有配置不会被模板覆盖。然后编辑根目录的 **`confiykey.json`**，填入自己的 Key 和所需存储配置。

```sh
npm run start:local
```

打开 **http://127.0.0.1:5181/**。此地址用于可信本机访问，启动器只监听回环地址。按 Ctrl+C 停止本次启动的服务。5181 / 5191 已被占用时启动器会退出，请先停止已有实例。

启动器同时运行工作台、Key 配置网关和后台任务服务。仅执行 `npm run dev` 或 `npm start` 不会启动全部生成流程。修改 API Key 后新任务读取最新配置；修改存储设置后重启 `start:local`。

## 配置

| 文件 | 用途 | 是否提交 Git |
| --- | --- | --- |
| `confiykey.example.json` | 空白 API Key、素材库和存储配置模板 | 是 |
| `confiykey.json` | 自行填写的私有配置 | 否 |
| `.env.example` | 后台令牌、归档与磁盘保护模板 | 是 |
| `.env` | 本机令牌和运行设置 | 否 |
| `.openai/hosting.json` | 通用 DB / BUCKET 绑定名称，无真实云资源 ID | 是 |
| `.sites-runtime/` | 随机登录信息、运行配置、缓存与日志 | 否 |
| `.wrangler/` | 本地数据库与素材对象 | 否 |

详见 [配置字段](docs/configuration.md) 和 [HTTPS 部署说明](docs/deployment.md)。仓库不包含可用 Key、原部署服务器信息、原用户记录、素材、备份或构建产物。

## 模型与使用限制

- **Hyaloria-文生图片**：纯文字生成图片。
- **Hyaloria-图像编辑**：图片生成 / 参考图编辑。
- **Hyaloria-H3 MAX**：视频生成，支持各模式允许的图片、视频和音频参考。
- **senndance2.5**：视频生成，单条 4–30 秒。当前代码的**累计生成额度为 30 秒，整个部署共享**，常量在 `lib/video-quota.ts`；这是应用内累计时长限制，成功任务和待确认任务会占用额度。
- 对话模型负责文字回复、创作意图识别与提示词优化。

模型权限、费用与限制以实际接口配置为准。API Key 需与所配置接口匹配。工作台源码不包含独立的客户中转 API 后台，程序不会因为缺少权限而自动换用其他付费模型。

后台队列限制实际生成并发。提交结果不确定时保留“待确认”，避免重复付费；它不代表任务必然成功。此项目不是多租户计费系统，外网网关使用共享管理员账号，浏览器工作区 ID 不等同于独立客户账户。

## 开发与检查

```sh
npm test
npm run typecheck
npm run build
```

`npm run dev` 用于界面开发，默认端口 5173；完整任务联调使用构建后的 `npm run start:local`。代码更新后停止旧进程，执行 `npm run setup` 再启动。迁移会记录执行状态，可再次运行 `npm run db:migrate`，不要手动重复执行 ALTER TABLE SQL。

## 数据与维护

`.wrangler/state` 保存本地数据库和素材；`.env` 中的加密密钥用于读取未完成任务的凭据。备份和迁移时应一起保留这些私有数据以及 `confiykey.json`、`.sites-runtime/external-access/`，不要上传 GitHub。

模板默认 `STUDIO_LOCAL_ARCHIVE=false`，不额外复制一份生成原件到 `opout/`。素材缓存、数据库和云存储仍会增长，需要监控磁盘空间。开启归档前先规划容量和清理策略。

`build/`、`vendor/` 中保留了第三方代码及其许可证。其他依赖的许可证以对应包声明为准。

上传改动前运行 `git add` 和 `npm run check:public`，检查暂存内容是否误含私有文件或常见凭据。该检查不能代替人工审查。测试中的 Key 为明确标记的虚构数据。
