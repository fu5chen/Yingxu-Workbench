import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeneration } from "../lib/validation.ts";
import { h3References, h3Payload, normalizeH3, prepareH3References, validateH3References } from "../lib/hyaloria.ts";
import { H3_MODES, hyaloriaCatalog, assertHyaloriaMode } from '../lib/hyaloria-options.ts';
const base={model:"h3",prompt:"桌面上的蓝色陶瓷杯，镜头缓慢推进",images:["reference-image"]};
test("H3 maps only supported fields and all eight aspect ratios",()=>{
 for(const aspect_ratio of ["2:3","3:2","3:4","4:3","1:1","9:16","16:9","21:9"]){
  const request=parseGeneration({...base,aspect_ratio}),payload=h3Payload(request,["https://example.com/cup.jpg"]);
  assert.deepEqual(payload,{model:"h3",prompt:base.prompt,image_urls:["https://example.com/cup.jpg"],duration:5,resolution:"3MP",aspect_ratio,h3_mode:'hd'});
 }
 for(const change of [{duration:4},{duration:21},{resolution:"720p"},{images:Array.from({length:10},(_,i)=>String(i))},{audios:Array.from({length:4},(_,i)=>String(i))},{videos:Array.from({length:4},(_,i)=>String(i))}])assert.throws(()=>parseGeneration({...base,...change}));
});
test('H3 supports prompt-only generation and enforces each mode duration and resolution',()=>{
 for(const [h3_mode,spec]of Object.entries(H3_MODES)){
  const parsed=parseGeneration({model:'h3',prompt:'A lake',h3_mode,duration:spec.maxDuration});
  assert.equal(parsed.resolution,spec.resolution);assert.equal(parsed.aspect_ratio,'2:3');assert.equal('image_urls'in h3Payload(parsed,[]),false);
  assert.throws(()=>parseGeneration({...parsed,duration:spec.maxDuration+1}));
 }
 assert.equal(parseGeneration({model:'h3',prompt:'lake',h3_mode:'raw',resolution:'480P'}).resolution,'480P');
 assert.throws(()=>parseGeneration({model:'h3',prompt:'lake',h3_mode:'raw',resolution:'3MP'}));
 assert.throws(()=>parseGeneration({model:'h3',prompt:'lake',audios:['audio-one']}));
 const parsed=parseGeneration({...base,videos:['video-one'],audios:['audio-one'],h3_mode:'fast',duration:30});
 const payload=h3Payload(parsed,['https://example.com/a.jpg'],['https://example.com/a.mp4'],['https://example.com/a.wav']);assert.equal(payload.h3_mode,'fast');assert.equal(payload.video_urls?.length,1);assert.equal(payload.audio_urls?.length,1);
});
test('local H3 media is uploaded to public signed URLs while remote references are preserved',async()=>{
 const uploaded:string[]=[];
 const refs=await prepareH3References([{kind:'image',mime:'image/png',url:''},{kind:'video',mime:'video/remote',url:'https://example.com/v.mp4'},{kind:'audio',mime:'audio/wav',url:''}],async asset=>{uploaded.push(asset.kind);return'https://storage.example/'+asset.kind;});
 assert.deepEqual(uploaded,['image','audio']);assert.deepEqual(refs,{images:['https://storage.example/image'],videos:['https://example.com/v.mp4'],audios:['https://storage.example/audio']});
 assert.doesNotThrow(()=>validateH3References([]));assert.throws(()=>validateH3References([{kind:'audio',mime:'audio/wav',url:''}]));
});
test('available contract modes and default modes are normalized before dispatch',()=>{
 const catalog=hyaloriaCatalog({data:[{id:'h3',modes:['fast'],default_mode:'fast',unit_price_usd:0.06},{id:'krea2',modes:['story'],default_mode:'story'}]});assert.deepEqual(catalog.h3.modes,['fast']);assert.equal(catalog.h3.default_mode,'fast');
 assert.throws(()=>assertHyaloriaMode(catalog,'h3','hd'));assert.doesNotThrow(()=>assertHyaloriaMode(catalog,'krea2','story'));
 assert.deepEqual(hyaloriaCatalog({models:{h3:{modes:{hd:{enabled:false},raw:{enabled:true}}}}}).h3.modes,['raw']);
});
test("H3 rejects local or private references before submission",()=>{
 assert.throws(()=>h3References([{kind:"image",mime:"image/png",url:""}]));
 assert.throws(()=>h3References([{kind:"image",mime:"image/remote",url:"https://127.0.0.1/a.jpg"}]));
 assert.throws(()=>h3References([{kind:"video",mime:"image/remote",url:"https://example.com/a.jpg"}]));
 assert.deepEqual(h3References([{kind:"image",mime:"image/remote",url:"https://example.com/a.jpg"}]),["https://example.com/a.jpg"]);
});
test("H3 normalizes string errors, progress, price and content URLs",()=>{
 const failed=normalizeH3({id:"test-id",status:"failed",error:"余额不足"});assert.equal(failed.status,"failed");assert.equal(failed.error,"余额不足");
 const ready=normalizeH3({id:"test-id",status:"completed",content_url:"https://example.com/video.mp4",estimate:{amount_usd:0.4}});assert.equal(ready.url,"https://example.com/video.mp4");assert.equal(ready.estimate.amount_usd,0.4);
 assert.equal(normalizeH3({status:"processing",progress:42}).status,"in_progress");
 assert.equal(normalizeH3({id:'real-shape',status:'completed',content_url:'/api/hyaloria/v1/jobs/real-shape/content',url:'https://cdn.example.com/file.png'}).url,'https://cdn.example.com/file.png');
});
