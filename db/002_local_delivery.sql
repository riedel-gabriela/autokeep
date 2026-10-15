ALTER TABLE vehicles ADD UNIQUE KEY vehicle_plate (organization_id,plate);
ALTER TABLE notifications ADD COLUMN email_sent_at DATETIME(3) NULL;
