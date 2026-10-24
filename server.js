import app from "./app.js";
import db from "./db.js";
import { seed } from "./seed.js";

// Otomatis jalankan seed jika database belum memiliki data
const userCount = db.query("SELECT COUNT(*) as count FROM users").get()?.count || 0;
if (userCount === 0) {
  console.log("ℹ️  Tabel database kosong, menjalankan seed otomatis...");
  seed(db);
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`🚀 KasPintar API Server berjalan di http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
});

