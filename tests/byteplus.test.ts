import { test } from "node:test";
import assert from "node:assert/strict";
import { bytePlusPayload, validateBytePlusAssets, prepareBytePlusReferences } from "../lib/byteplus.ts";
import { DEFAULT_MODEL, parseGeneration, normalizeTask, MIB } from "../lib/validation.ts";

test("Seedance 2.0 uses its own model, 4K, duration and reference limits", () => {
  const base = { model: "dreamina-seedance-2-0-260128", prompt: "海面上的日出", images: [], duration: 15 };
  for (const resolution of ["480p", "720p", "1080p", "4k"]) {
    const payload = bytePlusPayload(parseGeneration({ ...base, resolution }), [], [], []);
    assert.equal(payload.model, base.model);
    assert.equal(payload.resolution, resolution);
    assert.equal(payload.duration, 15);
  }
  const ids = (n: number) => Array.from({length:n}, (_,i)=>String(i));
  for (const change of [{duration:16},{duration:3},{images:ids(10)},{videos:ids(4)},{audios:ids(4)},{audios:["audio"]}]) {
    assert.throws(()=>parseGeneration({...base,...change}));
  }
  const reference = parseGeneration({...base,images:["i"],videos:["v"],audios:["a"]});
  const payload = bytePlusPayload(reference,["https://example.com/image.png"],["https://example.com/video.mp4"],["https://example.com/audio.wav"]);
  assert.deepEqual(payload.content.slice(1).map(x=>"role" in x ? x.role : undefined),["reference_image","reference_video","reference_audio"]);
  assert.equal("omni_reference_task_type" in payload,false);
});

test("official model accepts text-only requests and each advertised output resolution", () => {
  assert.equal(DEFAULT_MODEL, "dreamina-seedance-2-5-260628");
  for (const resolution of ["480p", "720p", "1080p"]) {
    const parsed = parseGeneration({ prompt: "雨后的城市", images: [], resolution });
    const payload = bytePlusPayload(parsed, [], [], []);
    assert.equal(payload.duration, 5);
    assert.equal(payload.model, DEFAULT_MODEL);
    assert.equal(payload.resolution, resolution);
    assert.equal(payload.generate_audio, true);
    assert.equal("omni_reference_task_type" in payload, false);
    assert.deepEqual(payload.content, [{ type: "text", text: "雨后的城市" }]);
  }
});
test("official payload uses content roles, ratio, and selected audio option", () => {
  const parsed = parseGeneration({prompt:"参考 @图片1 @视频1 @音频1",images:["i"],videos:["v"],audios:["a"],generate_audio:false,duration:30,aspect_ratio:"21:9"});
  const payload = bytePlusPayload(parsed,["data:image/png;base64,AA=="],["https://example.com/video.mp4"],["data:audio/wav;base64,AA=="]);
  assert.equal(payload.omni_reference_task_type,"reference");
  assert.equal(payload.ratio,"21:9");
  assert.equal(payload.generate_audio,false);
  assert.equal("text" in payload.content[0] && payload.content[0].text,"参考 @Image1 @Video1 @Audio1");
  assert.deepEqual(payload.content.slice(1).map(x => "role" in x ? x.role : undefined),["reference_image","reference_video","reference_audio"]);
  for (const change of [{duration:3},{duration:31},{resolution:"4k"},{generate_audio:"false"}]) assert.throws(()=>parseGeneration({prompt:"x",images:[],...change}));
});
test("official task result resolves content.video_url and terminal expiry", () => {
  const task = normalizeTask({id:"cgt-example",status:"succeeded",content:{video_url:"https://example.com/out.mp4?sig=abc"}});
  assert.equal(task.status,"completed"); assert.equal(task.upstream,"cgt-example"); assert.equal(task.url,"https://example.com/out.mp4?sig=abc");
  assert.equal(normalizeTask({status:"expired"}).status,"failed");
});
test("private media transport validates formats and bounded inline sizes", () => {
  validateBytePlusAssets([{kind:"video",mime:"video/remote",size:0,url:"https://example.com/video.mp4"},{kind:"audio",mime:"audio/wav",size:1024,url:""}]);
  assert.throws(()=>validateBytePlusAssets([{kind:"video",mime:"video/mp4",size:100,url:""}]));
  assert.throws(()=>validateBytePlusAssets([{kind:"audio",mime:"audio/ogg",size:100,url:""}]));
  assert.throws(()=>validateBytePlusAssets([{kind:"image",mime:"image/png",size:13*MIB,url:""}]));
  assert.throws(()=>validateBytePlusAssets([{kind:"video",mime:"video/remote",size:0,url:"http://localhost/secret"}]));
});

