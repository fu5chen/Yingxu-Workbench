import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageGeneration, imagePayload, krea2Payload, IMAGE_ASPECT_RATIOS, PRO_IMAGE_DIMENSIONS, imageRatios } from "../lib/image-models.ts";

test("Lite, Pro and Flash use the image provider and model-specific sizes",()=>{
  for(const [model,sizes] of [["seedream-5-0-lite-260128",["2K","3K","4K"]],["dola-seedream-5-0-pro-260628",["1K","1.5K","2K"]],["dola-seedream-5-0-flash-260915",["1K","1.5K","2K"]]] as const){
    for(const size of sizes){
      const saved=parseImageGeneration({model,size,prompt:"a ceramic cup"});
      assert.equal(saved.provider,"byteplus_image");
      const payload=imagePayload(saved);
      assert.equal(payload.model,model);
      assert.equal(payload.size,size);
      assert.equal("n" in payload,false);
      assert.equal("sequential_image_generation" in payload,model.includes("lite"));
    }
  }
  assert.throws(()=>parseImageGeneration({model:"dola-seedream-5-0-pro-260628",size:"4K",prompt:"cup"}));
  assert.throws(()=>parseImageGeneration({model:"seedream-5-0-lite-260128",size:"1K",prompt:"cup"}));
});
test("unrecognized models and invalid descriptions cannot create image jobs",()=>{
  for(const model of ["__proto__","constructor","dreamina-seedance-2-5-260628","https://other.test"]){
    assert.throws(()=>parseImageGeneration({model,prompt:"cup"}));
  }
  for(const prompt of [null,"  ","x".repeat(8001)])assert.throws(()=>parseImageGeneration({prompt}));
});
test("legacy image models keep their own provider and request options",()=>{
  const saved=parseImageGeneration({model:"gpt-image-2",prompt:"cup",size:"1024x1536"});
  assert.equal(saved.provider,"linkomobile");
  const payload=imagePayload(saved);
  assert.equal("n" in payload && payload.n,1);
});

test("all Seedream 5 models send prepared image references and enforce model limits",()=>{
  for(const [model,max] of [["seedream-5-0-lite-260128",14],["dola-seedream-5-0-pro-260628",10],["dola-seedream-5-0-flash-260915",10]] as const){
    const one=parseImageGeneration({model,prompt:"Change the cup to blue",images:["image-id-1"]});
    const url="data:image/png;base64,AA==";
    assert.equal((imagePayload(one,[url]) as any).image,url);
    assert.throws(()=>imagePayload(one,[]));
    const images=Array.from({length:max},(_,i)=>`image-id-${i}`),refs=images.map(id=>`https://example.com/${id}.png`);
    assert.deepEqual((imagePayload(parseImageGeneration({model,prompt:"Combine these",images}),refs) as any).image,refs);
    assert.throws(()=>parseImageGeneration({model,prompt:"x",images:[...images,"extra-image"]}));
  }
  for(const images of [["duplicate-id","duplicate-id"],["https://other.example/image.png"],[{}],"x"]){
    assert.throws(()=>parseImageGeneration({prompt:"x",images}));
  }
  assert.throws(()=>parseImageGeneration({model:"gpt-image-2",prompt:"x",images:["image-id-1"]}));
  assert.equal("image" in imagePayload(parseImageGeneration({prompt:"A cup"})),false);
});

test("Pro ratios use explicit official pixel dimensions without adding unsupported API fields", () => {
  for (const size of ["1K", "1.5K", "2K"] as const) {
    for (const aspect_ratio of IMAGE_ASPECT_RATIOS) {
      const saved = parseImageGeneration({prompt:"A ceramic cup",size,aspect_ratio,images:["image-id-1"]});
      const payload = imagePayload(saved,["data:image/png;base64,AA=="]);
      assert.equal(saved.aspect_ratio,aspect_ratio);
      assert.equal(payload.prompt,"A ceramic cup");
      assert.equal("aspect_ratio" in payload,false);
      assert.equal(payload.size,aspect_ratio==="adaptive"?size:PRO_IMAGE_DIMENSIONS[size][aspect_ratio]);
      if (aspect_ratio!=="adaptive") {
        const [width,height]=payload.size.split("x").map(Number);
        assert.ok(width*height>=921600 && width*height<=4624220);
        assert.ok(width/height>=1/16 && width/height<=16);
      }
    }
  }
  assert.equal(imagePayload(parseImageGeneration({prompt:"cup",size:"2K",aspect_ratio:"16:9"})).size,"2816x1584");
  assert.equal(imagePayload(parseImageGeneration({prompt:"cup",size:"1.5K",aspect_ratio:"9:16"})).size,"1152x2048");
});
test("omitted ratios preserve automatic behavior and invalid ratios fail validation", () => {
  assert.equal(imagePayload(parseImageGeneration({prompt:"cup"})).size,"2K");
  for(const aspect_ratio of ["invalid","16:1","constructor",{},16]) {
    assert.throws(()=>parseImageGeneration({prompt:"cup",aspect_ratio}));
  }
  assert.throws(()=>parseImageGeneration({model:"gpt-image-2",prompt:"cup",aspect_ratio:"16:9"}));
});
test('Krea2 uses its separate provider and async Story image contract',()=>{
 const saved=parseImageGeneration({model:'krea2',prompt:'A cinematic portrait'});assert.equal(saved.provider,'krea2');assert.equal(saved.size,'6MP');assert.equal(saved.aspect_ratio,'2:3');
 assert.deepEqual(krea2Payload(saved),{model:'krea2',prompt:'A cinematic portrait',aspect_ratio:'2:3',image_resolution:'6MP',krea2_mode:'story'});
 for(const size of ['2K','6MP','12MP'])for(const aspect_ratio of imageRatios('krea2'))assert.equal(krea2Payload(parseImageGeneration({model:'krea2',prompt:'portrait',size,aspect_ratio})).image_resolution,size);
 for(const value of [{images:['reference-one']},{aspect_ratio:'adaptive'},{krea2_mode:'live'},{krea2_mode:'cute'},{size:'4K'}])assert.throws(()=>parseImageGeneration({model:'krea2',prompt:'portrait',...value}));
 assert.equal(krea2Payload(parseImageGeneration({model:'krea2',prompt:'portrait',seed:123})).seed,123);
});
