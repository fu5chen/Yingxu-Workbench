import test from'node:test';import assert from'node:assert/strict';
import{parsePromptOptimization,optimizedPrompt,OPTIMIZATION_SECTIONS,IMAGE_OPTIMIZATION_SECTIONS,promptOptimizationSystem,resolvePromptOptimization,PromptOptimizationError}from'../lib/prompt-optimization.ts';
import{compileChatActions}from'../lib/chat-creation.ts';
import{chatSubmissionContent}from'../lib/chat.ts';
const template=OPTIMIZATION_SECTIONS.map(section=>section+':\n'+(section==='summary'?'清晨湖面上的薄雾。':'N/A')).join('\n\n');
const response=(content:string)=>({choices:[{message:{content}}]});
test('optimizer distinguishes static image and video drafts and enforces prompt limits',()=>{
 assert.equal(parsePromptOptimization({prompt:'生成一张咖啡海报'}).target,'image');assert.equal(parsePromptOptimization({prompt:'人物拿起咖啡杯，镜头向前移动'}).target,'video');
 for(const body of [{prompt:''},{prompt:' '.repeat(4)},{prompt:'字'.repeat(8001)},{prompt:3},null])assert.throws(()=>parsePromptOptimization(body));
});
test('optimization exposes only the detailed description, without headings or generation instructions',()=>{
 const description='湖面薄雾，镜头缓慢移动，暖色晨光。',draft=optimizedPrompt(response(template.replace('detailed_description:\nN/A','detailed_description:\n'+description)),'video');assert.equal(draft,description);
 assert.equal(optimizedPrompt(response('```yaml\n'+template+'\n```'),'image'),'清晨湖面上的薄雾。');
 for(const target of ['image','video']as const){const submitted=chatSubmissionContent({role:'user',content:draft,creationTarget:target}),raw={choices:[{message:{content:'收到。'}}]};assert.equal(compileChatActions(raw,[{role:'user',content:submitted}],{},[],'turn')[0].kind,target);}
});
test('Markdown, Chinese headings, reordered fields, JSON and incomplete templates retain usable descriptions',()=>{
 const variants=[
  '### Summary：\n湖面薄雾，清晨暖光。\n\n**Detailed Description:** 缓慢推进的镜头展现宁静湖泊。',
  '## 详细描述\n清晨湖泊在暖色日光中泛起细小波纹。\n### 背景音乐：N/A\n### 概述：宁静湖泊。',
  JSON.stringify({detailed_description:'清晨湖泊在暖色日光中泛起细小波纹。',summary:'宁静湖泊。'}),
  '清晨湖泊在暖色日光中泛起细小波纹，镜头缓慢靠近水面，保持自然写实风格。',
  template.split('\n\n').reverse().join('\n\n')
 ];
 for(const content of variants){const result=optimizedPrompt(response(content),'video');assert.ok(result.includes('湖'));assert.ok(!/subject_definitions:|summary:|detailed_description:|请按以下/.test(result));}
 assert.equal(parsePromptOptimization({prompt:'请按以下提示词生成图片：\n'+template}).target,'image');
 assert.ok(optimizedPrompt(response('红苹果，白底，摄影'),'image').includes('红苹果，白底，摄影'));
});
test('refusals are reported honestly instead of reformatted or used as generation prompts',()=>{
 for(const content of ['抱歉，我无法帮助优化这类内容。','I cannot assist with this request.','summary:\n我不能提供该内容。\ndetailed_description:\nN/A'])assert.throws(()=>optimizedPrompt(response(content),'video'),e=>e instanceof PromptOptimizationError&&e.code==='optimization_refused');
 assert.throws(()=>optimizedPrompt({choices:[{message:{refusal:'declined',content:null}}]},'video'),e=>e instanceof PromptOptimizationError&&e.code==='optimization_refused');
});
test('empty descriptions and overlong output never replace the user draft',()=>{
 for(const content of ['优化完成','你希望生成什么样的视频？',OPTIMIZATION_SECTIONS.map(s=>s+': N/A').join('\n'),template.replace('detailed_description:\nN/A','detailed_description:\n'+'字'.repeat(8001))])assert.throws(()=>optimizedPrompt(response(content),'video'));
});
test('scene constraints inside an optimized prompt do not suppress its outer generation instruction',()=>{
 const draft=optimizedPrompt(response(template.replace('清晨湖面上的薄雾。','清晨湖面上的薄雾。不要生成字幕。')),'video');
 const raw={choices:[{message:{content:'收到。'}}]};assert.equal(compileChatActions(raw,[{role:'user',content:chatSubmissionContent({role:'user',content:draft,creationTarget:'video'})}],{},[],'turn').length,1);
 assert.deepEqual(compileChatActions(raw,[{role:'user',content:'不要生成视频，只优化提示词。\n'+template}],{},[],'turn'),[]);
});
test('optimization selects final output, using independent image and video instructions',()=>{
 for(const text of ['用这张图片生成5秒视频','调用视频模型，湖面薄雾','Hyaloria-H3 MAX，清晨湖泊'])assert.equal(parsePromptOptimization({prompt:text}).target,'video');
 for(const text of ['生成一张图片，电影镜头的质感','请调用图片模型，猫坐在窗边','Krea2，咖啡杯摄影'])assert.equal(parsePromptOptimization({prompt:text}).target,'image');
 assert.equal(parsePromptOptimization({prompt:'窗边的一只橘猫，午后暖光'}).target,'auto');
 assert.ok(promptOptimizationSystem('image').includes('不要添加视频分镜'));assert.ok(promptOptimizationSystem('video').includes('[Shot 1]'));assert.ok(promptOptimizationSystem('auto').includes('先根据用户描述'));
 const image=resolvePromptOptimization(response(JSON.stringify({target:'image',prompt:'详细描述：橘猫坐在窗台，午后暖光，静态摄影。'})),'auto');assert.equal(image.target,'image');assert.equal(image.prompt,'橘猫坐在窗台，午后暖光，静态摄影。');
 const video=resolvePromptOptimization(response(JSON.stringify({target:'video',prompt:template})),'auto');assert.equal(video.target,'video');assert.equal(video.prompt,'清晨湖面上的薄雾。');
 // A model's inferred type cannot replace the user's explicit request.
 assert.equal(resolvePromptOptimization(response(JSON.stringify({target:'video',prompt:template})),'image').target,'image');
 assert.equal(compileChatActions({choices:[{message:{content:'收到。'}}]},[{role:'user',content:chatSubmissionContent({role:'user',content:image.prompt,creationTarget:image.target})}],{},[],'turn')[0].kind,'image');
});
test('plain chat stays ordinary, while an explicit new command overrides an optimized draft target',()=>{
 assert.equal(chatSubmissionContent({role:'user',content:'窗边的橘猫。'}),'窗边的橘猫。');
 const input=chatSubmissionContent({role:'user',content:'改为生成视频，橘猫转头。',creationTarget:'image'});assert.equal(input,'改为生成视频，橘猫转头。');
 assert.equal(compileChatActions({choices:[{message:{content:'收到。'}}]},[{role:'user',content:input}],{},[],'turn')[0].kind,'video');
});
test('video shot timing uses padded seconds while dialogue and picture descriptions remain unchanged',()=>{
 const description='一段6秒、比例2:3的视频。\n[Shot 1] 00:00.000-00:03.000\n湖泊薄雾。\n[Shot 2] 00:03.000-00:06.000\n镜头缓慢推进，直至00:06.000结束。';
 const result=optimizedPrompt(response('detailed_description:\n'+description),'video');assert.ok(result.includes('[Shot 1] 00s-03s'));assert.ok(result.includes('[Shot 2] 03s-06s'));assert.ok(result.includes('直至06s结束'));assert.ok(result.includes('比例2:3'));assert.ok(!result.includes('00:'));
 const fractional='[Shot 1] 00:00.000–00:03.500\n<d>[English] At 00:03.500.</d>';assert.equal(optimizedPrompt(response(fractional),'video'),'[Shot 1] 00s-03.5s\n<d>[English] At 00:03.500.</d>');
 assert.equal(optimizedPrompt(response(description),'image'),description);
 for(const durationText of ['请生成视频：\n[Shot 1] 00s-03s\n湖面波纹。\n[Shot 2] 03s-06s\n镜头推进。','请生成6秒视频：\n[Shot 1] 00s-03s\n[Shot 2] 03s-06s'])assert.equal(compileChatActions({choices:[{message:{content:'收到。'}}]},[{role:'user',content:durationText}],{},[],'turn')[0].request.duration,6);
 assert.equal(compileChatActions({choices:[{message:{content:'收到。'}}]},[{role:'user',content:'请生成8秒视频：\n[Shot 1] 00s-03s\n[Shot 2] 03s-06s'}],{},[],'turn')[0].request.duration,8);
});