test("ordinary video references work without TOS or a portrait library", async () => {
  for (const ark_status of [undefined,"NotImported"]) {
    const prepared = await prepareBytePlusReferences([
      {kind:"image",mime:"image/png",size:1,url:"",ark_status},
      {kind:"audio",mime:"audio/mpeg",size:1,url:""},
      {kind:"video",mime:"video/remote",size:0,url:"https://example.com/reference.mp4"},
    ],async()=>new Uint8Array([1]));
    const payload=bytePlusPayload(parseGeneration({prompt:"日出",images:["image"],audios:["audio"],videos:["video"]}),prepared.images,prepared.videos,prepared.audios);
    assert.deepEqual(prepared.images,["data:image/png;base64,AQ=="]);
    assert.deepEqual(prepared.audios,["data:audio/mp3;base64,AQ=="]);
    assert.equal(payload.content.length,4);
  }
});

test('selected virtual assets must pass review; pending, rejected, mismatched or unconfigured assets never fall back to inline images', async()=>{
 const library={project:'example-project',group:'group-test',reference:async()=> 'asset://asset-test'};
 let reads=0;const read=async()=>{reads++;return new Uint8Array([1]);};
 for(const ark_status of ['Blocked','Uploading','Processing','Unknown','Failed']){
  const asset={kind:'image',mime:'image/png',size:1,url:'',ark_status,ark_project:'example-project',ark_group:'group-test'};
  await assert.rejects(prepareBytePlusReferences([asset],read,library),/入库/);
  await assert.rejects(prepareBytePlusReferences([asset],read),/入库/);
 }
 const active={kind:'image',mime:'image/png',size:1,url:'',ark_status:'Active',ark_id:'asset-test',ark_project:'example-project',ark_group:'group-test'};
 await assert.rejects(prepareBytePlusReferences([active],read),/配置/);
 await assert.rejects(prepareBytePlusReferences([{...active,ark_project:'another-project'}],read,library),/不匹配/);
 await assert.rejects(prepareBytePlusReferences([{...active,ark_id:null}],read,library),/尚未通过/);
 assert.equal(reads,0);
});

test("already-active assets reuse verified IDs and do not retry rejected asset checks as inline images", async () => {
  const asset={kind:"image",mime:"image/png",size:1,url:"",ark_status:"Active",ark_id:"asset-test",ark_project:"example-project",ark_group:"group-test"};
  const library={project:"example-project",group:"group-test",reference:async()=> "asset://asset-test"};
  const prepared=await prepareBytePlusReferences([asset],async()=>{throw new Error("Should not read local image");},library);
  assert.deepEqual(prepared.images,["asset://asset-test"]);
  await assert.rejects(prepareBytePlusReferences([asset],async()=>new Uint8Array([1]),{...library,reference:async()=>{throw new Error("Asset no longer active");}}),/no longer active/);
});
test('large approved image assets use IDs without counting their original bytes toward the inline payload limit',async()=>{
 const asset={kind:'image',mime:'image/png',size:29*MIB,url:'',ark_status:'Active',ark_id:'asset-large',ark_project:'example-project',ark_group:'group-test'};
 const library={project:'example-project',group:'group-test',reference:async()=> 'asset://asset-large'};
 const result=await prepareBytePlusReferences([asset,asset],async()=>{throw Error('Asset ID references must not read or inline image bytes');},library);
 assert.deepEqual(result.images,['asset://asset-large','asset://asset-large']);
 assert.throws(()=>validateBytePlusAssets([{...asset,size:30*MIB}],true),/小于 30/);
 assert.throws(()=>validateBytePlusAssets([asset]),/12 MiB/);
});
