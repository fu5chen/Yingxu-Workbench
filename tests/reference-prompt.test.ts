import test from 'node:test';
import assert from 'node:assert/strict';
import {splitReferencePrompt,referenceMention,remapImageReferences,type PromptReference} from '../lib/reference-prompt.ts';
const refs:PromptReference[]=[{id:'one',token:'@图片1',name:'portrait.png',kind:'image',preview:'/one.png'},{id:'ten',token:'@图片10',name:'scene.png',kind:'image',preview:'/ten.png'}];
test('inline references preserve canonical tokens and surrounding text without prefix collisions',()=>{
 const value='前景 @图片10 与 @图片1\n未知 @图片2';
 const parts=splitReferencePrompt(value,refs);
 assert.deepEqual(parts.filter(x=>x.type==='reference').map(x=>x.reference.id),['ten','one']);
 assert.equal(parts.map(x=>x.type==='text'?x.text:x.reference.token).join(''),value);
});
test('mention range follows the caret and searches names inline',()=>{
 assert.deepEqual(referenceMention('场景 @屏幕',6),{start:3,end:6,query:'屏幕'});
 assert.deepEqual(referenceMention('test @',6),{start:5,end:6,query:''});
 assert.equal(referenceMention('test @图片1 ',10),null);
 assert.deepEqual(referenceMention('test @one after',9),{start:5,end:9,query:'one'});
});
test('removing or reordering image references preserves identity and marks removed references',()=>{
 const before=[{id:'one'},{id:'two'},{id:'three'}];
 assert.equal(remapImageReferences('@图片1 @图片2 @图片3',before,[before[2],before[0]]),'@图片2 [已移除图片] @图片1');
});
