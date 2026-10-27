import test from 'node:test';import assert from 'node:assert/strict';
import {rememberMediaPreview,mediaPreview,fallbackMediaPreview} from '../lib/local-media-preview.ts';
test('uploaded previews reuse local bytes, keep remote fallback, and bound retained memory',()=>{
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let count=0;const revoked:string[]=[];
 try{
 URL.createObjectURL=()=>`blob:test-${++count}`;URL.revokeObjectURL=url=>{revoked.push(url);};
 rememberMediaPreview('preview-a',{size:32*1024*1024} as Blob);rememberMediaPreview('preview-b',{size:32*1024*1024} as Blob);
 assert.equal(mediaPreview('preview-a','/remote/a'),'blob:test-1');rememberMediaPreview('preview-c',{size:1} as Blob);
 assert.equal(mediaPreview('preview-a','/remote/a'),'/remote/a');assert.deepEqual(revoked,['blob:test-1']);
 const image={src:'blob:expired'};fallbackMediaPreview(image,'/remote/a');assert.equal(image.src,'/remote/a');fallbackMediaPreview(image,'/other');assert.equal(image.src,'/remote/a');
 assert.equal(mediaPreview(undefined,'/remote/unknown'),'/remote/unknown');
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
