CREATE OR REPLACE FUNCTION check_ledger_balance()RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant text; journal text; total numeric; lines integer;
BEGIN
 tenant=COALESCE(NEW.organization_id,OLD.organization_id);
 IF TG_TABLE_NAME='ledger_journals' THEN journal=COALESCE(NEW.id,OLD.id);ELSE journal=COALESCE(NEW.journal_id,OLD.journal_id);END IF;
 IF EXISTS(SELECT 1 FROM ledger_journals WHERE organization_id=tenant AND id=journal)THEN
  SELECT COALESCE(sum(cents),0),count(*)INTO total,lines FROM ledger_postings WHERE organization_id=tenant AND journal_id=journal;
  IF total<>0 OR lines<2 THEN RAISE EXCEPTION 'Financial journal must contain balanced postings';END IF;
 END IF;
 RETURN NULL;
END$$;
DROP TRIGGER IF EXISTS journal_balance ON ledger_journals;
CREATE CONSTRAINT TRIGGER journal_balance AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();
DROP TRIGGER IF EXISTS posting_balance ON ledger_postings;
CREATE CONSTRAINT TRIGGER posting_balance AFTER INSERT OR UPDATE OR DELETE ON ledger_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';
