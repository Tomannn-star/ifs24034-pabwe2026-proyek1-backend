import bcrypt from "bcryptjs";
import defaultDb from "./db.js";

/**
 * Menjalankan proses seeding data awal aplikasi KasPintar.
 * Bersifat idempoten: jika data sudah ada, fungsi tidak menduplikasi data.
 * Mendukung opsi reset untuk mengosongkan dan mengisi ulang dari awal.
 * 
 * @param {import("bun:sqlite").Database} [targetDb] - Database target
 * @param {{ reset?: boolean }} [options] - Opsi eksekusi
 */
export function seed(targetDb = defaultDb, options = {}) {
  const isReset = options.reset || process.argv.includes("--reset");

  // 1. Bersihkan tabel jika opsi reset aktif
  if (isReset) {
    targetDb.run("PRAGMA foreign_keys = OFF;");
    targetDb.run("DELETE FROM transactions;");
    targetDb.run("DELETE FROM dues;");
    targetDb.run("DELETE FROM users;");
    targetDb.run("DELETE FROM members;");
    targetDb.run("DELETE FROM categories;");
    targetDb.run("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'dues', 'users', 'members', 'categories');");
    targetDb.run("PRAGMA foreign_keys = ON;");
    console.log("🧹 Database berhasil direset.");
  }

  // 2. Periksa apakah tabel sudah terisi
  const userCount = targetDb.query("SELECT COUNT(*) as count FROM users").get()?.count || 0;
  if (!isReset && userCount > 0) {
    console.log("ℹ️  Database sudah memiliki data (seed dilewati). Gunakan flag --reset untuk menimpa.");
    return;
  }

  console.log("🌱 Menjalankan seed data KasPintar...");

  const runSeeding = targetDb.transaction(() => {
    // -------------------------------------------------------------
    // A. Kategori (5 kategori: 2 masuk, 3 keluar)
    // -------------------------------------------------------------
    const insertCategory = targetDb.prepare(
      "INSERT INTO categories (id, nama, jenis) VALUES (?, ?, ?)"
    );

    const categories = [
      [1, "Iuran Kas Wajib", "masuk"],
      [2, "Donasi & Kas Sukarela", "masuk"],
      [3, "ATK & Perlengkapan Kelas", "keluar"],
      [4, "Kegiatan & Konsumsi Kelas", "keluar"],
      [5, "Fotokopi Materi & Modul", "keluar"]
    ];

    for (const cat of categories) {
      insertCategory.run(cat[0], cat[1], cat[2]);
    }

    // -------------------------------------------------------------
    // B. Anggota (10 anggota kelas)
    // -------------------------------------------------------------
    const insertMember = targetDb.prepare(
      "INSERT INTO members (id, nama, kontak, aktif, created_at) VALUES (?, ?, ?, ?, ?)"
    );

    const members = [
      [1, "Ahmad Fauzi", "081234567801", 1, "2026-08-01 08:00:00"],
      [2, "Budi Santoso", "081234567802", 1, "2026-08-01 08:00:00"],
      [3, "Citra Dewi", "081234567803", 1, "2026-08-01 08:00:00"],
      [4, "Dedi Kurniawan", "081234567804", 1, "2026-08-01 08:00:00"],
      [5, "Eka Putri", "081234567805", 1, "2026-08-01 08:00:00"],
      [6, "Fajar Pratama", "081234567806", 1, "2026-08-01 08:00:00"],
      [7, "Gita Permata", "081234567807", 1, "2026-08-01 08:00:00"],
      [8, "Hadi Wijaya", "081234567808", 1, "2026-08-01 08:00:00"],
      [9, "Indah Sari", "081234567809", 1, "2026-08-01 08:00:00"],
      [10, "Joko Susilo", "081234567810", 1, "2026-08-01 08:00:00"]
    ];

    for (const m of members) {
      insertMember.run(m[0], m[1], m[2], m[3], m[4]);
    }

    // -------------------------------------------------------------
    // C. Pengguna Demo (1 bendahara + 3 akun anggota)
    // -------------------------------------------------------------
    const insertUser = targetDb.prepare(
      "INSERT INTO users (id, username, password_hash, role, member_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const bendaharaHash = bcrypt.hashSync("bendahara123", 10);
    const anggotaHash = bcrypt.hashSync("anggota123", 10);

    const users = [
      [1, "bendahara", bendaharaHash, "bendahara", null, "2026-08-01 08:00:00"],
      [2, "anggota1", anggotaHash, "anggota", 1, "2026-08-01 08:05:00"], // Ahmad Fauzi
      [3, "anggota2", anggotaHash, "anggota", 2, "2026-08-01 08:05:00"], // Budi Santoso
      [4, "anggota3", anggotaHash, "anggota", 3, "2026-08-01 08:05:00"]  // Citra Dewi
    ];

    for (const u of users) {
      insertUser.run(u[0], u[1], u[2], u[3], u[4], u[5]);
    }

    // -------------------------------------------------------------
    // D. Data Iuran (Dues) 3 Periode
    // Nominal: Rp 20.000 / bulan
    // -------------------------------------------------------------
    const insertDue = targetDb.prepare(
      "INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status, tanggal_bayar) VALUES (?, ?, ?, ?, ?, ?)"
    );

    // Periode 1: 2026-08 (Semua 10 anggota lunas)
    for (let mId = 1; mId <= 10; mId++) {
      const payDay = String(mId + 2).padStart(2, "0");
      insertDue.run(mId, "2026-08", 20000, "2026-08-10", "lunas", `2026-08-${payDay}`);
    }

    // Periode 2: 2026-09 (Jatuh tempo 2026-09-10 - Sebagian lunas, sebagian belum -> Terlambat!)
    // Lunas: 1, 3, 4, 5, 6, 7, 10
    // Belum (Terlambat): 2 (Budi), 8 (Hadi), 9 (Indah)
    const paidSept = [1, 3, 4, 5, 6, 7, 10];
    for (let mId = 1; mId <= 10; mId++) {
      if (paidSept.includes(mId)) {
        insertDue.run(mId, "2026-09", 20000, "2026-09-10", "lunas", `2026-09-0${mId + 1}`);
      } else {
        insertDue.run(mId, "2026-09", 20000, "2026-09-10", "belum", null);
      }
    }

    // Periode 3: 2026-10 (Jatuh tempo 2026-10-28 - Sebagian lunas, sebagian belum -> Belum jatuh tempo!)
    // Lunas: 3, 4, 5, 6, 7
    // Belum (Belum jatuh tempo): 1 (Ahmad), 2 (Budi), 8 (Hadi), 9 (Indah), 10 (Joko)
    const paidOct = [3, 4, 5, 6, 7];
    for (let mId = 1; mId <= 10; mId++) {
      if (paidOct.includes(mId)) {
        insertDue.run(mId, "2026-10", 20000, "2026-10-28", "lunas", `2026-10-${10 + mId}`);
      } else {
        insertDue.run(mId, "2026-10", 20000, "2026-10-28", "belum", null);
      }
    }

    // -------------------------------------------------------------
    // E. Data Transaksi (30 transaksi di 3 bulan berbeda: Agustus, September, Oktober 2026)
    // -------------------------------------------------------------
    const insertTx = targetDb.prepare(
      "INSERT INTO transactions (tanggal, jenis, jumlah, category_id, member_id, keterangan, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const transactions = [
      // --- BULAN AGUSTUS 2026 ---
      // 10 iuran masuk
      ["2026-08-03", "masuk", 20000, 1, 1, "Iuran kas Agustus - Ahmad Fauzi", 1, "2026-08-03 09:00:00"],
      ["2026-08-04", "masuk", 20000, 1, 2, "Iuran kas Agustus - Budi Santoso", 1, "2026-08-04 09:15:00"],
      ["2026-08-05", "masuk", 20000, 1, 3, "Iuran kas Agustus - Citra Dewi", 1, "2026-08-05 10:00:00"],
      ["2026-08-06", "masuk", 20000, 1, 4, "Iuran kas Agustus - Dedi Kurniawan", 1, "2026-08-06 10:30:00"],
      ["2026-08-07", "masuk", 20000, 1, 5, "Iuran kas Agustus - Eka Putri", 1, "2026-08-07 11:00:00"],
      ["2026-08-08", "masuk", 20000, 1, 6, "Iuran kas Agustus - Fajar Pratama", 1, "2026-08-08 11:30:00"],
      ["2026-08-09", "masuk", 20000, 1, 7, "Iuran kas Agustus - Gita Permata", 1, "2026-08-09 13:00:00"],
      ["2026-08-10", "masuk", 20000, 1, 8, "Iuran kas Agustus - Hadi Wijaya", 1, "2026-08-10 13:30:00"],
      ["2026-08-11", "masuk", 20000, 1, 9, "Iuran kas Agustus - Indah Sari", 1, "2026-08-11 14:00:00"],
      ["2026-08-12", "masuk", 20000, 1, 10, "Iuran kas Agustus - Joko Susilo", 1, "2026-08-12 14:30:00"],
      // 3 pengeluaran Agustus
      ["2026-08-12", "keluar", 35000, 3, null, "Pembelian spidol boardmarker & penghapus kelas", 1, "2026-08-12 15:00:00"],
      ["2026-08-18", "keluar", 45000, 5, null, "Fotokopi materi kuliah Bab 1 & Bab 2", 1, "2026-08-18 10:00:00"],
      ["2026-08-25", "keluar", 50000, 4, null, "Snack rapat pembentukan struktur pengurus kelas", 1, "2026-08-25 16:00:00"],

      // --- BULAN SEPTEMBER 2026 ---
      // 1 donasi masuk
      ["2026-09-02", "masuk", 150000, 2, null, "Donasi pembina kelas untuk kas bersama", 1, "2026-09-02 08:30:00"],
      // 7 iuran masuk
      ["2026-09-02", "masuk", 20000, 1, 1, "Iuran kas September - Ahmad Fauzi", 1, "2026-09-02 09:00:00"],
      ["2026-09-04", "masuk", 20000, 1, 3, "Iuran kas September - Citra Dewi", 1, "2026-09-04 10:00:00"],
      ["2026-09-05", "masuk", 20000, 1, 4, "Iuran kas September - Dedi Kurniawan", 1, "2026-09-05 10:30:00"],
      ["2026-09-06", "masuk", 20000, 1, 5, "Iuran kas September - Eka Putri", 1, "2026-09-06 11:00:00"],
      ["2026-09-07", "masuk", 20000, 1, 6, "Iuran kas September - Fajar Pratama", 1, "2026-09-07 11:30:00"],
      ["2026-09-08", "masuk", 20000, 1, 7, "Iuran kas September - Gita Permata", 1, "2026-09-08 13:00:00"],
      ["2026-09-09", "masuk", 20000, 1, 10, "Iuran kas September - Joko Susilo", 1, "2026-09-09 13:30:00"],
      // 3 pengeluaran September
      ["2026-09-14", "keluar", 55000, 3, null, "Pembelian kertas HVS A4 & map binder kas", 1, "2026-09-14 14:00:00"],
      ["2026-09-20", "keluar", 40000, 5, null, "Fotokopi lembar kerja praktikum modul 3", 1, "2026-09-20 10:30:00"],
      ["2026-09-27", "keluar", 45000, 4, null, "Konsumsi kerja kelompok praktikum kelas", 1, "2026-09-27 15:30:00"],

      // --- BULAN OKTOBER 2026 ---
      // 1 donasi masuk
      ["2026-10-04", "masuk", 75000, 2, null, "Sisa dana operasional bazar kampus kelas", 1, "2026-10-04 11:00:00"],
      // 5 iuran masuk
      ["2026-10-13", "masuk", 20000, 1, 3, "Iuran kas Oktober - Citra Dewi", 1, "2026-10-13 09:30:00"],
      ["2026-10-14", "masuk", 20000, 1, 4, "Iuran kas Oktober - Dedi Kurniawan", 1, "2026-10-14 10:00:00"],
      ["2026-10-15", "masuk", 20000, 1, 5, "Iuran kas Oktober - Eka Putri", 1, "2026-10-15 10:30:00"],
      ["2026-10-16", "masuk", 20000, 1, 6, "Iuran kas Oktober - Fajar Pratama", 1, "2026-10-16 11:00:00"],
      ["2026-10-17", "masuk", 20000, 1, 7, "Iuran kas Oktober - Gita Permata", 1, "2026-10-17 11:30:00"],
      // 3 pengeluaran Oktober
      ["2026-10-08", "keluar", 30000, 3, null, "Tinta spidol whiteboard refill & solatip hitam", 1, "2026-10-08 13:00:00"],
      ["2026-10-15", "keluar", 35000, 5, null, "Fotokopi kisi-kisi dan latihan soal UTS", 1, "2026-10-15 14:00:00"],
      ["2026-10-21", "keluar", 60000, 4, null, "Konsumsi belajar bersama persiapan ujian mid semester", 1, "2026-10-21 16:30:00"]
    ];

    for (const tx of transactions) {
      insertTx.run(tx[0], tx[1], tx[2], tx[3], tx[4], tx[5], tx[6], tx[7]);
    }
  });

  runSeeding();
  console.log("✅ Seed data KasPintar berhasil dimuat!");
}

// Jika file dijalankan langsung via CLI: bun seed.js
if (import.meta.main) {
  seed();
}

