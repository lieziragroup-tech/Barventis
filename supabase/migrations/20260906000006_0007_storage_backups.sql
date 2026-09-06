-- Tambahkan path storage dan drop not null di json data
ALTER TABLE backups ADD COLUMN storage_path text;
ALTER TABLE backups ALTER COLUMN data_json DROP NOT NULL;
