CREATE DATABASE IF NOT EXISTS parknest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE parknest;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','guard','owner') NOT NULL DEFAULT 'owner',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vehicle_owners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  phone VARCHAR(30),
  department VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  plate_number VARCHAR(30) NOT NULL UNIQUE,
  vehicle_type ENUM('Car','Motorcycle','Bicycle','Other') NOT NULL DEFAULT 'Car',
  make_model VARCHAR(100),
  color VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES vehicle_owners(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS parking_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 30.00,
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS parking_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zone_id INT NOT NULL,
  slot_code VARCHAR(20) NOT NULL UNIQUE,
  slot_type ENUM('Car','Motorcycle','Any') NOT NULL DEFAULT 'Any',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (zone_id) REFERENCES parking_zones(id)
);
CREATE TABLE IF NOT EXISTS parking_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  slot_id INT NOT NULL,
  entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_time DATETIME NULL,
  duration_minutes INT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('active','completed') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (slot_id) REFERENCES parking_slots(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_session_status(status), INDEX idx_session_entry(entry_time)
);
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','card','mobile_banking','waived') NOT NULL DEFAULT 'cash',
  status ENUM('paid','pending','refunded') NOT NULL DEFAULT 'paid',
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  received_by INT NULL,
  FOREIGN KEY (session_id) REFERENCES parking_sessions(id),
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS violations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  slot_id INT NULL,
  description VARCHAR(255) NOT NULL,
  fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  recorded_by INT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (slot_id) REFERENCES parking_slots(id) ON DELETE SET NULL,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO parking_zones (id,name,hourly_rate,description) VALUES
(1,'North Wing',30,'Main academic building'),(2,'Library Zone',25,'Near the central library'),(3,'Sports Complex',20,'Sports and event parking');
INSERT IGNORE INTO parking_slots (zone_id,slot_code,slot_type) VALUES
(1,'N-01','Car'),(1,'N-02','Car'),(1,'N-03','Any'),(1,'N-04','Motorcycle'),
(2,'L-01','Car'),(2,'L-02','Any'),(2,'L-03','Motorcycle'),(2,'L-04','Any'),
(3,'S-01','Car'),(3,'S-02','Car'),(3,'S-03','Any'),(3,'S-04','Motorcycle');

DELIMITER //
DROP TRIGGER IF EXISTS prevent_double_booking//
CREATE TRIGGER prevent_double_booking
BEFORE INSERT ON parking_sessions FOR EACH ROW
BEGIN
  IF NEW.status = 'active' AND EXISTS (SELECT 1 FROM parking_sessions WHERE slot_id=NEW.slot_id AND status='active') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This parking slot is already occupied';
  END IF;
END//
DROP TRIGGER IF EXISTS prevent_vehicle_double_parking//
CREATE TRIGGER prevent_vehicle_double_parking
BEFORE INSERT ON parking_sessions FOR EACH ROW
BEGIN
  IF NEW.status = 'active' AND EXISTS (SELECT 1 FROM parking_sessions WHERE vehicle_id=NEW.vehicle_id AND status='active') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This vehicle already has an active parking session';
  END IF;
END//
DELIMITER ;
