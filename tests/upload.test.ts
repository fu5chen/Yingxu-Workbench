import test from "node:test";
import assert from "node:assert/strict";
import { readUpload, uploadRequest } from "../lib/upload.ts";
import { readApiResponse } from "../lib/api-response.ts";
import { MIB } from "../lib/validation.ts";
import { describePortraitConfig } from "../lib/portrait-config.ts";

function png(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([137,80,78,71,13,10,26,10]);
  return bytes;
}
test("reference uploads bypass multipart action handling and preserve Unicode filenames", async () => {
  const file = new File([png(2*MIB)], "角色 参考图.png", { type:"image/png" });
  const request = new Request("http://localhost/upload", uploadRequest(file, "test-upload-123"));
  assert.equal(request.headers.get("content-type"), "application/octet-stream");
  const uploaded = await readUpload(request, "image");
  assert.equal(uploaded.name, file.name);
  assert.equal(uploaded.size, 2*MIB);
  assert.equal(uploaded.mime, "image/png");
});
test("upload limits reject oversized images, including streams without content-length", async () => {
  const file = new File([png(30*MIB)], "large.png");
  await assert.rejects(readUpload(new Request("http://localhost/upload", uploadRequest(file,"id")), "image"), /大小限制/);
  const request = new Request("http://localhost/upload", { method:"POST", body:png(68), headers:{"content-length":String(30*MIB),"x-file-name":"x.png"} });
  await assert.rejects(readUpload(request,"image"), /大小限制/);
});
test('video reference upload accepts a 29 MiB image without the former 10 MiB restriction',async()=>{
 const file=new File([png(29*MIB)],'大尺寸虚拟角色.png',{type:'image/png'});
 const asset=await readUpload(new Request('http://localhost/upload',uploadRequest(file,'large-reference')),'image');
 assert.equal(asset.size,29*MIB);assert.equal(asset.mime,'image/png');
});
test("legacy multipart remains supported and content is checked independently of MIME labels", async () => {
  const form = new FormData();
  form.set("file",new File([png(68)],"reference.png",{type:"image/png"}));
  assert.equal((await readUpload(new Request("http://localhost/upload",{method:"POST",body:form}),"image")).size,68);
  await assert.rejects(readUpload(new Request("http://localhost/upload",uploadRequest(new File(["not a png"],"fake.png",{type:"image/png"}),"id")),"image"));
});
test("plain-text 413 and malformed success responses are not accepted as successful uploads", async () => {
  await assert.rejects(readApiResponse(new Response("Payload Too Large",{status:413})), /30 MB/);
  await assert.rejects(readApiResponse(new Response("<html>error</html>",{status:200})), /异常响应/);
});
test("example-project config distinguishes missing storage setup from complete credentials", () => {
  const env={BYTEPLUS_ASSET_PROJECT:"example-project",BYTEPLUS_ACCESS_KEY_ID:"test-ak",BYTEPLUS_SECRET_ACCESS_KEY:"test-sk",BYTEPLUS_ASSET_GROUP_ID:"group-test"};
  const partial=describePortraitConfig(env);
  assert.equal(partial.project,"example-project");
  assert.equal(partial.configured,true);
  assert.equal(describePortraitConfig({...env,BYTEPLUS_ASSET_PROJECT:"my-project"}).configured,true);
  assert.equal(partial.uploadReady,false);
  assert.match(partial.message,/素材存储/);
  assert.equal(describePortraitConfig({...env,BYTEPLUS_ASSET_PROJECT:"",BYTEPLUS_ASSET_TOS_BUCKET:"private"}).configured,false);
  assert.equal(describePortraitConfig({...env,BYTEPLUS_ASSET_TOS_BUCKET:"private"}).uploadReady,true);
  assert.ok(!JSON.stringify(partial).includes("test-sk"));
});
