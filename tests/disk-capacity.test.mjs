import test from'node:test';import assert from'node:assert/strict';import{diskCapacityAvailable}from'../scripts/disk-capacity.mjs';
test('disk reserves protect submissions before transfer capacity and fail closed on filesystem errors',()=>{
 const disk=mib=>()=>({bsize:4096,bavail:mib*256});
 assert.equal(diskCapacityAvailable('.',2560,disk(2400)),false);
 assert.equal(diskCapacityAvailable('.',1536,disk(2400)),true);
 assert.equal(diskCapacityAvailable('.',1536,disk(1535)),false);
 assert.equal(diskCapacityAvailable('.',1536,disk(1536)),true);
 assert.equal(diskCapacityAvailable('.',1536,()=>{throw Error('unavailable')}),false);
 assert.equal(diskCapacityAvailable('.',undefined,()=>{throw Error('not called')}),true);
});
