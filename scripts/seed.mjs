import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { loadEnvFile } from "node:process";

try { loadEnvFile(".env.local"); } catch { /* Shell variables can be used when no local env file exists. */ }
try { loadEnvFile(".env.db.local"); } catch { /* Shell variables can be used when no local env file exists. */ }

const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const ownerPassword = process.env.SEED_OWNER_PASSWORD;
if (!adminPassword || !ownerPassword || adminPassword.length < 12 || ownerPassword.length < 12) {
  console.error("Set SEED_ADMIN_PASSWORD and SEED_OWNER_PASSWORD (12+ characters) before seeding.");
  process.exit(1);
}
const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE ?? "chargepilot",
});
try {
  await db.beginTransaction();
  const adminHash = await bcrypt.hash(adminPassword, 12), ownerHash = await bcrypt.hash(ownerPassword, 12);
  await db.execute("INSERT INTO users(name,email,password_hash,role) VALUES('ChargePilot Admin','admin@chargepilot.local',?,'ADMIN') ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),role='ADMIN'", [adminHash]);
  await db.execute("INSERT INTO users(name,email,password_hash,role) VALUES('Demo EV Owner','owner@chargepilot.local',?,'EV_OWNER') ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),role='EV_OWNER'", [ownerHash]);
  const [ownerRows] = await db.execute("SELECT id FROM users WHERE email='owner@chargepilot.local'");
  const owner = ownerRows[0];
  const [station] = await db.execute("INSERT INTO charging_stations(name,address,city,capacity_kw) VALUES('Central Innovation Hub','12 MG Road','Bengaluru',180) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)");
  const stationId = station.insertId;
  for (const [name, power] of [["Charger 01",60],["Charger 02",60],["Charger 03",30]]) {
    await db.execute("INSERT INTO chargers(station_id,name,max_power_kw) VALUES(?,?,?) ON DUPLICATE KEY UPDATE max_power_kw=VALUES(max_power_kw)", [stationId,name,power]);
  }
  const [tariffs] = await db.execute("SELECT id FROM tariffs WHERE station_id=?", [stationId]);
  if (tariffs.length === 0) await db.execute("INSERT INTO tariffs(station_id,price_per_kwh,currency) VALUES(?,18,'INR')", [stationId]);
  await db.execute("INSERT INTO vehicles(owner_id,make,model,registration_number,battery_capacity_kwh) VALUES(?, 'Tata','Nexon EV','KA01CP1001',40) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id)", [owner[0].id]);
  await db.commit();
  console.log("Demo accounts and station data are ready. Log in with admin@chargepilot.local or owner@chargepilot.local and the passwords you supplied in the environment.");
} catch (error) { await db.rollback(); throw error; } finally { await db.end(); }
