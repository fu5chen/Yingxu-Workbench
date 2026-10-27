import { ossConfigured, type OssEnvironment } from "./oss-storage.ts";

export type PortraitEnvironment = OssEnvironment & {
  BYTEPLUS_ACCESS_KEY_ID?: string; BYTEPLUS_SECRET_ACCESS_KEY?: string;
  BYTEPLUS_ASSET_GROUP_ID?: string; BYTEPLUS_ASSET_PROJECT?: string;
  BYTEPLUS_ASSET_TOS_BUCKET?: string;
};

export function describePortraitConfig(env: PortraitEnvironment) {
  const project = env.BYTEPLUS_ASSET_PROJECT?.trim() || "";
  const missing: string[] = [];
  if (!env.BYTEPLUS_ACCESS_KEY_ID || !env.BYTEPLUS_SECRET_ACCESS_KEY) missing.push("素材库 AK/SK");
  if (!env.BYTEPLUS_ASSET_GROUP_ID) missing.push(`${project} 素材分组`);
  if (!project) missing.push("素材项目名称（须与视频 API Key 所属项目一致）");
  const configured = missing.length === 0;
  const storage = ossConfigured(env) ? "oss" : env.BYTEPLUS_ASSET_TOS_BUCKET ? "tos" : null;
  const uploadReady = configured && Boolean(storage);
  return { configured, uploadReady, project, groupId: env.BYTEPLUS_ASSET_GROUP_ID ?? null,
    groupName: "映序视频素材", storage,
    message: missing.length ? `素材库尚未接通，缺少：${missing.join("、")}。视频 API Key 与素材库 AK/SK 分别配置。`
      : !uploadReady ? "素材分组已配置；还缺少有读写权限的素材存储，图片可直接生成，暂不能入库。"
      : "素材库配置已就绪，以每张图片的入库结果为准。",
  };
}
