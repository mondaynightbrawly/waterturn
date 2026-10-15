CREATE TABLE record_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),actor_user_id text REFERENCES app_users(id),command_id text,kind text NOT NULL,record_id text NOT NULL,action text NOT NULL,old_version bigint,new_version bigint,before_hash text,after_hash text,at timestamptz NOT NULL DEFAULT now());
ALTER TABLE record_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON record_audit USING(tenant_allowed(organization_id))WITH CHECK(tenant_allowed(organization_id));
CREATE INDEX record_audit_tenant ON record_audit(organization_id,kind,record_id,at);
CREATE FUNCTION audit_record_change()RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior records%ROWTYPE; next_record records%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE'AND OLD.payload=NEW.payload THEN RETURN NULL;END IF;
 IF TG_OP<>'INSERT'THEN prior=OLD;END IF;
 IF TG_OP<>'DELETE'THEN next_record=NEW;END IF;
 INSERT INTO record_audit(organization_id,actor_user_id,command_id,kind,record_id,action,old_version,new_version,before_hash,after_hash)
 VALUES(COALESCE(next_record.organization_id,prior.organization_id),NULLIF(current_setting('app.actor_id',true),''),NULLIF(current_setting('app.command_id',true),''),COALESCE(next_record.kind,prior.kind),COALESCE(next_record.id,prior.id),TG_OP,prior.version,next_record.version,CASE WHEN prior.payload IS NULL THEN NULL ELSE encode(sha256(convert_to(prior.payload::text,'UTF8')),'hex')END,CASE WHEN next_record.payload IS NULL THEN NULL ELSE encode(sha256(convert_to(next_record.payload::text,'UTF8')),'hex')END);
 RETURN NULL;
END$$;
CREATE TRIGGER record_changes AFTER INSERT OR UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION audit_record_change();
