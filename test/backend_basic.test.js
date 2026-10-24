import { describe, test, expect, beforeAll } from "bun:test";
import request from "supertest";
import app from "../app.js";
import db from "../db.js";
import { seed } from "../seed.js";
import { generateToken } from "../middleware/auth.js";

describe("Tahap 2: Backend Dasar KasPintar", () => {
  let tokenBendahara;
  let tokenAnggota;

  beforeAll(() => {
    // Pastikan database ter-seed dengan data awal
    seed(db, { reset: true });

    // Buat token JWT untuk bendahara dan anggota
    tokenBendahara = generateToken({
      id: 1,
      username: "bendahara",
      role: "bendahara",
      member_id: null,
      nama: "Bendahara Kas"
    });

    tokenAnggota = generateToken({
      id: 2,
      username: "anggota1",
      role: "anggota",
      member_id: 1,
      nama: "Ahmad Fauzi"
    });
  });

  // -------------------------------------------------------------
  // 1. Kategori & Anggota
  // -------------------------------------------------------------
  describe("Kategori & Anggota", () => {
    test("GET /api/categories mengembalikan 5 kategori bawaan", async () => {
      const res = await request(app)
        .get("/api/categories")
        .set("Authorization", `Bearer ${tokenAnggota}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(5);
    });

    test("POST /api/categories gagal jika diakses oleh anggota (403)", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokenAnggota}`)
        .send({ nama: "Kategori Ilegal", jenis: "masuk" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/akses ditolak/i);
    });

    test("POST /api/categories berhasil jika diakses oleh bendahara", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({ nama: "Dana Sosial & Duka", jenis: "keluar" });

      expect(res.status).toBe(201);
      expect(res.body.data.nama).toBe("Dana Sosial & Duka");
    });

    test("DELETE /api/categories gagal jika kategori sudah dipakai dalam transaksi", async () => {
      // Kategori 1 (Iuran Kas Wajib) sudah dipakai dalam banyak transaksi
      const res = await request(app)
        .delete("/api/categories/1")
        .set("Authorization", `Bearer ${tokenBendahara}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/digunakan pada/i);
    });

    test("GET /api/members hanya bisa diakses bendahara", async () => {
      const resAnggota = await request(app)
        .get("/api/members")
        .set("Authorization", `Bearer ${tokenAnggota}`);
      expect(resAnggota.status).toBe(403);

      const resBendahara = await request(app)
        .get("/api/members")
        .set("Authorization", `Bearer ${tokenBendahara}`);
      expect(resBendahara.status).toBe(200);
      expect(resBendahara.body.data.length).toBe(10);
    });

    test("POST /api/members menambah anggota baru dan PUT mengedit data", async () => {
      // Tambah anggota
      const addRes = await request(app)
        .post("/api/members")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({ nama: "Zulfikar Test", kontak: "081299998888", aktif: 1 });

      expect(addRes.status).toBe(201);
      const newId = addRes.body.data.id;

      // Edit anggota (nonaktifkan)
      const editRes = await request(app)
        .put(`/api/members/${newId}`)
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({ nama: "Zulfikar Test Edit", aktif: 0 });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.aktif).toBe(0);
      expect(editRes.body.data.nama).toBe("Zulfikar Test Edit");
    });
  });

  // -------------------------------------------------------------
  // 2. Transaksi & Validasi
  // -------------------------------------------------------------
  describe("Transaksi Kas", () => {
    test("GET /api/transactions mengembalikan transaksi dengan pagination", async () => {
      const res = await request(app)
        .get("/api/transactions?limit=5&page=1")
        .set("Authorization", `Bearer ${tokenAnggota}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(5);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(25);
    });

    test("POST /api/transactions menolak jumlah bernilai 0 atau negatif (400)", async () => {
      const resZero = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          tanggal: "2026-10-23",
          jenis: "masuk",
          jumlah: 0,
          category_id: 1,
          keterangan: "Tes nominal nol"
        });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          tanggal: "2026-10-23",
          jenis: "keluar",
          jumlah: -5000,
          category_id: 3,
          keterangan: "Tes negatif"
        });
      expect(resNeg.status).toBe(400);
    });

    test("POST /api/transactions menolak kategori yang tidak cocok dengan jenis transaksi", async () => {
      // Category 3 adalah 'keluar', tidak boleh dicatat sebagai 'masuk'
      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          tanggal: "2026-10-23",
          jenis: "masuk",
          jumlah: 25000,
          category_id: 3,
          keterangan: "Transaksi jenis mismatch"
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/tidak cocok dengan transaksi/i);
    });

    test("POST, PUT, DELETE /api/transactions berjalan dengan benar", async () => {
      // 1. Create transaksi
      const createRes = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          tanggal: "2026-10-23",
          jenis: "masuk",
          jumlah: 50000,
          category_id: 2,
          keterangan: "Sumbangan donatur uji coba"
        });
      expect(createRes.status).toBe(201);
      const txId = createRes.body.data.id;

      // 2. Update transaksi
      const updateRes = await request(app)
        .put(`/api/transactions/${txId}`)
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          tanggal: "2026-10-23",
          jenis: "masuk",
          jumlah: 75000,
          category_id: 2,
          keterangan: "Sumbangan donatur uji coba (revisi)"
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.jumlah).toBe(75000);

      // 3. Delete transaksi
      const deleteRes = await request(app)
        .delete(`/api/transactions/${txId}`)
        .set("Authorization", `Bearer ${tokenBendahara}`);
      expect(deleteRes.status).toBe(200);
    });
  });

  // -------------------------------------------------------------
  // 3. Ringkasan Kas (Summary)
  // -------------------------------------------------------------
  describe("Ringkasan Kas (/api/summary)", () => {
    test("Perhitungan saldo konsisten (saldo = total_masuk - total_keluar)", async () => {
      const res = await request(app)
        .get("/api/summary")
        .set("Authorization", `Bearer ${tokenAnggota}`);

      expect(res.status).toBe(200);
      const { total_masuk, total_keluar, saldo, rekap_bulanan, rekap_kategori } = res.body;

      expect(typeof total_masuk).toBe("number");
      expect(typeof total_keluar).toBe("number");
      expect(saldo).toBe(total_masuk - total_keluar);
      expect(Array.isArray(rekap_bulanan)).toBe(true);
      expect(rekap_bulanan.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(rekap_kategori)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. Iuran (Dues) & Pembayaran
  // -------------------------------------------------------------
  describe("Iuran & Pembayaran Kas", () => {
    test("GET /api/dues untuk anggota HANYA mengembalikan iuran miliknya sendiri", async () => {
      const res = await request(app)
        .get("/api/dues")
        .set("Authorization", `Bearer ${tokenAnggota}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Anggota 1 hanya boleh menerima data dengan member_id = 1
      for (const item of res.body.data) {
        expect(item.member_id).toBe(1);
      }
    });

    test("POST /api/dues/generate membuat tagihan iuran tanpa duplikasi", async () => {
      // 1. Generate untuk periode baru: 2026-11
      const genRes1 = await request(app)
        .post("/api/dues/generate")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          periode: "2026-11",
          nominal: 20000,
          jatuh_tempo: "2026-11-10"
        });

      expect(genRes1.status).toBe(201);
      expect(genRes1.body.generated).toBeGreaterThan(0);
      expect(genRes1.body.skipped).toBe(0);

      // 2. Generate ulang untuk periode yang sama (2026-11)
      const genRes2 = await request(app)
        .post("/api/dues/generate")
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({
          periode: "2026-11",
          nominal: 20000,
          jatuh_tempo: "2026-11-10"
        });

      expect(genRes2.status).toBe(201);
      // Semua anggota aktif harus di-skip karena sudah ada tagihan, tidak boleh duplikat
      expect(genRes2.body.generated).toBe(0);
      expect(genRes2.body.skipped).toBeGreaterThan(0);
    });

    test("POST /api/dues/:id/pay menandai lunas dan otomatis membuat transaksi pemasukan kas", async () => {
      // Cari satu tagihan yang masih 'belum'
      const dueBelum = db.query("SELECT * FROM dues WHERE status = 'belum' LIMIT 1").get();
      expect(dueBelum).toBeDefined();

      const totalTxBefore = db.query("SELECT COUNT(*) as c FROM transactions").get().c;

      const payRes = await request(app)
        .post(`/api/dues/${dueBelum.id}/pay`)
        .set("Authorization", `Bearer ${tokenBendahara}`)
        .send({ tanggal_bayar: "2026-10-23" });

      expect(payRes.status).toBe(200);
      expect(payRes.body.due_id).toBe(dueBelum.id);
      expect(payRes.body.transaction_id).toBeDefined();

      // Cek status due berubah jadi lunas
      const updatedDue = db.query("SELECT * FROM dues WHERE id = ?").get(dueBelum.id);
      expect(updatedDue.status).toBe("lunas");
      expect(updatedDue.tanggal_bayar).toBe("2026-10-23");

      // Cek jumlah transaksi bertambah 1
      const totalTxAfter = db.query("SELECT COUNT(*) as c FROM transactions").get().c;
      expect(totalTxAfter).toBe(totalTxBefore + 1);

      // Cek transaksi yang dibuat otomatis
      const newTx = db.query("SELECT * FROM transactions WHERE id = ?").get(payRes.body.transaction_id);
      expect(newTx.jenis).toBe("masuk");
      expect(newTx.jumlah).toBe(dueBelum.nominal);
      expect(newTx.member_id).toBe(dueBelum.member_id);

      // Coba bayar lagi iuran yang sama, harus ditolak (400)
      const payAgainRes = await request(app)
        .post(`/api/dues/${dueBelum.id}/pay`)
        .set("Authorization", `Bearer ${tokenBendahara}`);

      expect(payAgainRes.status).toBe(400);
      expect(payAgainRes.body.error).toMatch(/sudah berstatus lunas/i);
    });
  });
});

