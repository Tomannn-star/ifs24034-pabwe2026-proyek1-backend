# KasPintar - Backend (REST API) 🚀
> **REST API Server Mandiri Berbasis Bun & SQLite untuk Sistem Kas Kelas**  
> Proyek Praktikum *Pengembangan Aplikasi Berbasis Web* (PABWE) &mdash; 2026

---

## 📌 1. Gambaran Backend

Repositori ini berisi layanan **REST API Server** untuk aplikasi **KasPintar**. Dibangun secara mandiri menggunakan runtime berkecepatan tinggi **Bun** dan database **SQLite via `bun:sqlite`** dengan penegakan integritas data ketat (*Foreign Key & Check Constraints*).

### Fitur Backend:
- 🔐 **Autentikasi Stateless**: JWT dengan enkripsi sandi menggunakan `bcryptjs`.
- 👥 **Role-Based Access Control**: Pembagian izin akses antara Bendahara (kelola kas penuh) dan Anggota (hanya melihat data personal).
- 💸 **Pencatatan Transaksi Kas**: CRUD mutasi kas dengan validasi ketat kategori dan nominal positif.
- ⚡ **Transaksi Atomik Pembayaran**: Pelunasan iuran dan pencatatan mutasi kas dilakukan dalam satu transaksi atomik database (`db.transaction`).
- 🔔 **Perhitungan Pengingat & Keterlambatan**: Status keterlambatan dihitung dinamis saat query tanpa redundancy status.
- 🧪 **Pengujian Otomatis (33 Tests Pass)**: Pengujian menyeluruh untuk skema database, autentikasi, dan logika bisnis keuangan.

---

## 🛠️ 2. Tech Stack

- **Runtime**: Bun (v1.1.0+)
- **Framework**: Express.js
- **Database**: SQLite via `bun:sqlite` (`kaspintar.db`)
- **Autentikasi**: `jsonwebtoken` & `bcryptjs`
- **Testing**: `bun test` & `supertest` (33 unit tests)
- **Deployment**: Dockerfile mandiri untuk Render, Railway, Fly.io, atau VPS

---

## 🚀 3. Panduan Menjalankan Secara Lokal

Pastikan **Bun** sudah terpasang (`bun --version`).

1. **Install Dependensi**:
   ```bash
   bun install
   ```

2. **Konfigurasi Environment**:
   Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
   Isi berkas `.env`:
   ```env
   PORT=5001
   JWT_SECRET=kaspintar_super_secret_jwt_key_2026
   DB_PATH=kaspintar.db
   ```

3. **Jalankan Seeder Database (Akun & Data Awal)**:
   ```bash
   bun seed.js
   ```

4. **Jalankan Backend Server**:
   ```bash
   bun dev
   # Server akan aktif di http://localhost:5001
   ```

5. **Menjalankan Pengujian Otomatis (33 Tests)**:
   ```bash
   bun test
   ```

---

## 👤 4. Akun Demo Bawaan

| Username | Password | Role | Keterangan |
| :--- | :--- | :--- | :--- |
| `bendahara` | `bendahara123` | Bendahara | Akses penuh seluruh fitur keuangan |
| `anggota1` | `anggota123` | Anggota | Anggota dengan tagihan aktif |
| `anggota2` | `anggota123` | Anggota | Anggota dengan tagihan menunggak/terlambat |
| `anggota3` | `anggota123` | Anggota | Anggota dengan iuran lunas |

---

## 🌐 5. Panduan Deploy ke Vercel (100% Gratis)

Backend ini sudah dikonfigurasi untuk berjalan langsung di **Vercel** menggunakan runtime resmi **Bun** (`bunVersion: "1.x"`):

1. Buka [vercel.com](https://vercel.com) $\rightarrow$ klik **Add New...** $\rightarrow$ **Project**.
2. Sambungkan repositori GitHub: `ifs24034-pabwe2026-proyek1-backend`.
3. Vercel akan otomatis membaca file `vercel.json` dan menjalankan fungsi serverless dengan Bun.
4. Klik **Deploy**.
5. Setelah selesai, Vercel akan memberikan URL publik seperti:  
   `https://ifs24034-pabwe2026-proyek1-backend.vercel.app`
6. Endpoint pengujian kesehatan backend:  
   `https://ifs24034-pabwe2026-proyek1-backend.vercel.app/api/health`

---

## 🐳 6. Panduan Deploy ke Docker / Render (Opsional)

Repositori ini menyertakan `Dockerfile` berbasis image resmi Bun (`oven/bun:latest`).

### Deploy ke Render.com:
1. Buka [dashboard.render.com](https://dashboard.render.com) dan klik **New +** $\rightarrow$ **Web Service**.
2. Sambungkan repositori GitHub backend ini.
3. Pilih **Runtime**: **Docker**.
4. Pilih **Instance Type**: **Free**.
5. Klik **Deploy Web Service**.
6. Render akan memberikan URL publik backend Anda (misal `https://kaspintar-api.onrender.com`).

---

## 👨‍💻 Pengembang
- **Nama**: Toman Sihombing
- **NIM**: 11S24034 / ifs24034
- **Mata Kuliah**: Praktikum Pengembangan Aplikasi Berbasis Web (PABWE)
- **Tahun**: 2026
