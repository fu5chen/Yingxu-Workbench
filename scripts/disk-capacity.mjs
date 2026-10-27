import {statfsSync} from 'node:fs';
export function diskCapacityAvailable(root,minimumMiB,stat=statfsSync){
 const minimum=Number(minimumMiB??0);
 if(!Number.isFinite(minimum)||minimum<0)throw Error('Invalid disk reserve');
 if(minimum===0)return true;
 try{const disk=stat(root);return Number(disk.bavail)*Number(disk.bsize)>=minimum*1024*1024;}catch{return false;}
}
