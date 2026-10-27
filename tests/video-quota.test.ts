import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { LIMITED_VIDEO_MODEL, VIDEO_QUOTA_SQL, INSERT_VIDEO_WITH_QUOTA_SQL, videoQuota, assertVideoQuota } from "../lib/video-quota.ts";

const migration=readFileSync(new URL("../drizzle/0003_video_duration_quota.sql",import.meta.url),"utf8");
function database(migrate=true) {
  const db=new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../drizzle/0000_busy_speed_demon.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../drizzle/0001_ambiguous_logan.sql",import.meta.url),"utf8"));
  if(migrate)db.exec(migration);
  return db;
}
function add(db:DatabaseSync,id:string,status:string,duration:number,owner="alice",model=LIMITED_VIDEO_MODEL) {
  db.prepare("INSERT INTO jobs(id,owner,status,request,result,created,updated) VALUES(?,?,?,?,?,?,?)").run(id,owner,status,JSON.stringify({kind:"video",model,duration}),"{}",1,1);
}
function quota(db:DatabaseSync){return videoQuota(db.prepare(VIDEO_QUOTA_SQL).get() as {used:number;reserved:number});}
function claim(db:DatabaseSync,id:string,duration:number,owner="alice",model=LIMITED_VIDEO_MODEL) {
  return db.prepare(INSERT_VIDEO_WITH_QUOTA_SQL).run(id,owner,"submitting",JSON.stringify({kind:"video",model,duration}),"{}",1,1,model,duration).changes;
}

test("historical successes across all workspaces and deleted records count toward 30 seconds",()=>{
  const db=database(false);
  add(db,"past-a","completed",5);add(db,"past-b","completed",4,"bob");
  db.exec("UPDATE jobs SET deleted_at=10 WHERE id='past-a'");
  add(db,"failed","failed",30);add(db,"h3","completed",20,"alice","h3");
  db.exec(migration);
  assert.deepEqual(quota(db),{limit:30,used:9,reserved:0,remaining:21,disabled:false,unavailable:false});
  db.close();
});
test("a single conditional insert reserves seconds globally and refuses overspending",()=>{
  const db=database();add(db,"previous","completed",10);
  assert.equal(claim(db,"first",20,"alice"),1);
  // A different workspace cannot also spend the same last 20 seconds.
  assert.equal(claim(db,"second",20,"bob"),0);
  assert.equal(quota(db).reserved,20);assert.equal(quota(db).remaining,0);
  assert.equal(quota(db).disabled,false);assert.equal(quota(db).unavailable,true);
  assert.throws(()=>assertVideoQuota(quota(db),4),/预占/);
  db.exec("UPDATE jobs SET status='completed' WHERE id='first'");
  assert.equal(quota(db).used,30);assert.equal(quota(db).reserved,0);
  assert.equal(quota(db).disabled,true);assert.equal(claim(db,"third",4),0);
  assert.throws(()=>assertVideoQuota(quota(db),4),/已禁用/);
  assert.equal(claim(db,"h3-after-limit",5,"bob","h3"),1);
  db.close();
});
test("only confirmed failure frees reservations, while unknown submissions keep theirs",()=>{
  const db=database();add(db,"previous","completed",0);
  assert.equal(claim(db,"uncertain",20),1);
  db.exec("UPDATE jobs SET status='unknown' WHERE id='uncertain'");
  assert.equal(quota(db).reserved,20);assert.equal(claim(db,"too-long",15),0);
  db.exec("UPDATE jobs SET status='failed' WHERE id='uncertain'");
  assert.equal(quota(db).reserved,0);assert.equal(claim(db,"replacement",30),1);
  db.close();
});
test("successes are counted once and cannot be undone by expiry, delete or restore",()=>{
  const db=database();add(db,"previous","completed",20);claim(db,"last",10);
  db.exec("UPDATE jobs SET status='completed' WHERE id='last'");
  db.exec("UPDATE jobs SET status='completed' WHERE id='last'");
  assert.equal(quota(db).used,30);
  db.exec("UPDATE jobs SET deleted_at=5, status='failed' WHERE id='last'");
  assert.equal(quota(db).used,30);assert.equal(quota(db).reserved,0);
  db.exec("UPDATE jobs SET deleted_at=NULL, status='completed' WHERE id='last'");
  assert.equal(quota(db).used,30);assert.equal(claim(db,"bypass",4),0);
  db.close();
});
test("requests larger than the remaining budget are refused before upstream submission",()=>{
  const db=database();add(db,"previous","completed",19);
  assert.throws(()=>assertVideoQuota(quota(db),12),/不足以生成/);
  assert.equal(claim(db,"over",12),0);assert.equal(claim(db,"exact",11),1);
  db.exec("UPDATE jobs SET status='completed' WHERE id='exact'");
  assert.equal(quota(db).disabled,true);
  db.close();
});

test("29 used seconds leave one unusable second; old usage above the new cap is retained",()=>{
  const db=database();add(db,"previous","completed",29);
  assert.equal(quota(db).remaining,1);assert.equal(quota(db).unavailable,true);
  assert.equal(claim(db,"cannot-fit",4),0);assert.throws(()=>assertVideoQuota(quota(db),4),/剩余 1 秒/);
  add(db,"historical","completed",5);
  assert.equal(quota(db).used,34);assert.equal(quota(db).remaining,0);assert.equal(quota(db).disabled,true);
  assert.throws(()=>assertVideoQuota(quota(db),4),/30 秒/);db.close();
});
