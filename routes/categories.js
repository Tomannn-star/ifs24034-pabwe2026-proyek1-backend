import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/categories - Dapat diakses oleh semua user yang sudah login
router.get("/", requireAuth, (req, res) => {
  try {
    let sql = "SELECT * FROM categories";
    const params = [];

    if (req.query.jenis && (req.query.jenis === "masuk" || req.query.jenis === "keluar")) {
      sql += " WHERE jenis = ?";
      params.push(req.query.jenis);
    }

    sql += " ORDER BY nama ASC";
    const categories = db.query(sql).all(...params);
    res.json({ data: categories });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data kategori: " + err.message });
  }
});

// POST /api/categories - Khusus bendahara
router.post("/", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const { nama, jenis } = req.body;

    if (!nama || typeof nama !== "string" || !nama.trim()) {
      return res.status(400).json({ error: "Nama kategori wajib diisi" });
    }

    if (!jenis || !["masuk", "keluar"].includes(jenis)) {
      return res.status(400).json({ error: "Jenis kategori harus 'masuk' atau 'keluar'" });
    }

    const cleanNama = nama.trim();

    // Cek duplikasi nama
    const existing = db.query("SELECT id FROM categories WHERE LOWER(nama) = LOWER(?)").get(cleanNama);
    if (existing) {
      return res.status(400).json({ error: "Kategori dengan nama tersebut sudah ada" });
    }

    const result = db.prepare(
      "INSERT INTO categories (nama, jenis) VALUES (?, ?)"
    ).run(cleanNama, jenis);

    const newCategory = db.query("SELECT * FROM categories WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ message: "Kategori berhasil ditambahkan", data: newCategory });
  } catch (err) {
    res.status(500).json({ error: "Gagal menambahkan kategori: " + err.message });
  }
});

// PUT /api/categories/:id - Khusus bendahara
router.put("/:id", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID kategori tidak valid" });
    }

    const category = db.query("SELECT * FROM categories WHERE id = ?").get(id);
    if (!category) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }

    const { nama, jenis } = req.body;
    if (!nama || typeof nama !== "string" || !nama.trim()) {
      return res.status(400).json({ error: "Nama kategori wajib diisi" });
    }

    if (!jenis || !["masuk", "keluar"].includes(jenis)) {
      return res.status(400).json({ error: "Jenis kategori harus 'masuk' atau 'keluar'" });
    }

    const cleanNama = nama.trim();

    // Cek duplikasi nama pada kategori lain
    const existing = db.query(
      "SELECT id FROM categories WHERE LOWER(nama) = LOWER(?) AND id != ?"
    ).get(cleanNama, id);

    if (existing) {
      return res.status(400).json({ error: "Kategori dengan nama tersebut sudah digunakan" });
    }

    db.prepare("UPDATE categories SET nama = ?, jenis = ? WHERE id = ?").run(cleanNama, jenis, id);

    const updated = db.query("SELECT * FROM categories WHERE id = ?").get(id);
    res.json({ message: "Kategori berhasil diperbarui", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Gagal memperbarui kategori: " + err.message });
  }
});

// DELETE /api/categories/:id - Khusus bendahara
router.delete("/:id", requireAuth, requireRole("bendahara"), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID kategori tidak valid" });
    }

    const category = db.query("SELECT * FROM categories WHERE id = ?").get(id);
    if (!category) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }

    // Cek apakah kategori sudah dipakai dalam transaksi
    const txUsage = db.query("SELECT COUNT(*) as count FROM transactions WHERE category_id = ?").get(id);
    if (txUsage && txUsage.count > 0) {
      return res.status(400).json({
        error: `Kategori tidak dapat dihapus karena telah digunakan pada ${txUsage.count} transaksi`
      });
    }

    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    res.json({ message: "Kategori berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus kategori: " + err.message });
  }
});

export default router;

