import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCreationTarget,optimizationTarget} from '../lib/media-intent.ts';
import {explicitChatCreation,compileChatActions,chatCreationSystem} from '../lib/chat-creation.ts';
const ordinary={choices:[{message:{content:'收到。'}}]};
const wrongTool=(kind:string)=>({choices:[{message:{tool_calls:[{function:{name:'generate_'+kind,arguments:JSON.stringify({prompt:'错误类型的场景'})}}]}}]});
const examples:[string,'image'|'video',number?][]=[
 ['我要看腾讯视频','image'],
 ['我要一段湖泊的视频','video',5],
 ['拍摄一个湖泊视频','video',5],
 ['一个男人正在看腾讯视频','image'],
 ['生成腾讯视频的海报','image'],
 ['帮我制作视频封面','image'],
 ['制作视频截图','image'],
 ['我要视频封面','image'],
 ['生成一张小猫看视频的图片','image'],
 ['生成一张腾讯视频播放到5秒的截图','image'],
 ['我要5秒钟的视频，小猫在窗边玩耍','video',5],
 ['男人在吃饭，视频，时长六秒钟','video',6],
 ['来一段八秒钟的视频，湖面起雾','video',8],
 ['小猫追逐蝴蝶，5秒钟，做成视频','video',5],
 ['一个人正在看腾讯视频，做成六秒钟的视频','video',6],
 ['我想看腾讯视频，制作5秒视频，镜头推进','video',5],
 ['可以帮我生成一段5秒的小猫视频吗？','video',5],
 ['帮我生成一幅海报，画面里的人正在看视频','image'],
];
test('complete output intent distinguishes video platforms, still frames and timed videos',()=>{
 for(const [text,kind,duration]of examples){
  assert.equal(mediaCreationTarget(text),kind,text);assert.equal(optimizationTarget(text),kind,text);assert.equal(explicitChatCreation(text),kind,text);
  for(const raw of [ordinary,wrongTool(kind==='image'?'video':'image')]){
   const [action]=compileChatActions(raw,[{role:'user',content:text}],{},[],'semantic-turn');assert.ok(action,text);assert.equal(action.kind,kind,text);assert.equal(action.request.model,kind==='video'?'h3':'krea2',text);assert.ok(action.request.prompt.includes(text));if(duration)assert.equal(action.request.duration,duration,text);
  }
 }
});
test('discussion, playback troubleshooting and cancellations do not create unwanted jobs',()=>{
 for(const text of ['腾讯视频为什么打不开？','帮我解释5秒视频如何制作','不要生成视频','只讨论一个人看腾讯视频的画面','我想知道腾讯视频会员多少钱？','可以生成视频吗？']){
  assert.deepEqual(compileChatActions(wrongTool('video'),[{role:'user',content:text}],{},[],'turn'),[],text);
 }
 assert.ok(chatCreationSystem({},[]).includes('完整语义判断'));
});
test('contextual confirmation can use the model to resolve an unlabelled follow-up',()=>{
 const actions=compileChatActions(wrongTool('video'),[{role:'user',content:'小猫追逐蝴蝶，计划拍成5秒短片'},{role:'assistant',content:'用近景跟随小猫，再切到蝴蝶。'},{role:'user',content:'就按这个方案开始'}],{},[],'turn');assert.equal(actions[0].kind,'video');
});
