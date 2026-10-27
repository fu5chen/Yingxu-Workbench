import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { InputError } from "./validation.ts";

export function runnerAuthorized(value: string | null, expected?: string) {
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function encryptionKey(secret?: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new InputError("后台任务服务未就绪，请联系管理员。", 503);
  return Buffer.from(secret, "hex");
}
export function sealTaskKey(value: string, scope: string, secret?: string) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(secret),iv);
  cipher.setAAD(Buffer.from(scope));
  const bytes=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv,bytes,cipher.getAuthTag()].map(part=>part.toString("base64url")).join(".");
}
export function openTaskKey(value: string, scope: string, secret?: string) {
  const parts=value.split(".");if(parts.length!==3)throw new InputError("后台任务凭据不可读取，请联系管理员。",503);
  const [iv,bytes,tag]=parts.map(part=>Buffer.from(part,"base64url"));
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(secret),iv);
  decipher.setAAD(Buffer.from(scope));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes),decipher.final()]).toString("utf8");
}
