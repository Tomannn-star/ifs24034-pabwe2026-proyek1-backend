# Gunakan image resmi Bun
FROM oven/bun:latest

WORKDIR /app

# Salin konfigurasi dependensi
COPY package.json bun.lock* ./

# Pasang dependensi untuk runtime produksi
RUN bun install --production

# Salin seluruh kode backend
COPY . .

# Jalankan seeder idempoten untuk menyiapkan tabel & data awal
RUN bun seed.js

# Ekspos port default
EXPOSE 5001
ENV PORT=5001

# Jalankan server API
CMD ["bun", "server.js"]

