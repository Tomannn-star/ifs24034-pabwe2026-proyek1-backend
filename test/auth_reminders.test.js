import { describe, test, expect, beforeAll } from "bun:test";
import request from "supertest";
import app from "../app.js";
import db from "../db.js";
import { seed } from "../seed.js";

describe("Tahap 3: Autentikasi dan Pengingat KasPintar", () => {
  let tokenBendahara;
  let tokenAnggota1;
  let tokenAnggota2;

  beforeAll(async () => {
    // Pastikan database terisi data seed awal
    seed(db, { reset: true });

    // Login sebagai bendahara
    const loginBendahara = await request(app)
      .post("/api/auth/login")
      .send({ username: "bendahara", password: "bendahara123" });
    tokenBendahara = loginBendahara.body.token;

    // Login sebagai anggota1 (Ahmad Fauzi)
    const loginAnggota1 = await request(app)
      .post("/api/auth/login")
      .send({ username: "anggota1", password: "anggota123" });
    tokenAnggota1 = loginAnggota1.body.token;

    // Login sebagai anggota2 (Budi Santoso - punya tunggakan terlambat September)
    const loginAnggota2 = await request(app)
      .post("/api/auth/login")
      .send({ username: "anggota2", password: "anggota123" });
    tokenAnggota2 = loginAnggota2.body.token;
  });

  // -------------------------------------------------------------
  // 1. Pengujian Autentikasi (/api/auth)
  // -------------------------------------------------------------
  describe("Autentikasi Pengguna", () => {
    test("Login berhasil untuk bendahara dan mengembalikan payload user valid tanpa password_hash", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "bendahara", password: "bendahara123" });

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe("bendahara");
      expect(res.body.user.role).toBe("bendahara");
      expect(res.body.user.password_hash).toBeUndefined(); // TIDAK boleh ada password_hash
    });

    test("Login berhasil untuk anggota dan menautkan member_id dan nama", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "anggota1", password: "anggota123" });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("anggota");
      expect(res.body.user.member_id).toBe(1);
      expect(res.body.user.nama).toBe("Ahmad Fauzi");
      expect(res.body.user.password_hash).toBeUndefined();
    });

    test("Login gagal dengan username salah (401, pesan error generik)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "usernametidakada", password: "password123" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Username atau password salah");
    });

    test("Login gagal dengan password salah (401, pesan error generik)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "bendahara", password: "passwordsalah123" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Username atau password salah");
    });

    test("Login gagal jika body kosong (400)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/wajib diisi/i);
    });

    test("GET /api/auth/me mengembalikan profil user yang sedang login", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenAnggota1}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("anggota1");
      expect(res.body.user.nama).toBe("Ahmad Fauzi");
      expect(res.body.user.password_hash).toBeUndefined();
    });

    test("Endpoint yang memerlukan auth menolak request tanpa token (401)", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/token tidak disertakan/i);
    });

    test("Endpoint yang memerlukan auth menolak token tidak valid (401)", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer token_palsu_ngawur_123");

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/token tidak valid/i);
    });
  });

  // -------------------------------------------------------------
  // 2. Pengujian Pengingat (/api/reminders)
  // -------------------------------------------------------------
  describe("Pengingat Iuran (/api/reminders)", () => {
    test("GET /api/reminders untuk anggota1 menampilkan tagihan belum bayar (belum jatuh tempo)", async () => {
      const res = await request(app)
        .get("/api/reminders")
        .set("Authorization", `Bearer ${tokenAnggota1}`);

      expect(res.status).toBe(200);
      expect(res.body.jumlah_belum_bayar).toBe(1); // Periode 2026-10
      expect(res.body.total_tunggakan).toBe(20000);
      expect(res.body.ada_terlambat).toBe(false);

      const item = res.body.iuran[0];
      expect(item.periode).toBe("2026-10");
      expect(item.terlambat).toBe(false);
      expect(item.sisa_hari).toBeGreaterThanOrEqual(0);
    });

    test("GET /api/reminders untuk anggota2 menandai status terlambat dengan benar", async () => {
      const res = await request(app)
        .get("/api/reminders")
        .set("Authorization", `Bearer ${tokenAnggota2}`);

      expect(res.status).toBe(200);
      expect(res.body.jumlah_belum_bayar).toBe(2); // Periode 2026-09 & 2026-10
      expect(res.body.total_tunggakan).toBe(40000);
      expect(res.body.ada_terlambat).toBe(true);

      // Cek item yang terlambat (September 2026)
      const septItem = res.body.iuran.find((i) => i.periode === "2026-09");
      expect(septItem).toBeDefined();
      expect(septItem.terlambat).toBe(true);
      expect(septItem.hari_terlambat).toBeGreaterThan(0);
    });

    test("GET /api/reminders untuk bendahara mengembalikan list kosong (tidak punya tagihan)", async () => {
      const res = await request(app)
        .get("/api/reminders")
        .set("Authorization", `Bearer ${tokenBendahara}`);

      expect(res.status).toBe(200);
      expect(res.body.total_tunggakan).toBe(0);
      expect(res.body.iuran.length).toBe(0);
    });

    test("GET /api/reminders/overdue ditolak jika diakses oleh anggota (403)", async () => {
      const res = await request(app)
        .get("/api/reminders/overdue")
        .set("Authorization", `Bearer ${tokenAnggota1}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/akses ditolak/i);
    });

    test("GET /api/reminders/overdue mengembalikan daftar anggota penunggak bagi bendahara", async () => {
      const res = await request(app)
        .get("/api/reminders/overdue")
        .set("Authorization", `Bearer ${tokenBendahara}`);

      expect(res.status).toBe(200);
      expect(res.body.total_anggota_menunggak).toBeGreaterThan(0);
      expect(res.body.grand_total_tunggakan).toBeGreaterThan(0);
      expect(Array.isArray(res.body.penunggak)).toBe(true);

      // Pastikan Budi Santoso (anggota2, id 2) ada di daftar penunggak
      const budi = res.body.penunggak.find((p) => p.member_id === 2);
      expect(budi).toBeDefined();
      expect(budi.nama).toBe("Budi Santoso");
      expect(budi.jumlah_tunggakan).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(budi.rincian)).toBe(true);
    });
  });
});

