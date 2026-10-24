# Jelajah Kampus — SMA Malika Islamic Boarding School

Aplikasi web untuk membantu siswa SMA Malika Islamic Boarding School memilih program studi (prodi) dan kampus.
Berjalan gratis di **GitHub Pages**, tanpa server dan tanpa biaya database.

Fitur:

- **Login dengan satu kata sandi bersama** yang dibagikan guru BK kepada siswa
- **Cari Prodi**: kampus mana saja yang membuka suatu jurusan, beserta skor aman UTBK
- **Jelajah Kampus**: PTN, UIN/PTKIN, politeknik, sekolah kedinasan, dan PTS per provinsi
- **Cek Skormu**: pilihan yang realistis berdasarkan skor tryout
- **Sekolah Kedinasan**: STAN, STIS, IPDN, akademi TNI/Polri, pelayaran, penerbangan, Poltekkes, dll., dengan filter ikatan dinas
- **Bahas Prodi**: penjelasan 714 prodi, contoh mata kuliah, prospek karier, dan saran mapel pilihan Kelas XI
- **Rencanaku**: siswa menyusun urutan pilihan untuk dibawa saat konsultasi BK

---

## Isi database

Semua data ada di folder `data/` dalam bentuk **CSV**, yang bisa dibuka dan diedit dengan Excel atau Google Sheets.

| File | Isi | Jumlah awal |
|---|---|---|
| `data/prodi.csv` | Daftar prodi, penjelasan, mata kuliah, karier, mapel | 714 prodi |
| `data/kampus.csv` | Daftar kampus, jenis, provinsi, situs resmi | 348 kampus di 38 provinsi (93 sekolah kedinasan) |
| `data/kampus_prodi.csv` | Prodi apa saja yang dibuka tiap kampus, plus skor aman, daya tampung, peminat | ±6.600 baris |
| `data/kedinasan.csv` | Info sekolah kedinasan: instansi, ikatan dinas (ya/sebagian/tidak), jalur masuk, catatan | 93 sekolah |
| `data/alias.csv` | Nama lain prodi (misal "Informatika" = "Teknik Informatika") | — |
| `data/sekolah.json` | Nama sekolah, nama aplikasi, daftar rumpun, daftar resmi 38 provinsi | — |

### ⚠️ Yang wajib dilengkapi guru BK sebelum dipakai siswa

1. **Skor aman, daya tampung, dan peminat** di `kampus_prodi.csv` masih **kosong**.
   Ada sekitar 50 baris berlabel `CONTOH` yang berisi angka ilustrasi agar fitur bisa dicoba. **Hapus atau ganti angka itu.**
   - Daya tampung dan peminat: ambil dari portal resmi SNPMB (snpmb.bppp.kemdikbud.go.id) pada bagian daya tampung per prodi.
   - Skor aman: isi dari analisis BK sendiri, misalnya hasil tryout, data alumni SMA Malika IBS yang diterima, atau sumber yang Anda percaya.
   - Setelah diganti, ubah kolom `sumber` (misalnya `SNPMB 2025` atau `Data alumni`) agar label "contoh" hilang.
2. **Daftar prodi per kampus** disusun dari pengetahuan umum dan **perlu dicek** ke situs resmi kampus atau PDDikti (pddikti.kemdiktisaintek.go.id). Tambahkan prodi yang belum ada dan hapus yang keliru.
3. **Alamat situs kampus** sebaiknya dicek ulang satu per satu. Sebanyak 52 kampus (terutama Poltekkes, Polbangtan, dan kampus di Papua) sengaja dibiarkan kosong karena alamatnya belum pasti.
   Untuk 159 kampus tambahan, daftar prodinya masih berupa **profil umum** sesuai jenis kampus (misalnya semua Poltekkes diberi Keperawatan, Kebidanan, Gizi, dan seterusnya). Bagian ini paling perlu dicek.
4. **Info kedinasan** (`kedinasan.csv`) berisi status ikatan dinas dan jalur masuk secara umum. Aturan seleksi berubah setiap tahun; cocokkan dengan pengumuman SSCASN dan situs resmi tiap sekolah sebelum dibagikan ke siswa.
5. **Rekomendasi ★** di `prodi.csv` (kolom `rekomendasi` = `ya`) adalah pilihan awal. Sesuaikan dengan pandangan guru BK.

Semua penjelasan prodi ditulis khusus untuk aplikasi ini dan boleh diubah sesuka sekolah.

### Format kolom

**prodi.csv**: `nama, rumpun, jenjang, ringkas, matkul, karier, mapel, rekomendasi`
- Isian berisi lebih dari satu item dipisah titik koma: `Anatomi; Fisiologi; Farmakologi`
- `rumpun` harus salah satu yang tercantum di `data/sekolah.json`

