import { InputError } from "./validation.ts";

export const LIMITED_VIDEO_MODEL = "dreamina-seedance-2-5-260628";
export const VIDEO_SECONDS_LIMIT = 30;
export const VIDEO_MIN_SECONDS = 4;

// Successful usage is latched by database triggers; a later expiry or delete
// must not restore it. Unknown submissions remain reserved until resolved.
const matchingModel = `json_extract(request,'$.model')='${LIMITED_VIDEO_MODEL}'`;
const pendingSeconds = "CASE WHEN quota_seconds=0 AND status<>'failed' THEN MAX(0,CAST(COALESCE(json_extract(request,'$.duration'),0) AS INTEGER)) ELSE 0 END";
export const VIDEO_QUOTA_SQL = `SELECT COALESCE(SUM(quota_seconds),0) AS used, COALESCE(SUM(${pendingSeconds}),0) AS reserved FROM jobs WHERE ${matchingModel}`;
// The check and reservation are a single SQLite write, preventing concurrent
// clients or API keys from each spending the same remaining seconds.
export const INSERT_VIDEO_WITH_QUOTA_SQL = `INSERT INTO jobs (id,owner,status,request,result,created,updated)
 SELECT ?,?,?,?,?,?,? WHERE ?<>'${LIMITED_VIDEO_MODEL}' OR
 (SELECT COALESCE(SUM(quota_seconds + (${pendingSeconds})),0) FROM jobs WHERE ${matchingModel}) + ? <= ${VIDEO_SECONDS_LIMIT}`;

export type VideoQuota = {limit: number; used: number; reserved: number; remaining: number; disabled: boolean; unavailable: boolean};
export function videoQuota(row: {used: number; reserved: number}): VideoQuota {
  const used = Math.max(0, Number(row.used) || 0), reserved = Math.max(0, Number(row.reserved) || 0);
  const remaining = Math.max(0, VIDEO_SECONDS_LIMIT - used - reserved);
  return {limit: VIDEO_SECONDS_LIMIT, used, reserved, remaining, disabled: used >= VIDEO_SECONDS_LIMIT, unavailable: remaining < VIDEO_MIN_SECONDS};
}
export function videoQuotaMessage(quota: VideoQuota, duration = VIDEO_MIN_SECONDS) {
  if (quota.disabled) return `senndance2.5 累计生成已达 ${quota.limit} 秒，模型已禁用。`;
  if (quota.remaining < duration) return `senndance2.5 剩余 ${quota.remaining} 秒${quota.reserved ? `（生成中预占 ${quota.reserved} 秒）` : ""}，不足以生成 ${duration} 秒视频。`;
  return "";
}
export function assertVideoQuota(quota: VideoQuota, duration: number) {
  const message = videoQuotaMessage(quota, duration);
  if (message) throw new InputError(message, 409);
}
