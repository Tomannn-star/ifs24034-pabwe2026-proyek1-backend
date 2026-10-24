import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * Format tanggal lokal hari ini sebagai string YYYY-MM-DD
 */
function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// GET /api/dues - Menampilkan daftar iuran
// Bendahara: bisa melihat semua atau memfilter berdasarkan periode dan member_id
// Anggota: HANYA melihat iuran miliknya sendiri (member_id dipaksa dari token JWT)
router.get("/", requireAuth, (req, res) => {
  try {
    const today = getTodayDateString();
    let whereClause = "WHERE 1=1";
    const params = [];

    // Jika user adalah anggota, paksa filter berdasarkan member_id miliknya
    if (req.user.role === "anggota") {
      if (!req.user.member_id) {
        return res.status(403).json({ error: "Akun ini tidak tertaut dengan data anggota" });
      }
      whereClause += " AND d.member_id = ?";
      params.push(req.user.member_id);
    } else if (req.query.member_id) {
      // Jika bendahara menyaring berdasarkan member_id
      const mId = parseInt(req.query.member_id, 10);
      if (!isNaN(mId)) {
        whereClause += " AND d.member_id = ?";
        params.push(mId);
      }
    }

    if (req.query.periode && /^\d{4}-\d{2}$/.test(req.query.periode)) {
      whereClause += " AND d.periode = ?";
      params.push(req.query.periode);
    }

    if (req.query.status && ["belum", "lunas"].includes(req.query.status)) {
      whereClause += " AND d.status = ?";
      params.push(req.query.status);
    }

    const sql = `
      SELECT
        d.id,
        d.member_id,
        d.periode,
        d.nominal,
        d.jatuh_tempo,
        d.status,
        d.tanggal_bayar,
        m.nama as nama_anggota,
        m.kontak as kontak_anggota,
        m.aktif as anggota_aktif
      FROM dues d
      LEFT JOIN members m ON d.member_id = m.id
      ${whereClause}
      ORDER BY d.periode DESC, m.nama ASC
    `;

    const rawDues = db.query(sql).all(...params);

    // Hitung status keterlambatan secara dinamis saat query (tidak disimpan di database)
    const data = rawDues.map((item) => {
      const isBelum = item.status === "belum";
      const isOverdue = isBelum && item.jatuh_tempo < today;

      const dueDate = new Date(item.jatuh_tempo + "T00:00:00");
      const currentDate = new Date(today + "T00:00:00");
      const diffTime = currentDate - dueDate;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      return {
        ...item,
        terlambat: isOverdue,
        hari_terlambat: isOverdue ? diffDays : 0,
        sisa_hari: isBelum && !isOverdue ? Math.max(0, -diffDays) : 0
      };
    });

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data iuran: " + err.message });
  }
});

// POST /api/dues/generate - Khusus bendahara: membuat tagihan iuran masal untuk semua anggota aktif
router.post("/generate", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const { periode, nominal, jatuh_tempo } = req.body;

    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
      return res.status(400).json({ error: "Format periode harus YYYY-MM (contoh: 2026-11)" });
    }

    const nominalInt = Number(nominal);
    if (!Number.isInteger(nominalInt) || nominalInt <= 0) {
      return res.status(400).json({ error: "Nominal iuran harus berupa bilangan bulat positif" });
    }

    if (!jatuh_tempo || !/^\d{4}-\d{2}-\d{2}$/.test(jatuh_tempo)) {
      return res.status(400).json({ error: "Format jatuh tempo harus YYYY-MM-DD" });
    }

    // Ambil semua anggota yang aktif
    const activeMembers = db.query("SELECT id, nama FROM members WHERE aktif = 1").all();
    if (activeMembers.length === 0) {
      return res.status(400).json({ error: "Tidak ada anggota aktif untuk dibuatkan tagihan iuran" });
    }

    let generatedCount = 0;
    let skippedCount = 0;

    const generateTx = db.transaction(() => {
      const checkStmt = db.prepare("SELECT id FROM dues WHERE member_id = ? AND periode = ?");
      const insertStmt = db.prepare(`
        INSERT INTO dues (member_id, periode, nominal, jatuh_tempo, status)
        VALUES (?, ?, ?, ?, 'belum')
      `);

      for (const m of activeMembers) {
        const existing = checkStmt.get(m.id, periode);
        if (existing) {
          skippedCount++;
        } else {
          insertStmt.run(m.id, periode, nominalInt, jatuh_tempo);
          generatedCount++;
        }
      }
    });

    generateTx();

    res.status(201).json({
      message: `Tagihan iuran periode ${periode} berhasil diproses`,
      generated: generatedCount,
      skipped: skippedCount,
      total_anggota_aktif: activeMembers.length,
      periode
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal membuat tagihan iuran: " + err.message });
  }
});

// POST /api/dues/:id/pay - Khusus bendahara: bayar iuran dan otomatis catat transaksi pemasukan kas
router.post("/:id/pay", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID iuran tidak valid" });
    }

    const due = db.query(`
      SELECT d.*, m.nama as nama_anggota
      FROM dues d
      LEFT JOIN members m ON d.member_id = m.id
      WHERE d.id = ?
    `).get(id);

    if (!due) {
      return res.status(404).json({ error: "Tagihan iuran tidak ditemukan" });
    }

    if (due.status === "lunas") {
      return res.status(400).json({ error: "Tagihan iuran ini sudah berstatus lunas" });
    }

    const tanggalBayar = req.body.tanggal_bayar && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal_bayar)
      ? req.body.tanggal_bayar
      : getTodayDateString();

    // Cari kategori iuran masuk
    const category = db.query(
      "SELECT id FROM categories WHERE (nama LIKE '%iuran%' OR nama LIKE '%kas%') AND jenis = 'masuk' LIMIT 1"
    ).get() || db.query("SELECT id FROM categories WHERE jenis = 'masuk' LIMIT 1").get();

    if (!category) {
      return res.status(500).json({ error: "Kategori kas masuk untuk iuran tidak ditemukan di sistem" });
    }

    let createdTxId = null;

    // Database transaction atomik: update status due dan insert transaksi
    const payTx = db.transaction(() => {
      // 1. Tandai due menjadi lunas
      db.prepare(`
        UPDATE dues
        SET status = 'lunas', tanggal_bayar = ?
        WHERE id = ?
      `).run(tanggalBayar, id);

      // 2. Buat transaksi pemasukan kas
      const memberName = due.nama_anggota || "Anggota";
      const keterangan = `Iuran kas periode ${due.periode} - ${memberName}`;
      const insertTx = db.prepare(`
        INSERT INTO transactions (tanggal, jenis, jumlah, category_id, member_id, keterangan, created_by)
        VALUES (?, 'masuk', ?, ?, ?, ?, ?)
      `).run(tanggalBayar, due.nominal, category.id, due.member_id, keterangan, req.user.id);

      createdTxId = insertTx.lastInsertRowid;
    });

    payTx();

    res.json({
      message: "Iuran berhasil ditandai lunas dan transaksi kas pemasukan telah dicatat",
      due_id: id,
      transaction_id: createdTxId
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal memproses pembayaran iuran: " + err.message });
  }
});

export default router;

