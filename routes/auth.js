import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { generateToken, requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/register - Registrasi pengguna baru
router.post("/register", (req, res) => {
  try {
    const { username, password, nama, kontak, role } = req.body;

    if (!username || !password || !nama) {
      return res.status(400).json({ error: "Username, password, dan nama lengkap wajib diisi" });
    }

    if (typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ error: "Username minimal 3 karakter" });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password minimal 6 karakter" });
    }

    // Periksa apakah username sudah terdaftar
    const existingUser = db.query("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(username.trim());
    if (existingUser) {
      return res.status(409).json({ error: "Username sudah digunakan, silakan pilih username lain" });
    }

    // Role default adalah 'anggota'
    const assignedRole = role === "bendahara" ? "bendahara" : "anggota";
    const passwordHash = bcrypt.hashSync(password, 10);

    const result = db.transaction(() => {
      let memberId = null;

      // Jika role anggota, buatkan data anggota di tabel members
      if (assignedRole === "anggota") {
        const memberInsert = db.prepare("INSERT INTO members (nama, kontak, aktif) VALUES (?, ?, 1)");
        const memberRes = memberInsert.run(nama.trim(), kontak ? kontak.trim() : null);
        memberId = Number(memberRes.lastInsertRowid);
      }

      const userInsert = db.prepare("INSERT INTO users (username, password_hash, role, member_id) VALUES (?, ?, ?, ?)");
      const userRes = userInsert.run(username.trim().toLowerCase(), passwordHash, assignedRole, memberId);
      const userId = Number(userRes.lastInsertRowid);

      return {
        userId,
        memberId,
        username: username.trim().toLowerCase(),
        role: assignedRole,
        nama: nama.trim()
      };
    })();

    const token = generateToken({
      id: result.userId,
      username: result.username,
      role: result.role,
      member_id: result.memberId,
      nama: result.nama
    });

    res.status(201).json({
      message: "Registrasi akun berhasil",
      token,
      user: {
        id: result.userId,
        username: result.username,
        role: result.role,
        member_id: result.memberId,
        nama: result.nama
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan saat memproses registrasi: " + err.message });
  }
});

// POST /api/auth/login - Login pengguna
router.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }

    // Ambil data user beserta relasi member jika ada
    const user = db.query(`
      SELECT
        u.id,
        u.username,
        u.password_hash,
        u.role,
        u.member_id,
        u.created_at,
        m.nama as member_nama,
        m.kontak as member_kontak,
        m.aktif as member_aktif
      FROM users u
      LEFT JOIN members m ON u.member_id = m.id
      WHERE LOWER(u.username) = LOWER(?)
    `).get(username.trim());

    // Pesan error generik untuk keamanan (mencegah username enumeration)
    if (!user) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const displayName = user.member_nama || (user.role === "bendahara" ? "Bendahara Kas" : user.username);

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      member_id: user.member_id,
      nama: displayName
    };

    const token = generateToken(tokenPayload);

    // Kirim response tanpa password_hash
    res.json({
      message: "Login berhasil",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        member_id: user.member_id,
        nama: displayName
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Terjadi kesalahan saat memproses login: " + err.message });
  }
});

// GET /api/auth/me - Mendapatkan profil pengguna yang sedang login
router.get("/me", requireAuth, (req, res) => {
  try {
    const user = db.query(`
      SELECT
        u.id,
        u.username,
        u.role,
        u.member_id,
        u.created_at,
        m.nama as member_nama,
        m.kontak as member_kontak,
        m.aktif as member_aktif
      FROM users u
      LEFT JOIN members m ON u.member_id = m.id
      WHERE u.id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "Data pengguna tidak ditemukan" });
    }

    const displayName = user.member_nama || (user.role === "bendahara" ? "Bendahara Kas" : user.username);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        member_id: user.member_id,
        nama: displayName,
        kontak: user.member_kontak,
        aktif: user.member_aktif !== undefined ? user.member_aktif : 1,
        created_at: user.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data profil: " + err.message });
  }
});

export default router;

