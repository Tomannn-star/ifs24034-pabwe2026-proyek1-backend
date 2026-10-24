import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kaspintar_rahasia_super_aman_jwt_secret_key_2026";

/**
 * Middleware untuk memvalidasi token JWT dari header Authorization: Bearer <token>.
 * Menyimpan data payload user ke `req.user`.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak disertakan atau format tidak valid" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau telah kedaluwarsa" });
  }
}

/**
 * Middleware untuk membatasi akses berdasarkan role tertentu (misal: 'bendahara').
 * Harus dipanggil setelah requireAuth.
 * 
 * @param {string} role - Role yang diperbolehkan mengakses route
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Autentikasi diperlukan" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Akses ditolak: hanya bendahara yang memiliki izin" });
    }
    next();
  };
}

/**
 * Utility untuk membuat token JWT baru dengan masa aktif 1 hari.
 * 
 * @param {object} payload - Data user yang disimpan dalam token
 * @returns {string} Token JWT
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
}

