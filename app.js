import express from "express";
import cors from "cors";

// Import rute
import authRouter from "./routes/auth.js";
import categoriesRouter from "./routes/categories.js";
import membersRouter from "./routes/members.js";
import transactionsRouter from "./routes/transactions.js";
import summaryRouter from "./routes/summary.js";
import duesRouter from "./routes/dues.js";
import remindersRouter from "./routes/reminders.js";

const app = express();

// Konfigurasi CORS: izinkan domain frontend (Vercel / Localhost)
const allowedOrigin = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(",").map(o => o.trim()) 
  : true; // true merefleksikan origin pemanggil sehingga kompatibel dengan credentials

app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parser JSON
app.use(express.json());

// Endpoint Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Daftarkan route API dengan prefix /api
app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/members", membersRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/summary", summaryRouter);
app.use("/api/dues", duesRouter);
app.use("/api/reminders", remindersRouter);

// Middleware 404
app.use((req, res) => {
  res.status(404).json({ error: "Rute tidak ditemukan" });
});

// Middleware Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Terjadi kesalahan internal pada server";
  res.status(status).json({ error: message });
});

export default app;
