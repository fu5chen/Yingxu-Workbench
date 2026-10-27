import fs from 'node:fs';

export const API_KEY_FIELDS={byteplus:'seedance25',byteplus_image:'seedream50Pro',hyaloria:'h3',krea2:'krea2',paipu_chat:'chat',paipu:'legacyVideo1',modelflare:'legacyVideo2',linkomobile:'legacyImageVideo'};
export const API_KEY_ENV={byteplus:'BYTEPLUS_API_KEY',byteplus_image:'BYTEPLUS_IMAGE_API_KEY',hyaloria:'HYALORIA_API_KEY',krea2:'KREA2_API_KEY',paipu_chat:'PAIPU_CHAT_API_KEY',paipu:'PAIPU_API_KEY',modelflare:'MODELFLARE_API_KEY',linkomobile:'LINKOMOBILE_API_KEY'};
export function readKeyConfiguration(file){
 const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(!value||typeof value!=='object'||!value.apiKeys||typeof value.apiKeys!=='object')throw Error('confiykey.json configuration format invalid');
 for(const key of Object.values(API_KEY_FIELDS))if(value.apiKeys[key]!==undefined&&typeof value.apiKeys[key]!=='string')throw Error('API key configuration must contain strings');
 return value;
}
export function configuredKey(config,provider){const field=Object.hasOwn(API_KEY_FIELDS,provider)?API_KEY_FIELDS[provider]:null;return field?(config.apiKeys[field]??'').trim():'';}
export function keyConfigurationEnv(config){
 const env=Object.fromEntries(Object.entries(API_KEY_ENV).map(([provider,name])=>[name,configuredKey(config,provider)]));
 for(const [group,names]of Object.entries({byteplusAssets:{accessKeyId:'BYTEPLUS_ACCESS_KEY_ID',secretAccessKey:'BYTEPLUS_SECRET_ACCESS_KEY',project:'BYTEPLUS_ASSET_PROJECT',groupId:'BYTEPLUS_ASSET_GROUP_ID',tosBucket:'BYTEPLUS_ASSET_TOS_BUCKET'},oss:{region:'OSS_REGION',bucket:'OSS_BUCKET',accessKeyId:'OSS_ACCESS_KEY_ID',accessKeySecret:'OSS_ACCESS_KEY_SECRET'}}))for(const [field,name]of Object.entries(names))if(typeof config[group]?.[field]==='string')env[name]=config[group][field];
 return env;
}
