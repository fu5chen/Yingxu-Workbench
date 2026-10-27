import { H3_MODES, parseH3Mode } from './hyaloria-options.ts';
export const MODELS = {
  "h3": {
    provider: "hyaloria", name: "Hyaloria-H3 MAX", shortName: "Hyaloria-H3 MAX",
    resolution: "3MP", resolutions: ["3MP","768P","480P"] as const,
    ratios: ["2:3", "3:2", "3:4", "4:3", "1:1", "9:16", "16:9", "21:9"] as const,
    price: "按账户每秒计费，视频参考按 2 倍计费", minDuration: 5, maxDuration: 30, fixedDuration: null,
    minImages: 0, maxImages: 9, maxAudios: 3, maxVideos: 3,
    discouragedDurations: [] as readonly number[],
  },
  "dreamina-seedance-2-5-260628": {
    provider: "byteplus", name: "senndance2.5", shortName: "senndance2.5",
    resolution: "720p", resolutions: ["480p", "720p", "1080p"] as const,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"] as const,
    price: "按账户用量计费", minDuration: 4, maxDuration: 30, fixedDuration: null,
    minImages: 0, maxImages: 30, maxAudios: 10, maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
  "dreamina-seedance-2-0-260128": {
    provider: "byteplus", name: "Seedance 2.0", shortName: "2.0",
    resolution: "720p", resolutions: ["480p", "720p", "1080p", "4k"] as const,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"] as const,
    price: "按账户用量计费", minDuration: 4, maxDuration: 15, fixedDuration: null,
    minImages: 0, maxImages: 9, maxAudios: 3, maxVideos: 3,
    discouragedDurations: [] as readonly number[],
  },
  "lec-sz-sd2-full-480p": {
    provider: "paipu",
    name: "Seedance 2.5 480p（SZ）",
    shortName: "480p · SZ",
    resolution: "480p",
    resolutions: ["480p"] as const,
    ratios: ["16:9", "9:16"] as const,
    price: null,
    minDuration: 4,
    maxDuration: 30,
    fixedDuration: null,
    minImages: 1,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 0,
    discouragedDurations: [] as readonly number[],
  },
  "lec-ac-seedance-2-5-all-reference": {
    provider: "paipu",
    name: "Seedance 2.5 全能参考（AC）",
    shortName: "720p · AC",
    resolution: "720p",
    resolutions: ["720p"] as const,
    ratios: ["16:9", "9:16", "1:1"] as const,
    price: "¥4.20 / 次",
    minDuration: 4,
    maxDuration: 30,
    fixedDuration: null,
    minImages: 1,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 0,
    discouragedDurations: [5, 10, 15] as readonly number[],
  },
  "lec-seedance-2-5-30s": {
    provider: "paipu",
    name: "Seedance 2.5（HN）",
    shortName: "720p · HN",
    resolution: "720p",
    resolutions: ["720p"] as const,
    ratios: ["16:9"] as const,
    price: "¥4.00 / 次",
    minDuration: 30,
    maxDuration: 30,
    fixedDuration: 30,
    minImages: 1,
    maxImages: 30,
    maxAudios: 0,
    maxVideos: 0,
    discouragedDurations: [] as readonly number[],
  },
  "lec-gt-seedance-2-5-720p": {
    provider: "paipu",
    name: "Seedance 2.5 满血（官渠）",
    shortName: "官渠 · GT",
    resolution: "720p",
    resolutions: ["480p", "720p", "1080p"] as const,
    ratios: ["16:9", "9:16"] as const,
    price: "¥0.67–2.39 / 秒",
    minDuration: 12,
    maxDuration: 30,
    fixedDuration: null,
    minImages: 1,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
  "lec-seedance-2-0-933-stable": {
    provider: "paipu",
    name: "Seedance 2.0 933（稳定）",
    shortName: "933 · 稳定",
    resolution: "480p",
    resolutions: ["480p", "720p"] as const,
    ratios: ["16:9", "9:16"] as const,
    price: "¥2.20–3.50 / 次",
    minDuration: 4,
    maxDuration: 15,
    fixedDuration: null,
    minImages: 1,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
  "seedance-2.5-nsfw": {
    provider: "modelflare",
    name: "Seedance 2.5 NSFW",
    shortName: "NSFW",
    resolution: "720p",
    resolutions: ["480p", "720p", "1080p"] as const,
    ratios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const,
    price: "Token 计费",
    minDuration: 4,
    maxDuration: 30,
    fixedDuration: null,
    minImages: 0,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
  "doubao-seedance-2-0-filter-off": {
    provider: "linkomobile",
    name: "Seedance 2.0 Filter Off",
    shortName: "2.0",
    resolution: "720p",
    resolutions: ["480p", "720p"] as const,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"] as const,
    price: "以账户计费为准",
    minDuration: 5,
    maxDuration: 15,
    fixedDuration: null,
    minImages: 0,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
  "dreamina-seedance-2-5-filter-off": {
    provider: "linkomobile",
    name: "Dreamina Seedance 2.5 Filter Off",
    shortName: "2.5",
    resolution: "720p",
    resolutions: ["480p", "720p"] as const,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"] as const,
    price: "以账户计费为准",
    minDuration: 5,
    maxDuration: 15,
    fixedDuration: null,
    minImages: 0,
    maxImages: 30,
    maxAudios: 10,
    maxVideos: 10,
    discouragedDurations: [] as readonly number[],
  },
} as const;
export const GT_PRICING = {
  withoutVideo: { "480p": 0.67, "720p": 1.30, "1080p": 2.10 },
  withVideo: { "480p": 0.90, "720p": 1.59, "1080p": 2.39 },
} as const;
export const STABLE_933_PRICING = { "480p": 2.20, "720p": 3.50 } as const;
export type ModelId = keyof typeof MODELS;
export const DEFAULT_MODEL: ModelId = "dreamina-seedance-2-5-260628";
export const MODEL = DEFAULT_MODEL;
export const MIB = 1024 * 1024;
export const REFERENCE_IMAGE_MAX_BYTES = 30 * MIB;
export class InputError extends Error { status:number; constructor(message: string, status = 400) { super(message); this.status=status; } }
export function linkoDurationFields(duration:number) {
  if (!Number.isInteger(duration) || duration < 1) throw new InputError("视频时长必须是正整数秒。");
  return { duration, seconds:String(duration), metadata:{duration} } as const;
}
export function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) throw new InputError("请填写有效的 HTTPS 链接。");
  let u: URL; try { u = new URL(value.trim()); } catch { throw new InputError("请填写有效的 HTTPS 链接。"); }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || !h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(h)) throw new InputError("素材必须是可公开访问的 HTTPS 文件链接。");
  return u.href;
}
export function parseGeneration(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== "object") throw new InputError("请求格式错误。");
  const model = (b.model ?? DEFAULT_MODEL) as ModelId;
  if (!Object.prototype.hasOwnProperty.call(MODELS, model)) throw new InputError("请选择支持的 Seedance 模型。");
  const spec = MODELS[model];
  const h3_mode=model==='h3'?parseH3Mode(b.h3_mode):undefined,modeSpec=h3_mode?H3_MODES[h3_mode]:null;
  const resolution = b.resolution ?? modeSpec?.resolution??spec.resolution;
  if (!((modeSpec?.resolutions??spec.resolutions) as readonly unknown[]).includes(resolution)) throw new InputError(`${spec.name} 当前模式支持 ${(modeSpec?.resolutions??spec.resolutions).join(' / ')}。`);
  if (typeof b.prompt !== "string" || !b.prompt.trim() || Array.from(b.prompt).length > 8000) throw new InputError("请填写 1–8000 个字符的画面描述。");
  const duration = b.duration === undefined ? (["byteplus","hyaloria"].includes(spec.provider) ? 5 : 30) : b.duration;
  const maximumDuration=modeSpec?.maxDuration??spec.maxDuration;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < spec.minDuration || duration > maximumDuration) throw new InputError(`时长必须是 ${spec.minDuration}–${maximumDuration} 秒的整数。`);
  if (spec.fixedDuration !== null && duration !== spec.fixedDuration) throw new InputError(`${spec.name} 固定输出 ${spec.fixedDuration} 秒。`);
  const ratio = b.aspect_ratio ?? (model==='h3'?'2:3':"16:9");
  if (!(spec.ratios as readonly unknown[]).includes(ratio)) throw new InputError(`${spec.name} 不支持这个画面比例。`);
  const images = b.images??(model==='h3'?[]:undefined), audios = b.audios ?? [], videos = b.videos ?? [];
  if (!Array.isArray(images) || images.length < spec.minImages || images.length > spec.maxImages || !images.every(x => typeof x === "string")) throw new InputError(spec.minImages ? `必须提供 ${spec.minImages}–${spec.maxImages} 张参考图片。` : `参考图片最多 ${spec.maxImages} 张。`);
  if (!Array.isArray(audios) || audios.length > spec.maxAudios || !audios.every(x => typeof x === "string")) throw new InputError(spec.maxAudios ? `音频参考最多 ${spec.maxAudios} 个。` : `${spec.name} 不支持音频参考。`);
  if (spec.maxVideos === 0 && Array.isArray(b.videos) && b.videos.length > 0) throw new InputError(`${spec.name} 不支持视频参考。`);
  if (!Array.isArray(videos) || videos.length > spec.maxVideos || !videos.every(x => typeof x === "string")) throw new InputError(spec.maxVideos ? `视频参考最多 ${spec.maxVideos} 个。` : `${spec.name} 不支持视频参考。`);
  if (model === "dreamina-seedance-2-0-260128" && audios.length && !images.length && !videos.length) throw new InputError("Seedance 2.0 的音频参考需要搭配至少一张图片或一个视频。");
  if(model==='h3'&&audios.length&&!images.length&&!videos.length)throw new InputError('H3 音频参考需要搭配至少一张图片或一个视频。');
  if(b.seed!==undefined&&!Number.isSafeInteger(b.seed))throw new InputError('随机种子必须为整数。');
  const total = images.length + videos.length + audios.length, maximum = spec.maxImages + spec.maxVideos + spec.maxAudios;
  if (total > maximum) throw new InputError(`当前模型参考素材合计最多 ${maximum} 个。`);
  if (new Set([...images, ...videos, ...audios]).size !== total) throw new InputError("请勿重复选择同一素材。");
  if (b.generate_audio !== undefined && typeof b.generate_audio !== "boolean") throw new InputError("音频生成选项必须为布尔值。");
  return { generate_audio: b.generate_audio !== false, model, prompt: b.prompt.trim(), duration, resolution: resolution as "480p"|"720p"|"1080p"|"4k"|"3MP"|"768P"|"480P", aspect_ratio: ratio as "21:9"|"16:9"|"4:3"|"1:1"|"3:4"|"9:16"|"adaptive"|"2:3"|"3:2", images: images as string[], videos: videos as string[], audios: audios as string[],...(h3_mode?{h3_mode}:{}),...(b.seed!==undefined?{seed:b.seed as number}:{}) };
}
export function detectMedia(bytes: Uint8Array, kind: string, name: string) {
  if (!bytes.length) throw new InputError("不能上传空文件。");
  if (kind !== "image" && kind !== "audio" && kind !== "video") throw new InputError("仅支持图片、视频和音频参考。");
  const limit = kind === "image" ? 30 : kind === "audio" ? 30 : 100;
  if (kind === 'image' ? bytes.length >= REFERENCE_IMAGE_MAX_BYTES : bytes.length > limit * MIB) throw new InputError(kind === "image" ? "单张参考图片须小于 30 MB。" : kind === "audio" ? "音频上传服务限制为每个 30 MiB。" : "视频上传服务限制为每个 100 MiB。", 413);
  const s = (start: number, len: number) => String.fromCharCode(...bytes.slice(start, start + len));
  if (kind === "image") {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if (s(1, 3) === "PNG" && bytes[0] === 137) return "image/png";
    if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
    throw new InputError("图片仅支持 JPEG、PNG、WebP，文件内容必须与格式一致。", 415);
  }
  if (kind === "audio") {
    if (s(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
    if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return "audio/wav";
    if (s(0, 4) === "OggS" && (s(0, Math.min(512, bytes.length)).includes("OpusHead") || s(0, Math.min(512, bytes.length)).includes("vorbis"))) return "audio/ogg";
    if (s(4, 4) === "ftyp" && /\.m4a$/i.test(name) && s(8, 4) === "M4A ") return "audio/mp4";
    throw new InputError("音频支持 MP3、WAV、Ogg 和 M4A；不支持视频文件。", 415);
  }
  if (kind === "video") {
    if (s(4, 4) === "ftyp" && /\.(mp4|mov)$/i.test(name)) return /\.mov$/i.test(name) ? "video/quicktime" : "video/mp4";
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && /\.webm$/i.test(name)) return "video/webm";
    throw new InputError("视频支持 MP4、MOV 和 WebM，文件内容必须与格式一致。", 415);
  }
  throw new InputError("素材格式不受支持。", 415);
}
export function normalizeTask(raw: any) {
  const d = raw?.data && typeof raw.data === "object" ? raw.data : raw?.result && typeof raw.result === "object" ? raw.result : raw?.output && typeof raw.output === "object" ? raw.output : raw;
  const upstream = d?.id ?? d?.task_id ?? d?.job_id ?? raw?.task_id ?? raw?.id;
  const status = String(d?.status ?? d?.state ?? d?.task_status ?? raw?.status ?? "unknown").toLowerCase();
  const normalized = ["completed","succeeded","success","done","finished"].includes(status) ? "completed" : ["failed","error","cancelled","canceled","expired"].includes(status) ? "failed" : ["queued","pending","submitted","created"].includes(status) ? "queued" : ["in_progress","processing","running","generating"].includes(status) ? "in_progress" : "unknown";
  const candidate = d?.content?.video_url ?? d?.url ?? d?.result_url ?? d?.video_url ?? d?.metadata?.url ?? d?.result?.url ?? d?.output?.url ?? d?.video?.url ?? raw?.url;
  let url: string | undefined; if (typeof candidate === "string") { try { url = httpsUrl(candidate); } catch {} }
  const progress = typeof d?.progress === "number" ? Math.max(0, Math.min(100, d.progress)) : null;
  return { upstream: typeof upstream === "string" ? upstream : undefined, status: normalized, progress, url, error: typeof d?.error?.message === "string" ? d.error.message.slice(0,500).replace(/(?:sk-[\w-]+|VxCg[\w.-]+)/g,"[已隐藏]") : normalized === "failed" ? "生成失败，请检查素材和提示词后重新创建。" : undefined };
}
