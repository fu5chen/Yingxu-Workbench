import test from 'node:test';import assert from 'node:assert/strict';
import {compileChatActions,explicitChatCreation,nearestChatRatio,explicitChatRatio,chatCreationSystem,type ChatReference} from '../lib/chat-creation.ts';
const refs:ChatReference[]=[{id:'portrait-reference',name:'人像.png',preview:'/image',width:768,height:1024}];
const raw=(name:string,args:any)=>({choices:[{message:{content:null,tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
const messages=(content:string)=>[{role:'user' as const,content}];
test('chat executes explicit image/video commands and leaves discussions and negation as ordinary chat',()=>{
 assert.equal(explicitChatCreation('帮我生成一张猫的图片'),'image');assert.equal(explicitChatCreation('把这张图转成视频'),'video');assert.equal(explicitChatCreation('帮我画一只猫'),'image');
 for(const text of ['你好','如何生成图片？','不要生成视频','只讨论如何生成图片','先不生成，帮我写提示词','帮我写一段生成图片的提示词','可以生成图片吗？','帮我优化这个视频脚本'])assert.deepEqual(compileChatActions(raw('generate_image',{prompt:'cat'}),messages(text),{},refs,'turn'),[]);
});
test('reference dimensions determine both image and video ratios, ignoring an invented tool default',()=>{
 const image=compileChatActions(raw('generate_image',{prompt:'保持人像特征',aspect_ratio:'16:9'}),messages('用 Seedream 5.0 Pro 生成一张人物图片'),{},refs,'turn')[0];assert.equal(image.request.aspect_ratio,'3:4');assert.deepEqual(image.request.images,['portrait-reference']);
 const video=compileChatActions(raw('generate_video',{prompt:'人物自然转头'}),messages('生成视频'),{videoModel:'h3'},refs,'turn')[0];assert.equal(video.request.aspect_ratio,'3:4');assert.equal(video.request.model,'h3');assert.equal(video.id,'turn-video');
 assert.equal(nearestChatRatio(2,3,['16:9','9:16','3:4']),'3:4');
});
test('uploaded and explicitly recalled images survive an empty video tool reference list',()=>{
 const video=compileChatActions(raw('generate_video',{prompt:'湖面薄雾自然移动',reference_images:[]}),messages('根据参考图生成视频'),{},refs,'turn')[0];assert.deepEqual(video.request.images,['portrait-reference']);assert.equal(video.request.aspect_ratio,'3:4');
 const recalled=compileChatActions(raw('generate_video',{prompt:'湖面薄雾自然移动',reference_images:[]}),messages('把刚才生成的图变成视频'),{},[{...refs[0],automatic:true}],'turn')[0];assert.deepEqual(recalled.request.images,['portrait-reference']);
 const unrelated=compileChatActions(raw('generate_video',{prompt:'一片森林',reference_images:[]}),messages('生成一段森林视频'),{},[{...refs[0],automatic:true}],'turn')[0];assert.deepEqual(unrelated.request.images,[]);
 const text=compileChatActions(raw('generate_video',{prompt:'一片森林',reference_images:[1]}),messages('纯文字生成一段森林视频'),{},refs,'turn')[0];assert.deepEqual(text.request.images,[]);
 assert.match(chatCreationSystem({},refs),/限制仅适用于generate_image/);assert.match(chatCreationSystem({},refs),/Hyaloria-H3 MAX支持参考图片/);
});
test('explicit ratios and requested duration override image ratio and existing controls',()=>{
 const video=compileChatActions(raw('generate_video',{prompt:'波光闪烁'}),messages('生成一段8秒的视频，比例21:9'),{videoModel:'h3',videoDuration:5},refs,'turn')[0];assert.equal(video.request.aspect_ratio,'21:9');assert.equal(video.request.duration,8);
 assert.equal(explicitChatRatio('竖版生成'),'9:16');assert.equal(explicitChatRatio('生成方图'),'1:1');
});
test('existing settings apply without references and prompts can use prior conversation',()=>{
 const actions=compileChatActions({choices:[{message:{content:'我会制作'}}]},[{role:'user',content:'猫坐在窗边'},{role:'assistant',content:'橘猫坐在窗台，午后暖光。'},{role:'user',content:'按上面的方案生成图片'}],{imageRatio:'16:9'},[],'turn');assert.equal(actions[0].request.aspect_ratio,'16:9');assert.ok(actions[0].request.prompt.includes('橘猫'));
});
test('generated images are available for follow-up video without silently using them for unrelated images',()=>{
 const automatic={...refs[0],automatic:true};
 const next=compileChatActions(raw('generate_video',{prompt:'小幅转头',reference_images:[1]}),messages('把刚才这张图做成视频'),{videoModel:'h3'},[automatic],'turn')[0];assert.deepEqual(next.request.images,['portrait-reference']);
 const unrelated=compileChatActions(raw('generate_image',{prompt:'海报'}),messages('生成一张海报'),{},[automatic],'turn')[0];assert.deepEqual(unrelated.request.images,[]);
 const edit=compileChatActions(raw('generate_image',{prompt:'衣服改为蓝色',reference_images:[1]}),messages('用 Seedream 5.0 Pro 把这张图的衣服改成蓝色'),{},[automatic],'turn')[0];assert.deepEqual(edit.request.images,['portrait-reference']);
});
test('invalid tools, duplicated calls, excessive references and unsupported durations fail before task creation',()=>{
 assert.throws(()=>compileChatActions(raw('run_shell',{prompt:'cat'}),messages('生成图片'),{},refs,'turn'));
 assert.throws(()=>compileChatActions(raw('generate_video',{prompt:'cat',duration:100}),messages('生成100秒视频'),{videoModel:'h3'},refs,'turn'));
 assert.throws(()=>compileChatActions(raw('generate_image',{prompt:'cat',reference_images:[2]}),messages('生成图片'),{},refs,'turn'));
 assert.throws(()=>compileChatActions(raw('generate_image',{prompt:'cat',model:'krea2'}),messages('生成图片'),{},refs,'turn'));
 const duplicate=raw('generate_image',{prompt:'cat'});duplicate.choices[0].message.tool_calls.push(duplicate.choices[0].message.tool_calls[0]);assert.throws(()=>compileChatActions(duplicate,messages('生成图片'),{},refs,'turn'));
});
test('chat defaults ignore workbench selections and unrequested tool model or parameters',()=>{
 const context={videoModel:'dreamina-seedance-2-5-260628',h3Mode:'hd',videoResolution:'1080p',videoDuration:30,imageModel:'dola-seedream-5-0-pro-260628',imageSize:'2K'};
 const video=compileChatActions(raw('generate_video',{prompt:'平静湖面的波纹',model:'dreamina-seedance-2-5-260628',h3_mode:'hd',resolution:'3MP',duration:20}),messages('生成一段湖面视频'),context,[],'turn')[0];
 assert.equal(video.request.model,'h3');assert.equal(video.request.h3_mode,'raw');assert.equal(video.request.resolution,'768P');assert.equal(video.request.duration,5);
 const image=compileChatActions(raw('generate_image',{prompt:'一只蓝色陶瓷杯',model:'dola-seedream-5-0-pro-260628',size:'2K'}),messages('生成一张陶瓷杯图片'),context,[],'turn')[0];assert.equal(image.request.model,'krea2');assert.equal(image.request.size,'6MP');
 const explicit=compileChatActions(raw('generate_video',{prompt:'风景'}),messages('用 H3 fast 3MP 生成8秒视频'),context,[],'turn')[0];assert.equal(explicit.request.h3_mode,'fast');assert.equal(explicit.request.resolution,'3MP');assert.equal(explicit.request.duration,8);
 const size=compileChatActions(raw('generate_image',{prompt:'杯子'}),messages('用 Krea2 12M 生成图片'),context,[],'turn')[0];assert.equal(size.request.size,'12MP');
 const other=compileChatActions(raw('generate_video',{prompt:'风景'}),messages('用 Seedance2.5 1080p 生成10秒视频'),context,[],'turn')[0];assert.equal(other.request.model,'dreamina-seedance-2-5-260628');assert.equal(other.request.resolution,'1080p');assert.equal(other.request.duration,10);
 assert.throws(()=>compileChatActions(raw('generate_image',{prompt:'杯子'}),messages('根据参考图生成图片'),context,refs,'turn'),/文生图片/);
});
test('calling image/video models executes the requested media type even without tool calls',()=>{
 const ordinary={choices:[{message:{content:'收到，开始创作。'}}]};
 for(const [text,kind]of [['现在我要调用视频，生成清晨湖面的画面','video'],['请调用图片模型，一只猫坐在窗边','image'],['我要调用视频模型生成','video'],['用这张图片作为参考，生成视频','video'],['调用图片，做一张湖泊海报','image']]as const){
  assert.equal(explicitChatCreation(text),kind);const actions=compileChatActions(ordinary,messages(text),{},[],'turn');assert.equal(actions.length,1);assert.equal(actions[0].kind,kind);assert.equal(actions[0].request.model,kind==='video'?'h3':'krea2');
 }
 const prior=[{role:'user' as const,content:'清晨湖面薄雾，暖光，镜头缓慢靠近。'},{role:'assistant' as const,content:'这条消息没有实际创建图片或视频任务，因此没有可等待的生成结果。'},{role:'user' as const,content:'现在我要调用视频'}];
 assert.ok(compileChatActions(ordinary,prior,{},[],'turn')[0].request.prompt.includes('清晨湖面薄雾'));
});
test('an opposite tool cannot override the explicitly requested output type',()=>{
 assert.equal(compileChatActions(raw('generate_image',{prompt:'湖泊海报'}),messages('现在我要调用视频，湖面波纹自然运动'),{},[],'turn')[0].kind,'video');
 assert.equal(compileChatActions(raw('generate_video',{prompt:'湖面运动'}),messages('请调用图片，湖泊摄影'),{},[],'turn')[0].kind,'image');
 for(const text of ['怎么调用视频模型？','不要调用图片','请介绍调用图片的方法','可以调用视频吗？'])assert.deepEqual(compileChatActions(raw('generate_video',{prompt:'湖泊'}),messages(text),{},[],'turn'),[]);
 assert.deepEqual(compileChatActions({choices:[{message:{content:'抱歉，我无法帮助生成这个请求。'}}]},messages('调用视频生成湖泊画面'),{},[],'turn'),[]);
});

test('Picture reference tokens and earlier Seedance jobs cannot turn an optimized video request into an image or override H3 defaults',()=>{
 const content='基于<Picture 1>制作5秒、9:16竖屏视频。<Picture 1>中的人物保持参考图外观，坐在餐桌前吃饭。[Shot 1] 00s-03s：中近景，平稳光线。';
 const history=[{role:'user' as const,content:'男人在吃饭，视频4秒钟，模型用2.5'},{role:'assistant' as const,content:'已将视频任务加入生成队列。已请求的作品描述：用Seedance2.5生成4秒视频。'},{role:'user' as const,content}];
 const context={videoModel:'dreamina-seedance-2-5-260628',videoDuration:4,h3Mode:'hd',videoResolution:'720p'};
 for(const reply of [raw('generate_image',{prompt:'人物吃饭',model:'krea2'}),raw('generate_video',{prompt:'人物自然吃饭',model:'dreamina-seedance-2-5-260628',duration:4}),{choices:[{message:{content:'收到，准备创作。'}}]}]){
  assert.equal(explicitChatCreation(content),'video');
  const [action]=compileChatActions(reply,history,context,refs,'turn');
  assert.equal(action.kind,'video');assert.equal(action.request.model,'h3');assert.equal(action.request.h3_mode,'raw');assert.equal(action.request.resolution,'768P');assert.equal(action.request.duration,5);assert.equal(action.request.aspect_ratio,'9:16');assert.deepEqual(action.request.images,['portrait-reference']);
 }
});
test('scene plus media parameters is actionable and numeric model shorthand selects Seedance 2.5',()=>{
 const content='男人在吃饭，视频4秒钟，模型用2.5',ordinary={choices:[{message:{content:'收到。'}}]};
 for(const response of [ordinary,raw('generate_image',{prompt:'人物吃饭'}),raw('generate_video',{prompt:'人物自然吃饭',model:'h3',reference_images:[]})]){const action=compileChatActions(response,messages(content),{},refs,'turn')[0];assert.equal(action.kind,'video');assert.equal(action.request.model,'dreamina-seedance-2-5-260628');assert.equal(action.request.duration,4);assert.deepEqual(action.request.images,['portrait-reference']);}
 assert.equal(compileChatActions(ordinary,messages('湖泊薄雾，4秒视频，用2.5模型'),{},[],'turn')[0].request.model,'dreamina-seedance-2-5-260628');
 for(const content of ['这个视频4秒钟为什么不能播放？','视频4秒钟可以吗','只讨论视频4秒的镜头安排','请分析这个4秒视频'])assert.deepEqual(compileChatActions(raw('generate_video',{prompt:'湖泊'}),messages(content),{},refs,'turn'),[]);
});
