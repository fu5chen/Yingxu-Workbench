import { InputError, MIB, REFERENCE_IMAGE_MAX_BYTES, detectMedia } from "./validation.ts";
export function clipboardFiles(data:Pick<DataTransfer,'files'|'items'>):File[]{
 const files=Array.from(data.files);return files.length?files:Array.from(data.items).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
}

export function uploadRequest(file: File, id: string): RequestInit {
  // Raw bodies avoid Vinext's 1 MiB progressive-form-action limit.
  return { method: "POST", headers: {
    "Content-Type": "application/octet-stream",
    "X-File-Name": encodeURIComponent(file.name),
    "Idempotency-Key": id,
  }, body: file };
}

async function readBytes(request: Request, maximum: number) {
  if (!request.body) throw new InputError("素材文件为空。");
  const length = Number(request.headers.get("content-length"));
  if (length > maximum) throw new InputError("素材文件超过大小限制。", 413);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new InputError("素材文件超过大小限制。", 413);
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export async function readUpload(request: Request, kind: string | null) {
  if (!kind || !["image", "audio", "video"].includes(kind)) throw new InputError("仅支持图片、视频和音频参考。");
  const maximum = kind === 'image' ? REFERENCE_IMAGE_MAX_BYTES - 1 : (kind === "audio" ? 30 : 100) * MIB;
  const contentType = request.headers.get("content-type") ?? "";
  let content: Uint8Array, name: string;
  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    const bytes = await readBytes(request, maximum + 65536);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new InputError("上传格式无效，请重新选择素材。"); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) throw new InputError("每次请求应包含一个素材文件。");
    name = files[0].name;
    content = new Uint8Array(await files[0].arrayBuffer());
  } else {
    try { name = decodeURIComponent(request.headers.get("x-file-name") ?? ""); }
    catch { throw new InputError("素材文件名格式错误。"); }
    content = await readBytes(request, maximum);
  }
  if (!name.trim() || /[\u0000-\u001f]/.test(name)) throw new InputError("素材文件名格式错误。");
  if (!content.byteLength) throw new InputError("素材文件为空。");
  if (content.byteLength > maximum) throw new InputError("素材文件超过大小限制。", 413);
  return { content, name: name.slice(0, 180), size: content.byteLength, kind, mime: detectMedia(content, kind, name) };
}
