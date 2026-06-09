CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin') NOT NULL DEFAULT 'admin',
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(160) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'scripts',
  description TEXT NOT NULL,
  image_url LONGTEXT NULL,
  old_price DECIMAL(10, 2) NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  badge VARCHAR(80) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status ENUM('pendiente', 'pagado', 'cancelado', 'entregado') NOT NULL DEFAULT 'pendiente',
  source VARCHAR(80) NOT NULL DEFAULT 'pagina',
  session_id VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_sales_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('page_view', 'discord_click', 'buy_click') NOT NULL,
  source VARCHAR(120) NULL,
  session_id VARCHAR(120) NULL,
  product_id INT NULL,
  metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('discordInvite', 'https://discord.gg/nszkHtaWJE'),
  ('storeName', 'Sxnsi Blassed')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
