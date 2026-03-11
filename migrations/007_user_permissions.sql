-- Add per-user page and company access restrictions
-- NULL = unrestricted (use role-based rules)
-- JSON array string = only allow listed items

ALTER TABLE users ADD COLUMN allowed_pages TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN allowed_companies TEXT DEFAULT NULL;

