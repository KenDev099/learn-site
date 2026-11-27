-- Up Migration
SET lock_timeout = '3s';
ALTER TABLE customers RENAME COLUMN phone TO mobile;
