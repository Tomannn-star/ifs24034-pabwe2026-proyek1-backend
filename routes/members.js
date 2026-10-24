import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Semua rute anggota hanya boleh diakses oleh bendahara
router.use(requireAuth, requireRole("bendahara"));

// GET /api/members - Daftar semua anggota dengan pencarian dan filter status aktif
router.get("/", (req, res) => {
  try {
    let sql = "SELECT * FROM members WHERE 1=1";
    const params = [];

    if (req.query.aktif !== undefined && req.query.aktif !== "") {
      const aktifVal = parseInt(req.query.aktif, 10);
      if (aktifVal === 0 || aktifVal === 1) {
        sql += " AND aktif = ?";
        params.push(aktifVal);
      }
    }

    if (req.query.q) {
      sql += " AND (nama LIKE ? OR kontak LIKE ?)";
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }

    sql += " ORDER BY aktif DESC, nama ASC";
    const members = db.query(sql).all(...params);
    res.json({ data: members });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data anggota: " + err.message });
  }
});

// POST /api/members - Menambah anggota baru
router.post("/", (req, res) => {
  try {
    const { nama, kontak, aktif } = req.body;

    if (!nama || typeof nama !== "string" || !nama.trim()) {
      return res.status(400).json({ error: "Nama anggota wajib diisi" });
    }

    const cleanNama = nama.trim();
    const cleanKontak = kontak && typeof kontak === "string" ? kontak.trim() : null;
    const isAktif = aktif === 0 ? 0 : 1;

    const result = db.prepare(
      "INSERT INTO members (nama, kontak, aktif) VALUES (?, ?, ?)"
    ).run(cleanNama, cleanKontak, isAktif);

    const newMember = db.query("SELECT * FROM members WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ message: "Anggota berhasil ditambahkan", data: newMember });
  } catch (err) {
    res.status(500).json({ error: "Gagal menambahkan anggota: " + err.message });
  }
});

// PUT /api/members/:id - Mengubah data anggota (termasuk status aktif/nonaktif)
router.put("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID anggota tidak valid" });
    }

    const member = db.query("SELECT * FROM members WHERE id = ?").get(id);
    if (!member) {
      return res.status(404).json({ error: "Anggota tidak ditemukan" });
    }

    const { nama, kontak, aktif } = req.body;
    if (!nama || typeof nama !== "string" || !nama.trim()) {
      return res.status(400).json({ error: "Nama anggota wajib diisi" });
    }

    const cleanNama = nama.trim();
    const cleanKontak = kontak !== undefined ? (kontak ? kontak.trim() : null) : member.kontak;
    const isAktif = aktif !== undefined ? (parseInt(aktif, 10) === 0 ? 0 : 1) : member.aktif;

    db.prepare(
      "UPDATE members SET nama = ?, kontak = ?, aktif = ? WHERE id = ?"
    ).run(cleanNama, cleanKontak, isAktif, id);

    const updated = db.query("SELECT * FROM members WHERE id = ?").get(id);
    res.json({ message: "Data anggota berhasil diperbarui", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Gagal memperbarui data anggota: " + err.message });
  }
});

// DELETE /api/members/:id - Menghapus anggota
router.delete("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID anggota tidak valid" });
    }

    const member = db.query("SELECT * FROM members WHERE id = ?").get(id);
    if (!member) {
      return res.status(404).json({ error: "Anggota tidak ditemukan" });
    }

    db.prepare("DELETE FROM members WHERE id = ?").run(id);
    res.json({ message: "Anggota berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus anggota: " + err.message });
  }
});

export default router;

