// This SDK build has no native CRC addon; requests still use Worker fetch below.
import { TosClient } from "@volcengine/tos-sdk/browser/index.js";
import { signArkRequest } from "./ark-signing";
import { activePortraitReference, publicPortrait, type PortraitFields } from "./portrait-state";
import { bucket, database, runtime } from "./server";
import { InputError } from "./validation";
import { describePortraitConfig } from "./portrait-config";
import { ossConfigured, uploadOssReference } from "./oss-storage";

type Asset = PortraitFields & { id: string; owner: string; name: string; kind: string; mime: string };
const REGION = "ap-southeast-1";
export function portraitConfig() {
  return describePortraitConfig(runtime);
}
function settings() {
  const config = portraitConfig();
  if (!config.configured) throw new InputError(config.message, 503);
  return { ak: runtime.BYTEPLUS_ACCESS_KEY_ID!, sk: runtime.BYTEPLUS_SECRET_ACCESS_KEY!,
    group: runtime.BYTEPLUS_ASSET_GROUP_ID!, project: config.project };
}
function safeError(value: unknown) {
  let message = value instanceof Error ? value.message : "素材入库失败";
  for (const secret of [runtime.BYTEPLUS_ACCESS_KEY_ID, runtime.BYTEPLUS_SECRET_ACCESS_KEY, runtime.OSS_ACCESS_KEY_ID, runtime.OSS_ACCESS_KEY_SECRET]) if (secret) message = message.replaceAll(secret, "[hidden]");
  return message.replace(/https?:\/\/\S+/g, "[临时链接]").slice(0, 500);
}
async function ark(action: string, params: Record<string, unknown>): Promise<any> {
  const { ak, sk, project } = settings(), body = JSON.stringify({ ...params, ProjectName: project });
  const signed = signArkRequest(action, body, ak, sk);
  let response: Response;
  try { response = await fetch(signed.url, { method: "POST", headers: signed.headers, body, redirect: "manual", signal: AbortSignal.timeout(25000) }); }
  catch (error) { console.error("Asset API connection", safeError(error)); throw new InputError("素材服务连接中断，正在保留提交状态，请刷新状态核对。", 504); }
  const raw = await response.json().catch(() => null) as any;
  const error = raw?.ResponseMetadata?.Error;
  if (!response.ok || error) throw new InputError(`素材库：${error?.Code ?? response.status}。${safeError(new Error(error?.Message ?? "请求未成功"))}`, response.status >= 400 && response.status < 500 ? response.status : 502);
  if (!raw?.Result) throw new InputError("素材服务未返回有效结果，请刷新状态核对。", 502);
  return raw.Result;
}
async function owned(id: string, owner: string) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new InputError("素材编号格式错误。");
  const asset = await database().prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(id, owner).first<Asset>();
  if (!asset || asset.kind !== "image" || !["image/png", "image/jpeg", "image/webp"].includes(asset.mime)) throw new InputError("找不到可入库的本地参考图片。", 404);
  return asset;
}
async function update(asset: Asset, status: string, error: string | null, upstream?: string) {
  await database().prepare("UPDATE assets SET ark_status=?,ark_error=?,ark_updated=?,ark_id=COALESCE(?,ark_id) WHERE id=? AND owner=?")
    .bind(status, error, Date.now(), upstream ?? null, asset.id, asset.owner).run();
  return { ...asset, ark_status: status, ark_error: error, ...(upstream ? { ark_id: upstream } : {}) };
}
async function uploadToTos(asset: Asset) {
  const { ak, sk } = settings(), tosBucket = runtime.BYTEPLUS_ASSET_TOS_BUCKET;
  if (!tosBucket) throw new InputError("还未配置私有 TOS 桶。请让管理员提供 ap-southeast-1 桶名及读写权限，然后点击“重试入库”。", 503);
  const object = await bucket().get(`assets/${asset.id}`);
  if (!object) throw new InputError("原图片不存在，请重新上传。", 404);
  const tos = new TosClient({ accessKeyId: ak, accessKeySecret: sk, region: REGION,
    endpoint: "tos-ap-southeast-1.bytepluses.com", bucket: tosBucket });
  const key = `yingxu-references/${asset.id}`;
  const putUrl = tos.getPreSignedUrl({ key, method: "PUT", expires: 300 });
  let response: Response;
  try { response = await fetch(putUrl, { method: "PUT", body: await object.arrayBuffer(), headers: { "Content-Type": asset.mime }, redirect: "manual", signal: AbortSignal.timeout(45000) }); }
  catch { throw new InputError("图片传输暂未完成，请重试入库。", 504); }
  if (!response.ok) throw new InputError(`图片存储返回 ${response.status}，请检查私有 TOS 桶的写入权限。`, 502);
  // Only a temporary, single-object read URL is shared with BytePlus.
  return tos.getPreSignedUrl({ key, method: "GET", expires: 86400 });
}
async function uploadReference(asset: Asset) {
  if (!ossConfigured(runtime)) return uploadToTos(asset);
  const object = await bucket().get(`assets/${asset.id}`);
  if (!object) throw new InputError("原图片不存在，请重新上传。", 404);
  return uploadOssReference(runtime, asset.id, asset.mime, new Uint8Array(await object.arrayBuffer()));
}
async function reconcile(asset: Asset) {
  const { group } = settings();
  let next: string | undefined;
  for (let page = 0; page < 10; page++) {
    const data = await ark("ListAssets", { Filter: { GroupIds: [group], GroupType: "AIGC", Name: `yingxu-${asset.id}` }, MaxResults: 100, ...(next ? { NextToken: next } : {}) });
    const match = (data.Items ?? []).find((item: any) => item.Name === `yingxu-${asset.id}`);
    if (match?.Id) return update(asset, "Processing", null, match.Id);
    next = data.NextToken;
    if (!next) break;
  }
  return update(asset, "Unknown", "上次提交结果尚未确认。请在素材分组核对；暂不重复创建，以免产生重复素材。");
}
export async function refreshPortrait(id: string, owner: string, force = false): Promise<Asset> {
  let asset = await owned(id, owner);
  if (!asset.ark_status) return asset;
  const { group, project } = settings();
  if (asset.ark_group !== group || asset.ark_project !== project) throw new InputError("素材项目已改变，请重新上传图片。", 409);
  if (!force && Date.now() - (asset.ark_updated ?? 0) < 5000) return asset;
  if (!asset.ark_id && ["Uploading", "Unknown"].includes(asset.ark_status)) {
    if (Date.now() - (asset.ark_updated ?? 0) < 120000 && asset.ark_status === "Uploading") return asset;
    asset = await reconcile(asset);
  }
  if (!asset.ark_id) return asset;
  const data = await ark("GetAsset", { Id: asset.ark_id });
  const status = ["Active", "Processing", "Failed"].includes(data.Status) ? data.Status : "Unknown";
  return update(asset, status, status === "Failed" ? "素材处理未通过。请查看素材分组中的具体原因，或移除此图并更换素材。" : status === "Unknown" ? "素材状态待确认，请稍后刷新。" : null);
}
export async function importPortrait(id: string, owner: string) {
  const asset = await owned(id, owner), { group, project } = settings();
  if (asset.ark_id || asset.ark_status && !["Blocked", "NotImported"].includes(asset.ark_status)) return publicPortrait(await refreshPortrait(id, owner));
  const claim = await database().prepare("UPDATE assets SET ark_status='Uploading',ark_error=NULL,ark_group=?,ark_project=?,ark_updated=? WHERE id=? AND owner=? AND ark_id IS NULL AND (ark_status IS NULL OR ark_status IN ('Blocked','NotImported'))")
    .bind(group, project, Date.now(), id, owner).run();
  if (!claim.meta.changes) return publicPortrait(await owned(id, owner));
  let submitted = false;
  const claimed = { ...asset, ark_group: group, ark_project: project };
  try {
    if (!portraitConfig().uploadReady) throw new InputError(portraitConfig().message, 503);
    const assetGroup = await ark("GetAssetGroup", { Id: group });
    if (assetGroup.ProjectName !== project || assetGroup.GroupType !== "AIGC") {
      throw new InputError("当前入口仅用于同项目的虚拟角色素材分组；真人肖像请先完成 真人授权流程。", 409);
    }
    const url = await uploadReference(claimed);
    submitted = true;
    const result = await ark("CreateAsset", { GroupId: group, URL: url, Name: `yingxu-${id}`, AssetType: "Image", Moderation: { Strategy: "Default" } });
    if (typeof result.Id !== "string" || !/^asset-[a-zA-Z0-9_-]+$/i.test(result.Id)) throw new InputError("素材服务未返回素材编号，请刷新状态核对。", 502);
    return publicPortrait(await update(claimed, "Processing", null, result.Id));
  } catch (error) {
    const certainRejection = error instanceof InputError && error.status >= 400 && error.status < 500;
    return publicPortrait(await update(claimed, submitted && !certainRejection ? "Unknown" : "Blocked", safeError(error)));
  }
}
export async function portraitReference(id: string, owner: string) {
  const { project, group } = settings(), asset = await refreshPortrait(id, owner, true);
  return activePortraitReference(asset, project, group);
}
