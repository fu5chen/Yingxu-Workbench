import { InputError } from './validation.ts';

export const H3_MODES={
 hd:{name:'高清',minDuration:5,maxDuration:20,resolution:'3MP',resolutions:['3MP']},
 fast:{name:'极速',minDuration:5,maxDuration:30,resolution:'3MP',resolutions:['3MP']},
 raw:{name:'原始',minDuration:5,maxDuration:15,resolution:'768P',resolutions:['768P','480P']},
} as const;
export type H3Mode=keyof typeof H3_MODES;
export const HYALORIA_RATIOS=['2:3','3:2','3:4','4:3','1:1','9:16','16:9','21:9'] as const;
export function parseH3Mode(value:unknown='hd'):H3Mode{
 if(typeof value!=='string'||!Object.hasOwn(H3_MODES,value))throw new InputError('H3 模式支持 hd、fast、raw。');return value as H3Mode;
}
export type HyaloriaModel={modes?:string[];default_mode?:string;unit_price_usd?:number};
export function hyaloriaCatalog(raw:any):Record<string,HyaloriaModel>{
 const source=raw?.data??raw?.models??raw,rows=Array.isArray(source)?source:source&&typeof source==='object'?Object.entries(source).map(([id,value])=>({id,...(typeof value==='object'&&value?value:{})})):[];
 const result:Record<string,HyaloriaModel>={};
 for(const row of rows){const id=row?.id??row?.model;if(!['h3','krea2'].includes(id))continue;const allowed=id==='h3'?['hd','fast','raw']:['story'];
  const modes=Array.isArray(row.modes)?row.modes:row.modes&&typeof row.modes==='object'?Object.entries(row.modes).map(([id,value])=>({id,...(typeof value==='object'&&value?value:{enabled:value!==false})})):undefined;
  result[id]={...(modes?{modes:modes.filter((m:any)=>typeof m==='string'||m?.enabled!==false).map((m:any)=>typeof m==='string'?m:m.id??m.mode??m.name).filter((m:any)=>allowed.includes(m))}:{}),...(allowed.includes(row.default_mode)?{default_mode:row.default_mode}:{}),...(typeof row.unit_price_usd==='number'?{unit_price_usd:row.unit_price_usd}:{})};
 }return result;
}
export function assertHyaloriaMode(catalog:Record<string,HyaloriaModel>,model:'h3'|'krea2',mode:string){
 const available=catalog[model]?.modes;if(available&&!available.includes(mode))throw new InputError(`${model==='h3'?'H3':'Krea2'} 的 ${mode} 模式当前未开放，请选择其他可用模式。`,403);
}
