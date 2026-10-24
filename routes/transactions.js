import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/transactions - Dapat diakses oleh semua user yang sudah login
// Query: jenis, category_id, dari, sampai, q, page, limit
router.get("/", requireAuth, (req, res) => {
  try {
    const { jenis, category_id, dari, sampai, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (jenis && ["masuk", "keluar"].includes(jenis)) {
      whereClause += " AND t.jenis = ?";
      params.push(jenis);
    }

    if (category_id) {
      const catId = parseInt(category_id, 10);
      if (!isNaN(catId)) {
        whereClause += " AND t.category_id = ?";
        params.push(catId);
      }
    }

    if (dari && /^\d{4}-\d{2}-\d{2}$/.test(dari)) {
      whereClause += " AND t.tanggal >= ?";
      params.push(dari);
    }

    if (sampai && /^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
      whereClause += " AND t.tanggal <= ?";
      params.push(sampai);
    }

    if (q && typeof q === "string" && q.trim()) {
      whereClause += " AND (t.keterangan LIKE ? OR c.nama LIKE ? OR m.nama LIKE ?)";
      const keyword = `%${q.trim()}%`;
      params.push(keyword, keyword, keyword);
    }

    // Hitung total data untuk pagination
    const countSql = `
      SELECT COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      ${whereClause}
    `;
    const total = db.query(countSql).get(...params)?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Ambil data transaksi dengan relasi
    const dataSql = `
      SELECT
        t.id,
        t.tanggal,
        t.jenis,
        t.jumlah,
        t.category_id,
        t.member_id,
        t.keterangan,
        t.created_by,
        t.created_at,
        c.nama as nama_kategori,
        m.nama as nama_anggota,
        u.username as nama_pembuat
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      LEFT JOIN users u ON t.created_by = u.id
      ${whereClause}
      ORDER BY t.tanggal DESC, t.id DESC
      LIMIT ? OFFSET ?
    `;

    const data = db.query(dataSql).all(...params, limit, offset);

    res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data transaksi: " + err.message });
  }
});

// GET /api/transactions/:id - Detail transaksi
router.get("/:id", requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID transaksi tidak valid" });
    }

    const txSql = `
      SELECT
        t.id,
        t.tanggal,
        t.jenis,
        t.jumlah,
        t.category_id,
        t.member_id,
        t.keterangan,
        t.created_by,
        t.created_at,
        c.nama as nama_kategori,
        m.nama as nama_anggota,
        u.username as nama_pembuat
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `;
    const transaction = db.query(txSql).get(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    res.json({ data: transaction });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil detail transaksi: " + err.message });
  }
});

// POST /api/transactions - Khusus bendahara
router.post("/", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const { tanggal, jenis, jumlah, category_id, member_id, keterangan } = req.body;

    // 1. Validasi tanggal
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return res.status(400).json({ error: "Tanggal tidak valid, gunakan format YYYY-MM-DD" });
    }

    // 2. Validasi jenis
    if (!jenis || !["masuk", "keluar"].includes(jenis)) {
      return res.status(400).json({ error: "Jenis transaksi harus 'masuk' atau 'keluar'" });
    }

    // 3. Validasi jumlah (integer, > 0, rupiah utuh)
    const nominal = Number(jumlah);
    if (!Number.isInteger(nominal) || nominal <= 0) {
      return res.status(400).json({ error: "Jumlah uang harus berupa bilangan bulat positif lebih dari 0" });
    }

    // 4. Validasi kategori
    const catId = parseInt(category_id, 10);
    if (isNaN(catId)) {
      return res.status(400).json({ error: "Kategori wajib dipilih" });
    }
    const category = db.query("SELECT * FROM categories WHERE id = ?").get(catId);
    if (!category) {
      return res.status(400).json({ error: "Kategori tidak ditemukan" });
    }
    if (category.jenis !== jenis) {
      return res.status(400).json({
        error: `Kategori '${category.nama}' berjenis '${category.jenis}', tidak cocok dengan transaksi '${jenis}'`
      });
    }

    // 5. Validasi member_id (jika disertakan)
    let validMemberId = null;
    if (member_id !== undefined && member_id !== null && member_id !== "") {
      validMemberId = parseInt(member_id, 10);
      if (isNaN(validMemberId)) {
        return res.status(400).json({ error: "ID anggota tidak valid" });
      }
      const member = db.query("SELECT id FROM members WHERE id = ?").get(validMemberId);
      if (!member) {
        return res.status(400).json({ error: "Anggota yang dipilih tidak ditemukan" });
      }
    }

    const cleanKeterangan = keterangan && typeof keterangan === "string" ? keterangan.trim() : null;
    const createdBy = req.user.id;

    const result = db.prepare(`
      INSERT INTO transactions (tanggal, jenis, jumlah, category_id, member_id, keterangan, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tanggal, jenis, nominal, catId, validMemberId, cleanKeterangan, createdBy);

    const newTx = db.query(`
      SELECT
        t.*,
        c.nama as nama_kategori,
        m.nama as nama_anggota
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message: "Transaksi berhasil dicatat", data: newTx });
  } catch (err) {
    res.status(500).json({ error: "Gagal mencatat transaksi: " + err.message });
  }
});

