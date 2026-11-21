CREATE DATABASE IF NOT EXISTS chargepilot CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE chargepilot;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('ADMIN','EV_OWNER') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role_active(role,is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  registration_number VARCHAR(20) NOT NULL UNIQUE,
  battery_capacity_kwh DECIMAL(7,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_owner FOREIGN KEY(owner_id) REFERENCES users(id),
  CONSTRAINT chk_vehicle_battery CHECK(battery_capacity_kwh BETWEEN 5 AND 500),
  INDEX idx_vehicles_owner(owner_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS charging_stations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  capacity_kw DECIMAL(9,2) NOT NULL,
  status ENUM('ACTIVE','INACTIVE','MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_station_capacity CHECK(capacity_kw > 0),
  UNIQUE KEY uq_station_name_address(name,address),
  INDEX idx_stations_status_city(status,city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chargers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  station_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  connector_type ENUM('CCS2','TYPE2','CHADEMO','NACS') NOT NULL DEFAULT 'CCS2',
  max_power_kw DECIMAL(8,2) NOT NULL,
  status ENUM('AVAILABLE','IN_USE','OFFLINE','MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
  CONSTRAINT fk_charger_station FOREIGN KEY(station_id) REFERENCES charging_stations(id),
  CONSTRAINT chk_charger_power CHECK(max_power_kw > 0),
  UNIQUE KEY uq_charger_name_station(station_id,name),
  INDEX idx_chargers_station_status(station_id,status,max_power_kw)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tariffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  station_id BIGINT UNSIGNED NULL,
  price_per_kwh DECIMAL(8,3) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tariff_station FOREIGN KEY(station_id) REFERENCES charging_stations(id),
  CONSTRAINT chk_tariff_price CHECK(price_per_kwh >= 0),
  INDEX idx_tariffs_station_valid(station_id,valid_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS charging_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  station_id BIGINT UNSIGNED NOT NULL,
  requested_kw DECIMAL(8,2) NOT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 3,
  status ENUM('PENDING','ALLOCATED','WAITLISTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_request_owner FOREIGN KEY(owner_id) REFERENCES users(id),
  CONSTRAINT fk_request_vehicle FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_request_station FOREIGN KEY(station_id) REFERENCES charging_stations(id),
  CONSTRAINT chk_request_kw CHECK(requested_kw > 0),
  CONSTRAINT chk_request_priority CHECK(priority BETWEEN 1 AND 5),
  INDEX idx_requests_owner_created(owner_id,created_at),
  INDEX idx_requests_station_status(station_id,status,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS charging_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL UNIQUE,
  station_id BIGINT UNSIGNED NOT NULL,
  charger_id BIGINT UNSIGNED NOT NULL,
  allocated_kw DECIMAL(8,2) NOT NULL,
  status ENUM('ALLOCATED','RELEASED','CANCELLED') NOT NULL DEFAULT 'ALLOCATED',
  allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_allocation_request FOREIGN KEY(request_id) REFERENCES charging_requests(id),
  CONSTRAINT fk_allocation_station FOREIGN KEY(station_id) REFERENCES charging_stations(id),
  CONSTRAINT fk_allocation_charger FOREIGN KEY(charger_id) REFERENCES chargers(id),
  CONSTRAINT chk_allocation_kw CHECK(allocated_kw > 0),
  INDEX idx_allocations_station_status(station_id,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS charging_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL UNIQUE,
  allocation_id BIGINT UNSIGNED NOT NULL UNIQUE,
  status ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  energy_kwh DECIMAL(10,3) NOT NULL DEFAULT 0,
  cost_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_session_request FOREIGN KEY(request_id) REFERENCES charging_requests(id),
  CONSTRAINT fk_session_allocation FOREIGN KEY(allocation_id) REFERENCES charging_allocations(id),
  CONSTRAINT chk_session_energy CHECK(energy_kwh >= 0),
  INDEX idx_sessions_status_started(status,started_at),
  INDEX idx_sessions_started(started_at)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS trg_session_release_resources$$
DROP PROCEDURE IF EXISTS sp_complete_session$$
DROP FUNCTION IF EXISTS fn_charging_cost$$

CREATE FUNCTION fn_charging_cost(p_energy_kwh DECIMAL(10,3), p_price_per_kwh DECIMAL(8,3))
RETURNS DECIMAL(10,2) DETERMINISTIC
RETURN ROUND(GREATEST(0,p_energy_kwh) * GREATEST(0,p_price_per_kwh),2)$$

CREATE TRIGGER trg_session_release_resources
AFTER UPDATE ON charging_sessions FOR EACH ROW
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status IN ('COMPLETED','CANCELLED') THEN
    UPDATE charging_allocations SET status='RELEASED' WHERE id=NEW.allocation_id;
    UPDATE chargers c JOIN charging_allocations a ON a.charger_id=c.id
      SET c.status='AVAILABLE' WHERE a.id=NEW.allocation_id AND c.status='IN_USE';
    UPDATE charging_requests SET status=IF(NEW.status='COMPLETED','COMPLETED','CANCELLED') WHERE id=NEW.request_id;
  END IF;
END$$

CREATE PROCEDURE sp_complete_session(IN p_session_id BIGINT UNSIGNED, IN p_energy_kwh DECIMAL(10,3))
BEGIN
  DECLARE v_price DECIMAL(8,3) DEFAULT 0;
  SELECT COALESCE(t.price_per_kwh,0) INTO v_price
    FROM charging_sessions cs
    JOIN charging_allocations a ON a.id=cs.allocation_id
    LEFT JOIN tariffs t ON (t.station_id=a.station_id OR t.station_id IS NULL) AND t.valid_from<=CURRENT_TIMESTAMP
    WHERE cs.id=p_session_id ORDER BY (t.station_id IS NOT NULL) DESC,t.valid_from DESC LIMIT 1;
  UPDATE charging_sessions SET status='COMPLETED',ended_at=CURRENT_TIMESTAMP,
    energy_kwh=GREATEST(0,p_energy_kwh),cost_amount=fn_charging_cost(p_energy_kwh,v_price)
    WHERE id=p_session_id AND status='ACTIVE';
END$$
DELIMITER ;

CREATE OR REPLACE VIEW vw_station_load AS
SELECT st.id AS station_id,st.name,st.city,st.capacity_kw,
  COALESCE(SUM(CASE WHEN se.status='ACTIVE' THEN al.allocated_kw ELSE 0 END),0) AS active_load_kw,
  GREATEST(st.capacity_kw-COALESCE(SUM(CASE WHEN se.status='ACTIVE' THEN al.allocated_kw ELSE 0 END),0),0) AS available_kw,
  ROUND(100*COALESCE(SUM(CASE WHEN se.status='ACTIVE' THEN al.allocated_kw ELSE 0 END),0)/st.capacity_kw,1) AS utilization_pct
FROM charging_stations st
LEFT JOIN charging_allocations al ON al.station_id=st.id
LEFT JOIN charging_sessions se ON se.allocation_id=al.id
GROUP BY st.id,st.name,st.city,st.capacity_kw;

CREATE OR REPLACE VIEW vw_session_billing AS
SELECT cs.id AS session_id,cs.status,cs.started_at,cs.ended_at,cs.energy_kwh,cs.cost_amount,
  u.name AS owner_name,v.registration_number,st.name AS station_name,c.name AS charger_name
FROM charging_sessions cs
JOIN charging_requests r ON r.id=cs.request_id
JOIN users u ON u.id=r.owner_id
JOIN vehicles v ON v.id=r.vehicle_id
JOIN charging_allocations a ON a.id=cs.allocation_id
JOIN charging_stations st ON st.id=a.station_id
JOIN chargers c ON c.id=a.charger_id;
