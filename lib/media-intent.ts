export type MediaTarget='image'|'video';
const VIDEO='(?:视频|短片|动画|影片|video|clip|animation)';
const IMAGE='(?:图片|图像|海报|插画|照片|壁纸|封面|头像|截图|缩略图|界面|页面|image|picture|photo|poster|illustration)';
// Names and depicted objects are not the requested output medium.
export function mediaIntentText(text:string){
 return text.replace(/腾讯视频|爱奇艺|优酷(?:视频)?|哔哩哔哩|西瓜视频|好看视频|芒果TV|YouTube|Netflix|视频(?:播放器|平台|软件|网站|应用)/gi,'播放平台')
  .replace(/(?:视频|短片|电影|动画|影片)的?(封面|海报|截图|缩略图|界面|页面)/g,'$1');
}
export function chineseSeconds(text:string){
 const match=text.match(/([一二两三四五六七八九十]{1,3})\s*秒(?:钟)?/);
 if(!match)return;
 const digits:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 const value=match[1];if(value.includes('十')){const [tens,ones]=value.split('十');return (digits[tens]??1)*10+(digits[ones]??0);}return value.length===1?digits[value]:undefined;
}
export const MEDIA_INTENT_GUIDANCE='【完整语义判断】先理解整句话与之前方案，区分“要生成的作品”与“画面中出现的内容”。腾讯视频、爱奇艺、优酷、YouTube等是平台名，不是视频生成指令；视频封面、视频截图、看视频的静态画面都属于图片。“我要看腾讯视频”在本工作台按展示观看场景的图片创作处理，不回答播放平台的使用说明。明确要求连续动作、运镜、几秒钟的视频则调用generate_video，即使内容是看腾讯视频也一样。用户指定图片/海报/截图时，不因场景里出现视频或秒数改成视频。结合上下文补全简短的创作请求并调用对应工具，不只回复会生成，也不虚构已生成结果。普通问答、教程和明确取消生成仍正常回答。';
export function mediaCreationTarget(text:string):MediaTarget|undefined{
 const boundary=text.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:subject[_ -]definitions|主体定义|summary|概要|detailed[_ -]description|详细描述)\s*(?:\*\*)?\s*[:：]/i);
 const directive=mediaIntentText(boundary>0?text.slice(0,boundary):text)
  .replace(/<\s*(?:Picture|Image|Video|Audio|Subject)\s*\d+\s*>|@(?:图片|视频|音频)\d+/gi,'参考素材')
  .replace(/参考\s*(?:图片|图像|照片|image|picture|photo)/gi,'参考素材');
 // A source picture does not make an image-to-video request an image task.
 if(/图生视频|(?:让|把).{0,30}(?:动起来|动一下)|image[- ]to[- ]video/i.test(directive))return'video';
 // A requested single frame stays an image even when someone watches a video in it.
 if(/(?:生成|制作|拍摄|绘制|创作|画|来|做|给我|我要)\s*(?:一|两|二|三|四|五|\d+|几)?(?:张|幅)(?:[^，。；\n]{0,50})/i.test(directive))return'image';
 // Match the nearest requested output noun once. A later source reference
 // must not compete with the output type attached to the same command.
 const output=directive.match(new RegExp('(?:生成|制作|拍摄|绘制|创作|做成|转成|变成|转为|变为|出|画|generate|create|make|render)\\s*.{0,24}?('+VIDEO+'|'+IMAGE+')','i'))?.[1];
 if(output)return new RegExp('^'+VIDEO+'$','i').test(output)?'video':'image';
 if(new RegExp('(?:调用|使用|启用|切换到|用|call|use)\\s*.{0,20}?'+VIDEO,'i').test(directive)||new RegExp(VIDEO+'(?:模型|接口|功能)?[，,:：\\s]*(?:来|去|给我|帮我)?[，,:：\\s]*(?:生成|制作|调用|generate|create)','i').test(directive))return'video';
 if(new RegExp('(?:调用|使用|启用|切换到|用|call|use)\\s*.{0,20}?'+IMAGE,'i').test(directive)||new RegExp(IMAGE+'(?:模型|接口|功能)?[，,:：\\s]*(?:来|去|给我|帮我)?[，,:：\\s]*(?:生成|制作|调用|generate|create)','i').test(directive)||/画(?:一|两|个|张|幅|只)|(?:来|出|生)(?:一|两|几|\d+)?(?:张|幅)|生图/.test(directive))return'image';
 if(/生视频/.test(directive))return'video';
 const specification=!/[?？]\s*$|[吗么][。！!\s]*$/.test(directive)&&!/(?:为什么|怎么|如何|能否|能不能|是否|教程|原理|故障|报错|失败|什么意思|\bwhy\b|\bhow\b)/i.test(directive)&&!/^\s*(?:请|帮我|给我)?(?:分析|解释|介绍|比较|评价|总结|查看|排查|检查|修复|翻译)/.test(directive);
 if(specification){
  const wanted=directive.match(new RegExp('(?:我要|我想要|我需要|给我|来)\\s*.{0,16}?('+VIDEO+'|'+IMAGE+')','i'))?.[1];
  if(wanted)return new RegExp('^'+VIDEO+'$','i').test(wanted)?'video':'image';
  // Explicit output requests above take precedence over incidental timing.
  if(new RegExp(VIDEO,'i').test(directive)&&/(?:\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})\s*(?:秒(?:钟)?|seconds?\b|s\b)/i.test(directive))return'video';
  if(/(?:一张|单张|一幅|静态)(?:.{0,16})(?:画面|摄影|照片|截图)|(?:我要|我想|给我|帮我).{0,8}(?:看|观看|打开|展示).{0,12}播放平台/.test(directive)||/(?:正在|在|坐着).{0,12}(?:看|观看).{0,12}播放平台/.test(directive))return'image';
  if(new RegExp(VIDEO+'\\s*(?:时长\\s*[为是:：]?\\s*)?(?:[，,:：]\\s*)?\\d+(?:\\.\\d+)?\\s*(?:秒|s\\b|seconds?\\b)','i').test(directive)||new RegExp('\\d+(?:\\.\\d+)?\\s*(?:秒|s\\b|seconds?\\b)\\s*'+VIDEO,'i').test(directive))return'video';
  if(new RegExp('(?:^|[，,；;\\n])\\s*'+VIDEO+'\\s*[。！!]*$','i').test(directive))return'video';
  if(new RegExp(IMAGE+'\\s*(?:[，,:：]\\s*)?\\d+(?:\\.\\d+)?\\s*(?:K|M|MP)\\b','i').test(directive)||new RegExp('(?:^|[，,；;\\n])\\s*'+IMAGE+'\\s*[。！!]*$','i').test(directive))return'image';
 }
}
export function optimizationTarget(text:string):MediaTarget|'auto'{
 const explicit=mediaCreationTarget(text);if(explicit)return explicit;
 const header=mediaIntentText(text).split(/(?:subject[_ -]definitions|主体定义|summary|概要)\s*[:：]/i)[0]||text;
 if(/视频|短片|动画|影片|\bh\s*3\b|seedance|senndance|seendamce|\bvideo\b|\bclip\b|\banimation\b/i.test(header))return'video';
 if(/图片|图像|海报|插画|照片|壁纸|封面|头像|krea\s*2|seedream|5[.．]0\s*pro|\bimage\b|\bphoto\b|\bposter\b/i.test(header))return'image';
 if(/运镜|镜头(?:切换|推进|移动|缓慢|向|跟随)|分镜|时间码|\b(?:pan|dolly|tracking shot|cut to)\b|\d+\s*(?:秒|seconds?)/i.test(text))return'video';
 return'auto';
}
