"use client";
import {forwardRef,useImperativeHandle,useLayoutEffect,useRef,type KeyboardEvent} from 'react';
import {splitReferencePrompt,type PromptReference} from '@/lib/reference-prompt';
import {clipboardFiles} from '@/lib/upload';

export type ReferencePromptHandle={focus:()=>void;selectionStart:number;selectionEnd:number;setSelectionRange:(start:number,end:number)=>void;replaceRange:(start:number,end:number,text:string)=>void;getCaretRect:(offset?:number)=>DOMRect|undefined};
type Selection={start:number;end:number};
function read(node:Node):string{
 if(node.nodeType===Node.TEXT_NODE)return node.textContent??'';
 if(node instanceof HTMLElement){if(node.dataset.referenceToken)return node.dataset.referenceToken;if(node.tagName==='BR')return node.dataset.editorFiller?'':'\n';}
 if(node instanceof HTMLElement&&node.classList.contains('reference-prompt')&&node.childNodes.length===1&&node.firstChild instanceof HTMLBRElement)return'';
 return Array.from(node.childNodes).map(read).join('');
}
function selection(root:HTMLElement):Selection{
 const current=window.getSelection();if(!current?.rangeCount||!root.contains(current.anchorNode)||!root.contains(current.focusNode))return{start:read(root).length,end:read(root).length};
 const range=current.getRangeAt(0),before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);const start=read(before.cloneContents());
 return{start:start.length,end:start.length+read(range.cloneContents()).length};
}
function point(root:Node,offset:number):{node:Node;offset:number}{
 let remaining=Math.max(0,offset);
 for(let index=0;index<root.childNodes.length;index++){
  const child=root.childNodes[index],length=read(child).length;
  if(remaining<=length){
   if(child.nodeType===Node.TEXT_NODE)return{node:child,offset:remaining};
   if(child instanceof HTMLElement&&(child.dataset.referenceToken||child.tagName==='BR'))return{node:root,offset:index+(remaining>0?1:0)};
   return point(child,remaining);
  }remaining-=length;
 }return{node:root,offset:root.childNodes.length};
}
function place(root:HTMLElement,start:number,end:number){const a=point(root,start),b=point(root,end),range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);const current=window.getSelection();current?.removeAllRanges();current?.addRange(range);}
function paint(root:HTMLElement,value:string,references:PromptReference[]){
 const fragment=document.createDocumentFragment();
 for(const part of splitReferencePrompt(value,references)){
  if(part.type==='text'){part.text.split('\n').forEach((line,index)=>{if(index)fragment.appendChild(document.createElement('br'));if(line)fragment.appendChild(document.createTextNode(line));});continue;}
  const reference=part.reference,chip=document.createElement('span');chip.className='prompt-reference-chip';chip.contentEditable='false';chip.dataset.referenceToken=reference.token;chip.dataset.referenceId=reference.id;chip.title=reference.token+' · '+reference.name;
  if(reference.kind==='image'){const image=document.createElement('img');image.src=reference.preview;image.alt='';image.draggable=false;chip.appendChild(image);}else{const icon=document.createElement('span');icon.className='prompt-reference-icon '+reference.kind;icon.textContent=reference.kind==='audio'?'♫':'▷';chip.appendChild(icon);}
  const name=document.createElement('span');name.className='prompt-reference-name';name.textContent=reference.name;chip.appendChild(name);fragment.appendChild(chip);
 }if(value.endsWith('\n')){const filler=document.createElement('br');filler.dataset.editorFiller='true';fragment.appendChild(filler);}root.replaceChildren(fragment);
}
export const ReferencePrompt=forwardRef<ReferencePromptHandle,{value:string;references:PromptReference[];label:string;placeholder:string;expanded?:boolean;onChange:(value:string,cursor:number)=>void;onCursor:(value:string,cursor:number)=>void;onFiles?:(files:File[])=>void;onKeyDown:(event:KeyboardEvent<HTMLDivElement>)=>void}>(function ReferencePrompt({value,references,label,placeholder,expanded,onChange,onCursor,onFiles,onKeyDown},ref){
 const root=useRef<HTMLDivElement>(null),composing=useRef(false),lastValue=useRef(value),signature=references.map(r=>[r.id,r.token,r.name,r.preview].join('\0')).join('\n'),lastSignature=useRef('');
 const history=useRef<{value:string;selection:Selection}[]>([{value,selection:{start:value.length,end:value.length}}]),historyIndex=useRef(0);
 function remember(next:string,cursor:Selection){if(history.current[historyIndex.current]?.value===next){history.current[historyIndex.current].selection=cursor;return;}history.current=history.current.slice(0,historyIndex.current+1);history.current.push({value:next,selection:cursor});if(history.current.length>100)history.current.shift();historyIndex.current=history.current.length-1;}
 function commit(next:string,cursor:Selection,record=true){if(!root.current)return;const limited=Array.from(next).slice(0,8000).join('');cursor={start:Math.min(cursor.start,limited.length),end:Math.min(cursor.end,limited.length)};paint(root.current,limited,references);lastValue.current=limited;lastSignature.current=signature;if(record)remember(limited,cursor);root.current.focus();place(root.current,cursor.start,cursor.end);onChange(limited,cursor.end);}
 function replace(start:number,end:number,text:string){const current=root.current?read(root.current):value;const next=current.slice(0,start)+text+current.slice(end),cursor=start+text.length;commit(next,{start:cursor,end:cursor});}
 useImperativeHandle(ref,()=>({focus(){root.current?.focus();},get selectionStart(){return root.current?selection(root.current).start:0;},get selectionEnd(){return root.current?selection(root.current).end:0;},setSelectionRange(start,end){if(root.current)place(root.current,start,end);},replaceRange:replace,getCaretRect(offset){if(!root.current)return;const cursor=offset??selection(root.current).end,a=point(root.current,cursor),b=point(root.current,Math.min(read(root.current).length,cursor+1)),range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);const rect=range.getBoundingClientRect();return rect.height?rect:root.current.getBoundingClientRect();}}));
 useLayoutEffect(()=>{
  if(!root.current||composing.current)return;const current=read(root.current),changed=value!==lastValue.current;
  if(current===value&&lastSignature.current===signature)return;
  const focused=document.activeElement===root.current,cursor=selection(root.current);paint(root.current,value,references);lastValue.current=value;lastSignature.current=signature;
  if(changed)remember(value,cursor);if(focused)place(root.current,Math.min(cursor.start,value.length),Math.min(cursor.end,value.length));
 },[value,signature]);
 function input(){if(!root.current)return;const next=read(root.current),cursor=selection(root.current);lastValue.current=next;remember(next,cursor);if(!composing.current)onChange(next,cursor.end);}
 function cursor(){if(root.current&&!composing.current){const current=selection(root.current);onCursor(read(root.current),current.end);}}
 return <div className="reference-prompt-shell"><div ref={root} className="reference-prompt" role="textbox" aria-label={label} aria-multiline="true" aria-expanded={expanded} aria-controls={expanded?'reference-mention-list':undefined} contentEditable suppressContentEditableWarning spellCheck={false}
  onInput={input} onBeforeInput={event=>{const native=event.nativeEvent as InputEvent;if(!composing.current&&['insertParagraph','insertLineBreak'].includes(native.inputType)){event.preventDefault();const current=selection(root.current!);replace(current.start,current.end,'\n');}}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;input();}} onKeyUp={cursor} onMouseUp={cursor}
  onPaste={event=>{event.preventDefault();const files=clipboardFiles(event.clipboardData);if(files.length){onFiles?.(files);return;}const current=root.current?selection(root.current):{start:0,end:0};replace(current.start,current.end,event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'));}}
  onCopy={event=>{const current=window.getSelection();if(current?.rangeCount){event.preventDefault();event.clipboardData.setData('text/plain',read(current.getRangeAt(0).cloneContents()));}}}
  onCut={event=>{if(!root.current)return;const current=selection(root.current);if(current.start!==current.end){event.preventDefault();event.clipboardData.setData('text/plain',read(root.current).slice(current.start,current.end));replace(current.start,current.end,'');}}}
  onKeyDown={event=>{
   if(event.nativeEvent.isComposing)return;
   if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();const direction=event.key.toLowerCase()==='y'||event.shiftKey?1:-1,index=historyIndex.current+direction;if(index>=0&&index<history.current.length){historyIndex.current=index;const snapshot=history.current[index];commit(snapshot.value,snapshot.selection,false);}return;}
   onKeyDown(event);if(event.defaultPrevented)return;
   if(event.key==='Enter'){event.preventDefault();const current=selection(root.current!);replace(current.start,current.end,'\n');return;}
   if((event.key==='Backspace'||event.key==='Delete')&&root.current){const current=selection(root.current);if(current.start!==current.end)return;let offset=0;for(const part of splitReferencePrompt(read(root.current),references)){const length=part.type==='text'?part.text.length:part.reference.token.length;if(part.type==='reference'&&((event.key==='Backspace'&&offset+length===current.start)||(event.key==='Delete'&&offset===current.start))){event.preventDefault();replace(offset,offset+length,'');return;}offset+=length;}}
  }}/>{!value&&<span className="reference-prompt-placeholder" aria-hidden="true">{placeholder}</span>}</div>;
});
