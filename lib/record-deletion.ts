import { InputError } from "./validation.ts";

// Deletion only changes visibility; status updates cannot resurrect a record.
export const DELETE_RECORD_SQL = "UPDATE jobs SET deleted_at=COALESCE(deleted_at,?) WHERE id=? AND owner=? AND COALESCE(json_extract(request,'$.kind'),'video')=?";
export const RESTORE_RECORD_SQL = "UPDATE jobs SET deleted_at=NULL WHERE id=? AND owner=? AND COALESCE(json_extract(request,'$.kind'),'video')=?";
export function recordKind(path: string): "image" | "video" {
  if (path === "images") return "image";
  if (path === "jobs") return "video";
  throw new InputError("不支持删除这种记录。", 400);
}
