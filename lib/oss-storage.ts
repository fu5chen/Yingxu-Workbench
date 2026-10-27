import { createHash, createHmac } from "node:crypto";
import { InputError } from "./validation.ts";

export type OssEnvironment = {
  OSS_REGION?: string; OSS_BUCKET?: string;
  OSS_ACCESS_KEY_ID?: string; OSS_ACCESS_KEY_SECRET?: string;
};
export function ossConfigured(env: OssEnvironment) {
  return Boolean(env.OSS_REGION && env.OSS_BUCKET && env.OSS_ACCESS_KEY_ID && env.OSS_ACCESS_KEY_SECRET);
}
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Uint8Array, value: string) => createHmac("sha256", key).update(value).digest();

// OSS Signature V4 query signing, compatible with Worker fetch (no Node HTTP SDK).
export function signOssUrl(env: OssEnvironment, key: string, method: "GET" | "PUT" | "DELETE", expires: number, headers: Record<string, string> = {}, now = new Date(), responseHeaders: Record<string,string> = {}) {
  if (!ossConfigured(env)) throw new InputError("素材存储配置不完整。", 503);
  const region = env.OSS_REGION!.replace(/^oss-/, ""), bucket = env.OSS_BUCKET!;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new InputError("素材存储地域或桶名格式错误。", 503);
  if (!key || key.startsWith("/") || key.split("/").some(p => p === "." || p === "..")) throw new InputError("素材存储路径无效。");
  if (!Number.isInteger(expires) || expires < 1 || expires > 604800) throw new InputError("素材链接有效期无效。");
  if(Object.keys(responseHeaders).some(name=>!['response-content-disposition','response-content-type','response-cache-control'].includes(name)))throw new InputError("下载响应参数无效。");
  const host = `${bucket}.oss-${region}.aliyuncs.com`;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const scope = `${date.slice(0, 8)}/${region}/oss/aliyun_v4_request`;
  const values: Record<string, string> = {
    ...responseHeaders,
    "x-oss-additional-headers": "host",
    "x-oss-credential": `${env.OSS_ACCESS_KEY_ID}/${scope}`,
    "x-oss-date": date, "x-oss-expires": String(expires), "x-oss-signature-version": "OSS4-HMAC-SHA256",
  };
  const query = Object.keys(values).sort().map(k => `${encode(k)}=${encode(values[k])}`).join("&");
  const signedHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  signedHeaders.host = host;
  const canonicalHeaders = Object.keys(signedHeaders).sort().map(k => `${k}:${signedHeaders[k]}\n`).join("");
  const encodedKey = key.split("/").map(encode).join("/");
  const canonical = `${method}\n/${bucket}/${encodedKey}\n${query}\n${canonicalHeaders}\nhost\nUNSIGNED-PAYLOAD`;
  const signingKey = hmac(hmac(hmac(hmac(`aliyun_v4${env.OSS_ACCESS_KEY_SECRET}`, date.slice(0, 8)), region), "oss"), "aliyun_v4_request");
  const signature = hmac(signingKey, `OSS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString("hex");
  return `https://${host}/${encodedKey}?${query}&x-oss-signature=${signature}`;
}

export async function uploadOssReference(env: OssEnvironment, id: string, mime: string, bytes: Uint8Array) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new InputError("素材编号无效。");
  const key = `yingxu-references/${id}`;
  const headers = { "content-type": mime, "x-oss-object-acl": "private" };
  let response: Response;
  try {
    response = await fetch(signOssUrl(env, key, "PUT", 300, headers), {
      method: "PUT", headers, body: new Uint8Array(bytes).buffer, redirect: "manual", signal: AbortSignal.timeout(45000),
    });
  } catch { throw new InputError("素材存储传输中断，请重试入库。", 504); }
  if (!response.ok) {
    const code = (await response.text()).match(/<Code>([A-Za-z0-9_.-]+)<\/Code>/)?.[1] ?? "UploadFailed";
    throw new InputError(`素材存储上传失败（${response.status} / ${code}），请检查桶地域和对象写入权限。`, 502);
  }
  return signOssUrl(env, key, "GET", 604800);
}
