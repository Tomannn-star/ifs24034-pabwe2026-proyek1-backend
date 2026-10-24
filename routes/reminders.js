import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * Format tanggal hari ini dalam format lokal YYYY-MM-DD
 */
function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// GET /api/reminders - Pengingat iuran belum dibayar milik user yang sedang login
// Dapat diakses oleh semua pengguna login (termasuk anggota)
router.get("/", requireAuth, (req, res) => {
  try {
    const today = getTodayDateString();

    // Jika user adalah bendahara tanpa member_id, tidak memiliki tagihan pribadi
    if (!req.user.member_id) {
      return res.json({
        total_tunggakan: 0,
        jumlah_belum_bayar: 0,
        jumlah_terlambat: 0,
        ada_terlambat: false,
        iuran: []
      });
    }

    const memberId = req.user.member_id;

    // Ambil semua tagihan yang berstatus 'belum' milik anggota yang bersangkutan
    const dues = db.query(`
      SELECT
        d.id,
        d.member_id,
        d.periode,
        d.nominal,
        d.jatuh_tempo,
        d.status,
        m.nama as nama_anggota
      FROM dues d
      LEFT JOIN members m ON d.member_id = m.id
      WHERE d.member_id = ? AND d.status = 'belum'
      ORDER BY d.jatuh_tempo ASC
    `).all(memberId);

    let totalTunggakan = 0;
    let jumlahTerlambat = 0;

    const formattedDues = dues.map((due) => {
      totalTunggakan += due.nominal;

      const isOverdue = due.jatuh_tempo < today;
      if (isOverdue) {
        jumlahTerlambat++;
      }

      const dueDate = new Date(due.jatuh_tempo + "T00:00:00");
      const currentDate = new Date(today + "T00:00:00");
      const diffTime = currentDate - dueDate;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      return {
        ...due,
        terlambat: isOverdue,
        hari_terlambat: isOverdue ? diffDays : 0,
        sisa_hari: !isOverdue ? Math.max(0, -diffDays) : 0
      };
    });

    res.json({
      total_tunggakan: totalTunggakan,
      jumlah_belum_bayar: formattedDues.length,
      jumlah_terlambat: jumlahTerlambat,
      ada_terlambat: jumlahTerlambat > 0,
      iuran: formattedDues
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data pengingat: " + err.message });
  }
});

// GET /api/reminders/overdue - Khusus bendahara: daftar anggota yang menunggak (iuran lewat jatuh tempo)
router.get("/overdue", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const today = getTodayDateString();

    // Query anggota yang memiliki iuran berstatus 'belum' dan telah melewati jatuh tempo
    const summaryOverdue = db.query(`
      SELECT
        m.id as member_id,
        m.nama,
        m.kontak,
        m.aktif,
        COUNT(d.id) as jumlah_tunggakan,
        SUM(d.nominal) as total_tunggakan,
        MIN(d.jatuh_tempo) as jatuh_tempo_terlama
      FROM dues d
      JOIN members m ON d.member_id = m.id
      WHERE d.status = 'belum' AND d.jatuh_tempo < ?
      GROUP BY m.id, m.nama, m.kontak, m.aktif
      ORDER BY total_tunggakan DESC, m.nama ASC
    `).all(today);

    // Ambil semua rincian iuran yang overdue
    const allOverdueItems = db.query(`
      SELECT
        d.id,
        d.member_id,
        d.periode,
        d.nominal,
        d.jatuh_tempo
      FROM dues d
      WHERE d.status = 'belum' AND d.jatuh_tempo < ?
      ORDER BY d.jatuh_tempo ASC
    `).all(today);

    // Hitung total keseluruhan
    let grandTotalTunggakan = 0;
    const penunggakList = summaryOverdue.map((p) => {
      grandTotalTunggakan += p.total_tunggakan;
      const rincian = allOverdueItems
        .filter((item) => item.member_id === p.member_id)
        .map((item) => {
          const dueDate = new Date(item.jatuh_tempo + "T00:00:00");
          const currentDate = new Date(today + "T00:00:00");
          const diffDays = Math.round((currentDate - dueDate) / (1000 * 60 * 60 * 24));
          return {
            ...item,
            hari_terlambat: Math.max(1, diffDays)
          };
        });

      return {
        ...p,
        rincian
      };
    });

    res.json({
      total_anggota_menunggak: penunggakList.length,
      grand_total_tunggakan: grandTotalTunggakan,
      penunggak: penunggakList
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil daftar penunggak: " + err.message });
  }
});

export default router;

