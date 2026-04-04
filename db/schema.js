const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../db/ihaul.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    vehicle_type TEXT,
    vehicle_description TEXT,
    haul_types TEXT DEFAULT '["envelope","small_box","medium_box"]',
    stripe_customer_id TEXT,
    stripe_connect_id TEXT,
    stripe_connect_verified INTEGER DEFAULT 0,
    rating_total INTEGER DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    background_check TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    shipper_id TEXT NOT NULL,
    driver_id TEXT,
    job_type TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'open',
    title TEXT NOT NULL,
    description TEXT,
    item_size TEXT NOT NULL,
    item_weight REAL,
    fragile INTEGER DEFAULT 0,
    needs_disassembly INTEGER DEFAULT 0,
    pickup_address TEXT NOT NULL,
    pickup_city TEXT NOT NULL,
    dropoff_address TEXT NOT NULL,
    dropoff_city TEXT NOT NULL,
    offered_price REAL NOT NULL,
    platform_fee REAL NOT NULL,
    driver_payout REAL NOT NULL,
    listing_photos TEXT DEFAULT '[]',
    pickup_photos TEXT DEFAULT '[]',
    dropoff_photos TEXT DEFAULT '[]',
    pickup_signed_at DATETIME,
    dropoff_confirmed_at DATETIME,
    extra_data TEXT DEFAULT '{}',
    notes TEXT,
    driver_route_requested TEXT,
    stripe_payment_intent_id TEXT,
    stripe_transfer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(shipper_id) REFERENCES users(id),
    FOREIGN KEY(driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(job_id) REFERENCES jobs(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS driver_routes (
    id TEXT PRIMARY KEY,
    driver_id TEXT NOT NULL,
    origin_city TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    max_detour_minutes INTEGER DEFAULT 15,
    vehicle_description TEXT,
    haul_types TEXT DEFAULT '["small_box","medium_box"]',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    rater_id TEXT NOT NULL,
    ratee_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(job_id) REFERENCES jobs(id)
  );
`);

module.exports = db;
