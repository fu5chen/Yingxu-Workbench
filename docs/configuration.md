# 配置字段

首次运行 `npm run setup` 会从模板创建私有配置。也可自行复制 `confiykey.example.json` 为 `confiykey.json`、`.env.example` 为 `.env`。不要把真实值填入带 example 的模板。

## 模型 Key

`confiykey.json` 的 `apiKeys` 字段：

| 字段 | 模型 / 服务 | 当前适配器地址 |
| --- | --- | --- |
| `h3` | Hyaloria-H3 MAX | `https://asop.uk/api/hyaloria/v1` |
| `krea2` | Hyaloria-文生图片 | `https://asop.uk/api/hyaloria/v1` |
| `seedance25` | BytePlus 视频 | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| `seedream50Pro` | BytePlus 图片 | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| `chat` | 对话与提示词优化 | `https://api.paipu.net` |
| `legacyVideo1` | 兼容视频接口一 | `https://api.paipu.net` |
| `legacyVideo2` | 兼容视频接口二 | `https://modelflare.dev` |
| `legacyImageVideo` | 兼容图片视频接口 | `https://settle.linkomobile.com` |

只填写要使用的模型；空字段会显示未配置。H3 和 Krea2 使用独立字段。适配器同时校验 Key 格式与上游响应；接口地址不同的中转平台不一定兼容。如需更换服务商，应检查 `lib/server.ts` 的接口契约、鉴权格式、模型名称和参考素材要求。

## OSS 与参考素材

`oss` 中填写自己的 `region`（例如 `oss-cn-hangzhou`）、`bucket`、`accessKeyId` 和 `accessKeySecret`。这些都是可选配置项，没有绑定原作者的阿里云账号。

H3 的本地参考素材需要可供上游读取的 HTTPS 链接。私有 OSS 用于上传并签名，生成结果转存和缩略图加速也需要完整 OSS 配置。缺少配置时，相关功能会不可用；仅填模型 Key 不代表参考素材上传和结果加速都已接通。桶应保持私有，账号需具有所使用对象的读写权限。

## 可选 BytePlus 素材库

`byteplusAssets` 用于需要素材入库的场景：

- `accessKeyId` / `secretAccessKey`：素材服务及存储访问凭据。
- `project`：自己视频 API Key 所属项目名称。
- `groupId`：自己项目内的素材分组 ID。
- `tosBucket`：可选的私有 TOS 桶；已完整配置 OSS 时优先使用 OSS。

本项目不会创建云账号或自动开通权限。配置检查只判断字段齐全，项目与分组归属仍由上游校验。已有资产只有通过状态和归属检查后才使用 `asset://ID`。虚拟素材库不能代替真人授权审核。

## 运行设置

`.env` 的 `STUDIO_RUNNER_TOKEN` 和 `JOB_ENCRYPTION_KEY` 由初始化脚本生成。不要在重启时更换，否则已排队任务可能无法解密。`FFMPEG_PATH` 可指定 FFmpeg 可执行文件。

`STUDIO_LOCAL_ARCHIVE=false` 关闭 `opout/` 额外原件副本。`STUDIO_SUBMIT_RESERVE_MIB` 和 `STUDIO_MEDIA_RESERVE_MIB` 分别控制提交与媒体缓存所需剩余磁盘空间，单位 MiB。`start:local` 会把这些设置传给子进程；如果用系统服务分别启动组件，需给网关和后台进程配置相同环境变量。

生产环境不提供“1000 个同时实际生成”的保证；本地队列和服务商并发额度是两层限制。不要直接提高并发来处理超时或磁盘不足。
