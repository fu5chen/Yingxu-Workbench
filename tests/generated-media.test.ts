import test from 'node:test';import assert from 'node:assert/strict';import {generatedMediaFormat}from'../lib/generated-media.ts';
test('generated image extensions follow bytes even when the upstream labels JPEG as PNG',()=>{
 assert.deepEqual(generatedMediaFormat(new Uint8Array([255,216,255,224]),'image'),{mime:'image/jpeg',extension:'jpg'});
 assert.deepEqual(generatedMediaFormat(new Uint8Array([137,80,78,71,13,10,26,10]),'image'),{mime:'image/png',extension:'png'});
 assert.deepEqual(generatedMediaFormat(Buffer.from('RIFF0000WEBP'),'image'),{mime:'image/webp',extension:'webp'});
 assert.throws(()=>generatedMediaFormat(Buffer.from('<html>service unavailable</html>'),'image'));
});
test('video containers are identified independently of URL suffixes and HTTP headers',()=>{
 assert.deepEqual(generatedMediaFormat(Buffer.from('0000ftypisom'),'video'),{mime:'video/mp4',extension:'mp4'});
 assert.deepEqual(generatedMediaFormat(Buffer.from('0000ftypqt  '),'video'),{mime:'video/quicktime',extension:'mov'});
 assert.deepEqual(generatedMediaFormat(new Uint8Array([26,69,223,163]),'video'),{mime:'video/webm',extension:'webm'});
 assert.throws(()=>generatedMediaFormat(new Uint8Array([255,216,255]),'video'));
});