**kampus.csv**: `id, nama, singkatan, jenis, provinsi, kota, website`
- `id` adalah kode pendek unik tanpa spasi, misal `ugm`, `uin-jkt`
- `jenis`: `PTN`, `PTKIN` (UIN/IAIN), `PTKN` (kedinasan), atau `PTS`

**kampus_prodi.csv**: `kampus_id, prodi, jenjang, skor_aman, daya_tampung, peminat, sumber`
- `kampus_id` harus sama dengan `id` di kampus.csv
- `prodi` harus sama dengan nama di prodi.csv (atau terdaftar di alias.csv)
- `jenjang`: `S1`, `D4`, atau `D3`

---

## Cara menerbitkan di GitHub (sekali saja)

1. Buat akun di github.com jika belum punya.
2. Buat repository baru, misalnya `malika-prodi`. Pilih **Public**, karena GitHub Pages gratis hanya untuk repo publik. Kata sandi tidak ikut tersimpan di repo, lihat langkah 5.
3. Unggah semua isi folder ini ke repository tersebut, **kecuali folder `data-private/`**. Folder itu berisi kata sandi untuk uji lokal dan sudah dikecualikan lewat `.gitignore`.
   - Cara termudah: di halaman repo, klik **Add file → Upload files**, lalu seret semua file dan folder ke sana.
   - Atau dengan git di terminal:
     ```bash
     git remote add origin https://github.com/NAMA-AKUN/malika-prodi.git
     git push -u origin main
     ```
4. Di repo, buka **Settings → Pages**. Pada *Build and deployment → Source*, pilih **GitHub Actions**.
5. Pasang kata sandi: buka **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `KATA_SANDI`
   - Secret: kata sandi untuk siswa, misalnya `Halim MBS`
   - Huruf besar/kecil dan spasi berlebih diabaikan, jadi siswa yang mengetik `halim mbs` tetap bisa masuk.
6. Buka tab **Actions → Terbitkan Malika Prodi → Run workflow**.
   Setelah selesai (±1 menit), alamat aplikasi muncul di **Settings → Pages**, misalnya `https://nama-akun.github.io/malika-prodi/`.

## Cara memperbarui data

- **Mengubah prodi, kampus, atau skor**: buka file CSV di GitHub, klik ikon pensil (Edit), simpan dengan **Commit changes**. Situs terbit ulang otomatis dalam ±1 menit.
  Untuk perubahan besar: unduh CSV, edit di Excel, simpan sebagai **CSV UTF-8**, lalu unggah ulang lewat **Add file → Upload files** dengan nama file yang sama.
- **Mengganti kata sandi**: buka Settings → Secrets → Actions → `KATA_SANDI` → Update, lalu jalankan ulang workflow di tab **Actions**. Siswa yang sudah masuk di perangkatnya tetap bisa membuka aplikasi sampai mereka menekan **Keluar**.
- Cek hasil di tab **Actions**. Bila ada peringatan (misalnya nama prodi salah ketik di kampus_prodi.csv), peringatan itu tampil di log langkah "Bangun situs dari CSV".

## Keamanan

- Kata sandi **tidak pernah** ditulis ke situs maupun repo. Yang tersimpan hanya hash PBKDF2-nya di `data/akses.json` hasil build.
- Kata sandi ini hanya menyaring siapa yang bisa membuka tampilan aplikasi. Isi database (prodi dan kampus) tetap berupa file publik, sehingga orang yang paham teknis masih bisa membacanya. Jangan simpan data rahasia di aplikasi ini.
- Kata sandi bersama mudah tersebar. Gantilah secara berkala, misalnya setiap awal semester.
- Pilihan di "Rencanaku" hanya tersimpan di HP atau laptop siswa masing-masing, tidak dikirim ke mana pun.

## Mencoba di komputer sendiri (opsional)

Butuh Node.js versi 18 atau lebih baru.

```bash
node scripts/build.mjs
```

```bash
node scripts/serve.mjs
```

Lalu buka http://localhost:8080. Untuk uji login lokal, tulis kata sandi di file `data-private/kata-sandi.txt`.

## Struktur folder

```
data/                 database CSV (diedit guru BK)
data-private/         kata sandi untuk uji lokal (TIDAK diunggah)
site/                 tampilan aplikasi (HTML, CSS, JS)
scripts/build.mjs     mengubah CSV menjadi situs siap terbit di dist/
scripts/serve.mjs     server lokal untuk mencoba
.github/workflows/    otomatisasi terbit ke GitHub Pages
```
