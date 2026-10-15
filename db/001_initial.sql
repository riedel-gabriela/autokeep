CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS organizations (
 id CHAR(36) PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 kind ENUM('PERSONAL','FLEET') NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS memberships (
 organization_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 role ENUM('ADMIN','DRIVER') NOT NULL,
 PRIMARY KEY (organization_id,user_id),
 FOREIGN KEY (organization_id) REFERENCES organizations(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS vehicles (
 id CHAR(36) PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 name VARCHAR(100) NOT NULL,
 plate VARCHAR(10) NOT NULL,
 year SMALLINT NOT NULL,
 oil_type ENUM('MINERAL','SEMI_SYNTHETIC','SYNTHETIC') NOT NULL,
 tracking_mode ENUM('MANUAL','OBD2') NOT NULL,
 current_odometer DECIMAL(10,1) NOT NULL,
 last_update_date DATETIME(3) NOT NULL,
 last_oil_change_km DECIMAL(10,1) NOT NULL,
 last_oil_change_date DATETIME(3) NOT NULL,
 assigned_driver_id CHAR(36),
 archived_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (organization_id) REFERENCES organizations(id),
 FOREIGN KEY (organization_id,assigned_driver_id) REFERENCES memberships(organization_id,user_id),
 INDEX vehicles_org (organization_id,archived_at)
);
CREATE TABLE IF NOT EXISTS readings (
 id CHAR(36) PRIMARY KEY,
 vehicle_id CHAR(36) NOT NULL,
 odometer DECIMAL(10,1) NOT NULL,
 measured_at DATETIME(3) NOT NULL,
 source ENUM('MANUAL','OBD2') NOT NULL,
 actor_id CHAR(36) NOT NULL,
 FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
 FOREIGN KEY (actor_id) REFERENCES users(id),
 INDEX readings_vehicle (vehicle_id,measured_at)
);
CREATE TABLE IF NOT EXISTS oil_changes (
 id CHAR(36) PRIMARY KEY,
 vehicle_id CHAR(36) NOT NULL,
 odometer DECIMAL(10,1) NOT NULL,
 changed_at DATETIME(3) NOT NULL,
 oil_type ENUM('MINERAL','SEMI_SYNTHETIC','SYNTHETIC') NOT NULL,
 actor_id CHAR(36) NOT NULL,
 FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
 FOREIGN KEY (actor_id) REFERENCES users(id),
 INDEX oil_vehicle (vehicle_id,changed_at)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX sessions_expiry (expires_at)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id CHAR(36) PRIMARY KEY,
 organization_id CHAR(36),
 actor_id CHAR(36) NOT NULL,
 vehicle_id CHAR(36),
 action VARCHAR(60) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (organization_id) REFERENCES organizations(id),
 FOREIGN KEY (actor_id) REFERENCES users(id),
 FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
 INDEX audit_org (organization_id,created_at)
);
CREATE TABLE IF NOT EXISTS invitations (
 id CHAR(36) PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 email VARCHAR(254) NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at DATETIME(3) NOT NULL,
 accepted_at DATETIME(3),
 FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id CHAR(36) PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 vehicle_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 event_key VARCHAR(180) NOT NULL,
 title VARCHAR(150) NOT NULL,
 body VARCHAR(500) NOT NULL,
 read_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY unique_delivery (user_id,event_key),
 FOREIGN KEY (organization_id) REFERENCES organizations(id),
 FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