// PUT /api/transactions/:id - Khusus bendahara
router.put("/:id", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID transaksi tidak valid" });
    }

    const existingTx = db.query("SELECT * FROM transactions WHERE id = ?").get(id);
    if (!existingTx) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    const { tanggal, jenis, jumlah, category_id, member_id, keterangan } = req.body;

    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return res.status(400).json({ error: "Tanggal tidak valid, gunakan format YYYY-MM-DD" });
    }

    if (!jenis || !["masuk", "keluar"].includes(jenis)) {
      return res.status(400).json({ error: "Jenis transaksi harus 'masuk' atau 'keluar'" });
    }

    const nominal = Number(jumlah);
    if (!Number.isInteger(nominal) || nominal <= 0) {
      return res.status(400).json({ error: "Jumlah uang harus berupa bilangan bulat positif lebih dari 0" });
    }

    const catId = parseInt(category_id, 10);
    if (isNaN(catId)) {
      return res.status(400).json({ error: "Kategori wajib dipilih" });
    }
    const category = db.query("SELECT * FROM categories WHERE id = ?").get(catId);
    if (!category) {
      return res.status(400).json({ error: "Kategori tidak ditemukan" });
    }
    if (category.jenis !== jenis) {
      return res.status(400).json({
        error: `Kategori '${category.nama}' berjenis '${category.jenis}', tidak cocok dengan transaksi '${jenis}'`
      });
    }

    let validMemberId = null;
    if (member_id !== undefined && member_id !== null && member_id !== "") {
      validMemberId = parseInt(member_id, 10);
      if (isNaN(validMemberId)) {
        return res.status(400).json({ error: "ID anggota tidak valid" });
      }
      const member = db.query("SELECT id FROM members WHERE id = ?").get(validMemberId);
      if (!member) {
        return res.status(400).json({ error: "Anggota yang dipilih tidak ditemukan" });
      }
    }

    const cleanKeterangan = keterangan && typeof keterangan === "string" ? keterangan.trim() : null;

    db.prepare(`
      UPDATE transactions
      SET tanggal = ?, jenis = ?, jumlah = ?, category_id = ?, member_id = ?, keterangan = ?
      WHERE id = ?
    `).run(tanggal, jenis, nominal, catId, validMemberId, cleanKeterangan, id);

    const updatedTx = db.query(`
      SELECT
        t.*,
        c.nama as nama_kategori,
        m.nama as nama_anggota
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN members m ON t.member_id = m.id
      WHERE t.id = ?
    `).get(id);

    res.json({ message: "Transaksi berhasil diperbarui", data: updatedTx });
  } catch (err) {
    res.status(500).json({ error: "Gagal memperbarui transaksi: " + err.message });
  }
});

// DELETE /api/transactions/:id - Khusus bendahara
router.delete("/:id", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID transaksi tidak valid" });
    }

    const existingTx = db.query("SELECT * FROM transactions WHERE id = ?").get(id);
    if (!existingTx) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
    res.json({ message: "Transaksi berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus transaksi: " + err.message });
  }
});

export default router;

