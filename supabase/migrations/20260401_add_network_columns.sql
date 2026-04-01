ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS proxy_url text DEFAULT '';
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS network_type text DEFAULT 'wifi';
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS proxy_rotate boolean DEFAULT false;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS tethering_carrier text DEFAULT 'skt';
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS tethering_auto_reconnect boolean DEFAULT false;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS tethering_reconnect_interval text DEFAULT 'per_batch';
