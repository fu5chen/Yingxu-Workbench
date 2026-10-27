import { createHash, createHmac } from "node:crypto";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Uint8Array, value: string) => createHmac("sha256", key).update(value).digest();

/** BytePlus OpenAPI signature; secrets are never sent in the request body. */
export function signArkRequest(action: string, body: string, ak: string, sk: string, now = new Date()) {
  const host = "ark.ap-southeast-1.byteplusapi.com";
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const query = `Action=${encodeURIComponent(action)}&Version=2024-01-01`;
  const digest = hash(body);
  const signed = "content-type;host;x-content-sha256;x-date";
  const headers = { "content-type": "application/json", host, "x-content-sha256": digest, "x-date": date };
  const canonical = `POST\n/\n${query}\ncontent-type:application/json\nhost:${host}\nx-content-sha256:${digest}\nx-date:${date}\n\n${signed}\n${digest}`;
  const scope = `${date.slice(0, 8)}/ap-southeast-1/ark/request`;
  const key = hmac(hmac(hmac(hmac(sk, date.slice(0, 8)), "ap-southeast-1"), "ark"), "request");
  const signature = hmac(key, `HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString("hex");
  return { url: `https://${host}/?${query}`, headers: { ...headers, Authorization: `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signed}, Signature=${signature}` } };
}
