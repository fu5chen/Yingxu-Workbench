import { InputError, MIB, REFERENCE_IMAGE_MAX_BYTES, httpsUrl, type parseGeneration } from "./validation.ts";
import { Buffer } from "node:buffer";
import type { PortraitFields } from "./portrait-state.ts";
import { activePortraitReference } from "./portrait-state.ts";

export const BYTEPLUS_INLINE_LIMIT = 12 * MIB;
type Asset = { kind: string; mime: string; size: number; url: string };
type PortraitLibrary = { project: string; group: string };

export function assertBytePlusPortraits(assets: (Asset & PortraitFields)[], library?: PortraitLibrary) {
  for (const asset of assets) {
    if (asset.kind !== 'image' || (!asset.ark_id && (!asset.ark_status || asset.ark_status === 'NotImported'))) continue;
    if (['Uploading', 'Processing', 'Unknown'].includes(asset.ark_status ?? '')) throw new InputError('虚拟角色正在入库审核，请等到“入库成功”后再生成。', 409);
    if (['Blocked', 'Failed'].includes(asset.ark_status ?? '')) throw new InputError('虚拟角色尚未入库成功，请查看参考图片的入库状态和原因。', 409);
    if (!library) throw new InputError('虚拟素材库配置暂不可用，无法核对资产 ID，请联系管理员。', 503);
    activePortraitReference(asset, library.project, library.group);
  }
}

export async function prepareBytePlusReferences<T extends Asset & PortraitFields>(
  assets: T[],
  readLocal: (asset: T) => Promise<Uint8Array>,
  library?: { project: string; group: string; reference: (asset: T) => Promise<string> },
) {
  validateBytePlusAssets(assets, true);
  assertBytePlusPortraits(assets, library);
  const images: string[] = [], videos: string[] = [], audios: string[] = [];
  for (const asset of assets) {
    if (asset.kind === "video") { videos.push(httpsUrl(asset.url)); continue; }
    if (asset.kind === "image" && library && asset.ark_status === "Active" &&
      asset.ark_id && asset.ark_project === library.project && asset.ark_group === library.group) {
      // Existing trusted references still require a fresh status check.
      // A failed status check is surfaced, never retried with the original image.
      images.push(await library.reference(asset));
      continue;
    }
    const mime = asset.mime === "audio/mpeg" ? "audio/mp3" : asset.mime;
    const url = `data:${mime};base64,${Buffer.from(await readLocal(asset)).toString("base64")}`;
    (asset.kind === "image" ? images : audios).push(url);
  }
  return { images, videos, audios };
}

export function validateBytePlusAssets(assets: (Asset & PortraitFields)[], assetReferences = false) {
  let inlineBytes = 0;
  for (const asset of assets) {
    if (asset.kind === 'image' && asset.size >= REFERENCE_IMAGE_MAX_BYTES) throw new InputError('单张参考图片须小于 30 MB。', 413);
    if (asset.kind === "video") {
      if (asset.mime !== "video/remote") throw new InputError("视频参考请使用可公开访问的 MP4 / MOV 链接，移除本地视频后重新添加链接。");
      httpsUrl(asset.url);
    } else {
      if (!(assetReferences && asset.kind === 'image' && (asset.ark_id || asset.ark_status && asset.ark_status !== 'NotImported'))) inlineBytes += asset.size;
      const allowed = asset.kind === "image" ? ["image/jpeg", "image/png", "image/webp"] : ["audio/mpeg", "audio/wav"];
      if (!allowed.includes(asset.mime)) throw new InputError("参考图片支持 JPG / PNG / WebP，参考音频支持 MP3 / WAV。");
    }
  }
  if (inlineBytes > BYTEPLUS_INLINE_LIMIT) throw new InputError("此私人站点的本地图片与音频参考合计上限为 12 MiB，请压缩后重试。", 413);
}

export function bytePlusPayload(parsed: ReturnType<typeof parseGeneration>, images: string[], videos: string[], audios: string[]) {
  const content = [
    { type: "text", text: parsed.prompt.replace(/@图片(\d+)/g, "@Image$1").replace(/@视频(\d+)/g, "@Video$1").replace(/@音频(\d+)/g, "@Audio$1") },
    ...images.map(url => ({ type: "image_url", image_url: { url }, role: "reference_image" })),
    ...videos.map(url => ({ type: "video_url", video_url: { url }, role: "reference_video" })),
    ...audios.map(url => ({ type: "audio_url", audio_url: { url }, role: "reference_audio" })),
  ];
  return {
    model: parsed.model, content, resolution: parsed.resolution,
    ratio: parsed.aspect_ratio, duration: parsed.duration,
    generate_audio: parsed.generate_audio, watermark: false,
    ...(parsed.model === "dreamina-seedance-2-5-260628" && images.length + videos.length + audios.length ? { omni_reference_task_type: "reference" } : {}),
  };
}
