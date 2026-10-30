-- Every insert/update on a synced table takes the next value of one global sequence as its
-- row version. Devices pull "rows with version > my cursor", so any change, including a
-- tombstone (deleted_at set), reaches every device.
CREATE SEQUENCE IF NOT EXISTS sync_version_seq;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bump_sync_version() RETURNS trigger AS $$
BEGIN
  NEW.version := nextval('sync_version_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER clients_sync_version BEFORE INSERT OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER invoices_sync_version BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER line_items_sync_version BEFORE INSERT OR UPDATE ON line_items FOR EACH ROW EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER payments_sync_version BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER firm_profile_sync_version BEFORE INSERT OR UPDATE ON firm_profile FOR EACH ROW EXECUTE FUNCTION bump_sync_version();
