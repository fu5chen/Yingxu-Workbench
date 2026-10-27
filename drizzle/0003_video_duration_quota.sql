ALTER TABLE `jobs` ADD `quota_seconds` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE jobs SET quota_seconds=CAST(json_extract(request,'$.duration') AS INTEGER)
WHERE status='completed' AND json_extract(request,'$.model')='dreamina-seedance-2-5-260628' AND CAST(json_extract(request,'$.duration') AS INTEGER)>0;
--> statement-breakpoint
CREATE TRIGGER latch_video_quota_on_insert AFTER INSERT ON jobs
WHEN NEW.status='completed' AND json_extract(NEW.request,'$.model')='dreamina-seedance-2-5-260628' AND CAST(json_extract(NEW.request,'$.duration') AS INTEGER)>0
BEGIN
 UPDATE jobs SET quota_seconds=MAX(quota_seconds,CAST(json_extract(NEW.request,'$.duration') AS INTEGER)) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER latch_video_quota_on_success AFTER UPDATE OF status ON jobs
WHEN NEW.status='completed' AND json_extract(NEW.request,'$.model')='dreamina-seedance-2-5-260628' AND CAST(json_extract(NEW.request,'$.duration') AS INTEGER)>0
BEGIN
 UPDATE jobs SET quota_seconds=MAX(quota_seconds,CAST(json_extract(NEW.request,'$.duration') AS INTEGER)) WHERE id=NEW.id;
END;
