"use client";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CreationControl({label,trigger,children,reference=false,wide=false}:{label:string;trigger:ReactNode;children:ReactNode;reference?:boolean;wide?:boolean}) {
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={label} className={reference?"reference-add":"creation-control"}>{trigger}</button></PopoverTrigger><PopoverContent side="bottom" align="start" sideOffset={12} collisionPadding={16} className={`creation-popover ${wide?"creation-popover-wide":""}`}>{children}</PopoverContent></Popover>;
}
export function RatioChoice({value,label,selected,onSelect}:{value:string;label?:string;selected:boolean;onSelect:()=>void}) {
  const [width,height]=value==="adaptive"?[1,1]:value.split(":").map(Number);
  return <button type="button" className={`ratio-choice ${selected?"selected":""}`} aria-pressed={selected} onClick={onSelect}><span className={`ratio-outline ${value==="adaptive"?"adaptive":""}`} style={{width:Math.min(25,25*width/height),height:Math.min(25,25*height/width)}}/>{label??(value==="adaptive"?"自动":value)}</button>;
}
