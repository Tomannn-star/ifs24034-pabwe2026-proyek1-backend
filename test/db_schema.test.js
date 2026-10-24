import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase } from "../db.js";
import { seed } from "../seed.js";
import bcrypt from "bcryptjs";

describe("Tahap 1: Skema Database & Seed KasPintar", () => {
  let db;

  beforeEach(() => {
    // Gunakan in-memory database untuk isolasi pengujian yang bersih
    db = createDatabase(":memory:");
  });

  test("Foreign Key enforcement aktif dan menolak foreign key invalid", () => {
    // Coba insert user dengan member_id yang tidak ada di tabel members
    expect(() => {
      db.prepare(
        "INSERT INTO users (username, password_hash, role, member_id) VALUES (?, ?, ?, ?)"
      ).run("testuser", "hash123", "anggota", 999);
    }).toThrow(/FOREIGN KEY/i);
  });

  test("Check constraint pada jenis kategori ('masuk'/'keluar')", () => {
    expect(() => {
      db.prepare("INSERT INTO categories (nama, jenis) VALUES (?, ?)").run(
        "Invalid Cat",
        "ilegal"
      );
    }).toThrow(/CHECK constraint/i);
  });

  test("Check constraint pada jumlah transaksi (> 0)", () => {
    // Buat kategori & user dummy valid
    db.prepare("INSERT INTO categories (nama, jenis) VALUES (?, ?)").run("ATK", "keluar");
    db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    ).run("bendahara", "hash", "bendahara");

    // Transaksi dengan jumlah 0 harus gagal
    expect(() => {
      db.prepare(
        "INSERT INTO transactions (tanggal, jenis, jumlah, category_id, created_by) VALUES (?, ?, ?, ?, ?)"
      ).run("2026-10-23", "keluar", 0, 1, 1);
    }).toThrow(/CHECK constraint/i);

    // Transaksi dengan jumlah negatif harus gagal
    expect(() => {
      db.prepare(
        "INSERT INTO transactions (tanggal, jenis, jumlah, category_id, created_by) VALUES (?, ?, ?, ?, ?)"
      ).run("2026-10-23", "keluar", -15000, 1, 1);
    }).toThrow(/CHECK constraint/i);
  });

  test("Check constraint pada status dan nominal dues", () => {
    db.prepare("INSERT INTO members (nama) VALUES (?)").run("Test Member");

    // Status selain 'belum' atau 'lunas' harus gagal
    expect(() => {
      db.prepare(
        "INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "2026-10", 20000, "2026-10-28", "pending");
    }).toThrow(/CHECK constraint/i);

    // Nominal <= 0 harus gagal
    expect(() => {
      db.prepare(
        "INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "2026-10", 0, "2026-10-28", "belum");
    }).toThrow(/CHECK constraint/i);
  });

  test("Unique constraint (member_id, periode) pada tabel dues", () => {
    db.prepare("INSERT INTO members (nama) VALUES (?)").run("Test Member");

    db.prepare(
      "INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status) VALUES (?, ?, ?, ?, ?)"
    ).run(1, "2026-10", 20000, "2026-10-28", "belum");

    // Insert duplikat member_id dan periode yang sama harus gagal
    expect(() => {
      db.prepare(
        "INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "2026-10", 20000, "2026-10-28", "belum");
    }).toThrow(/UNIQUE constraint/i);
  });

  test("Seed berhasil mengisi data idempoten dan memverifikasi akun demo", () => {
    // Jalankan seed pertama kali
    seed(db);

    const categoriesCount = db.query("SELECT COUNT(*) as c FROM categories").get().c;
    const membersCount = db.query("SELECT COUNT(*) as c FROM members").get().c;
    const usersCount = db.query("SELECT COUNT(*) as c FROM users").get().c;
    const duesCount = db.query("SELECT COUNT(*) as c FROM dues").get().c;
    const txCount = db.query("SELECT COUNT(*) as c FROM transactions").get().c;

    expect(categoriesCount).toBe(5);
    expect(membersCount).toBe(10);
    expect(usersCount).toBe(4);
    expect(duesCount).toBe(30);
    expect(txCount).toBeGreaterThanOrEqual(25);

    // Verifikasi password hash akun demo
    const bendahara = db.query("SELECT * FROM users WHERE username = 'bendahara'").get();
    expect(bendahara).toBeDefined();
    expect(bendahara.role).toBe("bendahara");
    expect(bcrypt.compareSync("bendahara123", bendahara.password_hash)).toBe(true);

    const anggota1 = db.query("SELECT * FROM users WHERE username = 'anggota1'").get();
    expect(anggota1).toBeDefined();
    expect(anggota1.role).toBe("anggota");
    expect(anggota1.member_id).toBe(1);
    expect(bcrypt.compareSync("anggota123", anggota1.password_hash)).toBe(true);

    // Jalankan seed kedua kali (harus idempoten tanpa error dan tidak menggandakan data)
    seed(db);
    const usersCountAfter = db.query("SELECT COUNT(*) as c FROM users").get().c;
    expect(usersCountAfter).toBe(4);
  });
});

