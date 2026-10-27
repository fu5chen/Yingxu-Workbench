import { InputError } from "./validation.ts";

export type PortraitFields = {
  ark_id?: string | null; ark_group?: string | null; ark_project?: string | null;
  ark_status?: string | null; ark_error?: string | null; ark_updated?: number | null;
};
export function publicPortrait(asset: PortraitFields) {
  return { id: asset.ark_id ?? null, groupId: asset.ark_group ?? null,
    status: asset.ark_status ?? "NotImported", error: asset.ark_error ?? null };
}
export function activePortraitReference(asset: PortraitFields, project: string, group: string) {
  if (asset.ark_project !== project || asset.ark_group !== group) throw new InputError("参考图片所属素材项目不匹配，请重新入库。", 409);
  if (asset.ark_status !== "Active" || !asset.ark_id || !/^asset-[a-zA-Z0-9_-]+$/i.test(asset.ark_id)) {
    throw new InputError("参考图片尚未通过素材库处理，请等到显示“入库成功 · 可用于生成”再提交。", 409);
  }
  return `asset://${asset.ark_id}`;
}
