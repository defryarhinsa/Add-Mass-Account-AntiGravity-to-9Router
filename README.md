# 9ROUTER ADD BULK ACCOUNT

Bot Puppeteer untuk menambahkan akun Google secara bulk ke Antigravity Provider.

## Fitur

- Login otomatis ke multiple akun Google
- Baca daftar akun dari file `akun.txt`
- Akun yang berhasil ditambahkan otomatis dihapus dari list
- Looping otomatis sampai semua akun selesai
- Delay antar akun untuk menghindari rate limit

## Requirements

- [Node.js](https://nodejs.org/) v18 atau lebih baru
- [Google Chrome](https://www.google.com/chrome/) terinstall di sistem
- npm (sudah termasuk saat install Node.js)

### Dependencies

| Package | Versi | Keterangan |
|---------|-------|------------|
| [puppeteer](https://www.npmjs.com/package/puppeteer) | ^24.43.1 | Browser automation (otomatis download Chromium saat install) |

## Instalasi

```bash
# Clone repository
git clone https://github.com/defryarhinsa/Add-Mass-Account-AntiGravity-to-9Router.git
cd Add-Mass-Account-AntiGravity-to-9Router

# Install dependencies
npm install
```

> `npm install` akan otomatis menginstall **puppeteer** beserta **Chromium browser** yang dibutuhkan. Proses ini memerlukan koneksi internet dan mungkin memakan waktu beberapa menit.

### Buat File Akun

Buat file `akun.txt` di root folder, isi dengan daftar akun format `email|password` (satu akun per baris):

```
akun1@gmail.com|password123
akun2@gmail.com|password456
akun3@gmail.com|password789
```

## Konfigurasi

### 1. Disable Require Login pada 9ROUTER

> **PENTING:** Langkah ini wajib dilakukan sebelum menjalankan bot, jika tidak bot tidak akan bisa berjalan.

1. Buka halaman **9ROUTER** di browser
2. Masuk ke menu **Setting**
3. Cari opsi **Require Login**
4. **Matikan / Disable** opsi tersebut
5. Simpan perubahan

### 2. Sesuaikan Target URL

Pastikan target URL di `bot.js` sudah sesuai (default: `http://localhost:20128/`).

## Penggunaan

```bash
node bot.js
```

## Alur Bot

1. Buka browser dan navigasi ke target URL
2. Klik **Provider** > **Antigravity**
3. Untuk setiap akun di `akun.txt`:
   - Klik **Add** > **I Understand, Continue**
   - Tab baru terbuka (Google Login)
   - Isi email > klik **Next**
   - Isi password > klik **Next**
   - Klik **I Understand**
   - Klik **Login**
   - Akun berhasil > dihapus dari `akun.txt`
   - Browser ditutup, delay 3 detik
   - Buka browser baru untuk akun berikutnya
4. Selesai jika semua akun sudah ditambahkan

## Struktur File

```
autologin/
+-- bot.js          # Script utama bot
+-- akun.txt        # Daftar akun (tidak di-upload ke GitHub)
+-- package.json    # Dependencies project
+-- .gitignore      # File yang di-ignore oleh Git
+-- README.md       # Dokumentasi
```

## Catatan

- Bot berjalan dalam mode **visible** (bukan headless) karena Google login memblokir akses headless.
- Jika bot dihentikan di tengah proses, akun yang belum diproses tetap tersimpan di `akun.txt`. Cukup jalankan ulang `node bot.js` untuk melanjutkan.
- Pastikan koneksi internet stabil saat menjalankan bot.
- File `akun.txt` tidak di-upload ke GitHub demi keamanan. Buat manual setelah clone.

## Disclaimer

Bot ini dibuat untuk keperluan pribadi. Gunakan dengan bijak dan sesuai ketentuan layanan yang berlaku.

DO WITH YOUR OWN RISK