import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/summary - Ringkasan keuangan kas, grafik bulanan, kategori, dan transaksi terakhir
router.get("/", requireAuth, (req, res) => {
  try {
    // 1. Hitung total pemasukan
    const masukRow = db.query(
      "SELECT COALESCE(SUM(jumlah), 0) as total FROM transactions WHERE jenis = 'masuk'"
    ).get();
    const totalMasuk = masukRow?.total || 0;

    // 2. Hitung total pengeluaran
    const keluarRow = db.query(
      "SELECT COALESCE(SUM(jumlah), 0) as total FROM transactions WHERE jenis = 'keluar'"
    ).get();
    const totalKeluar = keluarRow?.total || 0;

    // 3. Saldo dihitung di backend (bukan kolom database)
    const saldo = totalMasuk - totalKeluar;

    // 4. Rekap per bulan untuk visualisasi Chart.js
    const rekapBulanan = db.query(`
      SELECT
        substr(tanggal, 1, 7) as periode,
        SUM(CASE WHEN jenis = 'masuk' THEN jumlah ELSE 0 END) as masuk,
        SUM(CASE WHEN jenis = 'keluar' THEN jumlah ELSE 0 END) as keluar
      FROM transactions
      GROUP BY substr(tanggal, 1, 7)
      ORDER BY periode ASC
    `).all();

    // 5. Rekap pengeluaran & pemasukan per kategori
    const rekapKategori = db.query(`
      SELECT
        c.id,
        c.nama,
        c.jenis,
        COALESCE(SUM(t.jumlah), 0) as total,
        COUNT(t.id) as count
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id
      GROUP BY c.id, c.nama, c.jenis
      ORDER BY total DESC
    `).all();

    // 6. 5 Transaksi terakhir
    const transaksiTerakhir = db.query(`
      SELECT
        t.id,
        t.tanggal,
        t.jenis,
        t.jumlah,
        t.keterangan,
        c.nama as nama_kategori,
        m.nama as nama_anggota
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      ORDER BY t.tanggal DESC, t.id DESC
      LIMIT 5
    `).all();

    // 7. Info tambahan: total anggota aktif & jumlah penunggak
    const totalAnggota = db.query("SELECT COUNT(*) as c FROM members WHERE aktif = 1").get()?.c || 0;
    const penunggakCount = db.query(`
      SELECT COUNT(DISTINCT member_id) as c
      FROM dues
      WHERE status = 'belum' AND jatuh_tempo < date('now', 'localtime')
    `).get()?.c || 0;

    res.json({
      total_masuk: totalMasuk,
      total_keluar: totalKeluar,
      saldo,
      rekap_bulanan: rekapBulanan,
      rekap_kategori: rekapKategori,
      transaksi_terakhir: transaksiTerakhir,
      total_anggota: totalAnggota,
      total_penunggak: penunggakCount
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghitung ringkasan kas: " + err.message });
  }
});

export default router;

