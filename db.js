import { Database } from "bun:sqlite";

/**
 * Inisialisasi skema database SQLite untuk KasPintar.
 * Menjalankan PRAGMA foreign_keys = ON dan membuat tabel-tabel utama jika belum ada.
 * 
 * @param {Database} db - Objek Database dari bun:sqlite
 */
export function initSchema(db) {
  // Aktifkan foreign key enforcement
  db.run("PRAGMA foreign_keys = ON;");

  // Buat tabel-tabel dengan DDL sesuai spesifikasi
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL UNIQUE,
      jenis TEXT NOT NULL CHECK(jenis IN ('masuk', 'keluar'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kontak TEXT,
      aktif INTEGER NOT NULL DEFAULT 1 CHECK(aktif IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('bendahara', 'anggota')),
      member_id INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      jenis TEXT NOT NULL CHECK(jenis IN ('masuk', 'keluar')),
      jumlah INTEGER NOT NULL CHECK(jumlah > 0),
      category_id INTEGER NOT NULL,
      member_id INTEGER NULL,
      keterangan TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS dues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      periode TEXT NOT NULL,
      nominal INTEGER NOT NULL CHECK(nominal > 0),
      jatuh_tempo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'belum' CHECK(status IN ('belum', 'lunas')),
      tanggal_bayar TEXT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(member_id, periode)
    );
  `);
}

/**
 * Mendeteksi path database yang aman untuk runtime lokal maupun Vercel Serverless.
 * Pada Vercel Serverless, hanya direktori /tmp yang memiliki izin write.
 */
export function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const isServerless = process.env.VERCEL === "1" || 
                       process.env.VERCEL === "true" || 
                       !!process.env.AWS_LAMBDA_FUNCTION_NAME || 
                       !!process.env.NOW_REGION;
  return isServerless ? "/tmp/kaspintar.db" : "./kaspintar.db";
}

/**
 * Membuat atau membuka koneksi database baru.
 * 
 * @param {string} [dbPath] - Path file SQLite, default dari resolveDbPath()
 * @returns {Database} Objek Database yang sudah diaktifkan foreign keys dan skemanya
 */
export function createDatabase(dbPath = resolveDbPath()) {
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

// Instance database default untuk aplikasi
const db = createDatabase();
export default db;

