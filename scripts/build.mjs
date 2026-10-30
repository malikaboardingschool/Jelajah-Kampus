// Membangun situs siap terbit di folder dist/ dari:
//   site/            -> halaman & aset aplikasi
//   data/*.csv       -> database prodi, kampus, dan prodi per kampus
//   KATA_SANDI (env) atau data-private/kata-sandi.txt -> kata sandi bersama untuk masuk
//
// Jalankan: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCSV, slug, list } from "./csv.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(root + p, "utf8");
const warnings = [];
const warn = m => warnings.push(m);

// ---------- Sekolah ----------
const sekolah = JSON.parse(read("data/sekolah.json"));

// ---------- Prodi ----------
const RUMPUN_VALID = new Set(sekolah.rumpun);
const prodi = [];
const prodiIndex = new Map(); // slug -> index
parseCSV(read("data/prodi.csv")).forEach((r, i) => {
  if (!r.nama) return;
  const id = slug(r.nama);
  if (prodiIndex.has(id)) { warn(`prodi.csv baris ${i + 2}: "${r.nama}" duplikat, dilewati`); return; }
  if (!RUMPUN_VALID.has(r.rumpun)) warn(`prodi.csv baris ${i + 2}: rumpun "${r.rumpun}" tidak dikenal`);
  prodiIndex.set(id, prodi.length);
  prodi.push({
    id, nama: r.nama, rumpun: r.rumpun,
    jenjang: list(r.jenjang),
    ringkas: r.ringkas,
    matkul: list(r.matkul), karier: list(r.karier), mapel: list(r.mapel),
    rek: /^(ya|y|1|true)$/i.test(r.rekomendasi || "")
  });
});

// Nama alternatif agar "Teknik Informatika" dan "Informatika" mengarah ke prodi yang sama.
const alias = new Map();
if (existsSync(root + "data/alias.csv")) {
  for (const r of parseCSV(read("data/alias.csv"))) alias.set(slug(r.alias), slug(r.prodi));
}
const findProdi = nama => {
  const s = slug(nama);
  return prodiIndex.get(s) ?? prodiIndex.get(alias.get(s));
};

// ---------- Kampus ----------
const kampus = [];
const kampusIndex = new Map();
parseCSV(read("data/kampus.csv")).forEach((r, i) => {
  if (!r.id) return;
  if (kampusIndex.has(r.id)) { warn(`kampus.csv baris ${i + 2}: id "${r.id}" duplikat`); return; }
  if (!["PTN", "PTS", "PTKIN", "PTKN", "PTLN"].includes(r.jenis)) warn(`kampus.csv baris ${i + 2}: jenis "${r.jenis}" tidak dikenal`);
  // Untuk kampus luar negeri (PTLN), kolom provinsi berisi nama negara.
  if (r.jenis === "PTLN") { if (sekolah.negara && !sekolah.negara.includes(r.provinsi)) warn(`kampus.csv baris ${i + 2}: negara "${r.provinsi}" tidak ada di daftar negara (data/sekolah.json)`); }
  else if (sekolah.provinsi && !sekolah.provinsi.includes(r.provinsi)) warn(`kampus.csv baris ${i + 2}: provinsi "${r.provinsi}" tidak ada di daftar resmi (data/sekolah.json)`);
  kampusIndex.set(r.id, kampus.length);
  kampus.push({ id: r.id, nama: r.nama, singkat: r.singkatan || "", prov: r.provinsi, kota: r.kota || "", jenis: r.jenis, web: r.website || "" });
});

// ---------- Info negara (kuliah ke luar negeri) ----------
const negara = existsSync(root + "data/negara.csv") ? parseCSV(read("data/negara.csv")).map(r => ({
  nama: r.negara, wilayah: r.wilayah, bahasa: r.bahasa_kuliah, tes: r.tes, beasiswa: r.beasiswa, jalur: r.jalur,
  persiapan: list(r.persiapan), catatan: r.catatan
})) : [];

// ---------- Linimasa seleksi (TKA, SNBP, SNBT, kedinasan, mandiri) ----------
const linimasa = existsSync(root + "data/linimasa.csv") ? parseCSV(read("data/linimasa.csv")).map((r, i) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.mulai) || !/^\d{4}-\d{2}-\d{2}$/.test(r.selesai)) warn(`linimasa.csv baris ${i + 2}: tanggal harus berformat YYYY-MM-DD`);
  return { mulai: r.mulai, selesai: r.selesai, waktu: r.waktu, kegiatan: r.kegiatan, singkat: r.singkat || r.kegiatan, jalur: r.jalur, tips: r.tips };
}).sort((a, b) => a.mulai.localeCompare(b.mulai)) : [];

// ---------- Jurusan yang linear dengan mapel rapor favorit ----------
const mapel = existsSync(root + "data/mapel_jurusan.csv") ? parseCSV(read("data/mapel_jurusan.csv")).map(r => ({ mapel: r.mapel, jurusan: list(r.jurusan) })) : [];

// ---------- Info sekolah kedinasan ----------
if (existsSync(root + "data/kedinasan.csv")) {
  parseCSV(read("data/kedinasan.csv")).forEach((r, i) => {
    const k = kampusIndex.get(r.kampus_id);
    if (k == null) { warn(`kedinasan.csv baris ${i + 2}: kampus "${r.kampus_id}" tidak ada di kampus.csv`); return; }
    kampus[k].dinas = { instansi: r.instansi, ikatan: (r.ikatan_dinas || "").toLowerCase(), jalur: r.jalur, catatan: r.catatan };
  });
}

// ---------- Data resmi SNPMB (daya tampung & peminat) ----------
// snpmb_ptn.csv  : pemetaan PTN SNPMB -> kampus_id, status PTN-BH, laman PMB
// snpmb_prodi.csv: daftar prodi resmi per PTN + daya tampung 2026 + riwayat 2021–2025
const num = v => { const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
let TAHUN = [2021, 2022, 2023, 2024, 2025]; // diganti otomatis sesuai kolom dt_<tahun> di snpmb_prodi.csv
if (existsSync(root + "data/snpmb_ptn.csv")) {
  for (const r of parseCSV(read("data/snpmb_ptn.csv"))) {
    const k = kampusIndex.get(r.kampus_id);
    if (k == null) { warn(`snpmb_ptn.csv: kampus "${r.kampus_id}" tidak ada di kampus.csv`); continue; }
    Object.assign(kampus[k], { snpmb: true, ptnbh: r.ptnbh === "1", pmb: r.laman_pmb || "" });
  }
}

// Menautkan nama prodi resmi (mis. "Pendidikan Dokter") ke katalog penjelasan prodi (mis. "Kedokteran").
const ATURAN = { "pendidikan-dokter": "kedokteran", "pendidikan-dokter-gigi": "kedokteran-gigi", "pendidikan-dokter-hewan": "kedokteran-hewan",
  "keperawatan": "ilmu-keperawatan", "ilmu-gizi": "gizi", "statistik": "statistika", "ilmu-peternakan": "peternakan",
  "ilmu-administrasi-publik": "administrasi-publik", "ilmu-administrasi-negara": "administrasi-negara", "ilmu-administrasi-bisnis": "administrasi-bisnis",
  "ilmu-hubungan-internasional": "hubungan-internasional", "akuakultur": "budidaya-perairan", "ilmu-perpustakaan-dan-informasi": "ilmu-perpustakaan",
  "bahasa-dan-sastra-inggris": "sastra-inggris", "bahasa-dan-sastra-indonesia": "sastra-indonesia", "sastra-arab": "bahasa-dan-sastra-arab",
  "bimbingan-dan-konseling-pendidikan-islam": "bimbingan-dan-konseling-pendidikan-islam", "pendidikan-guru-sekolah-dasar-pgsd": "pendidikan-guru-sekolah-dasar",
  "ilmu-al-quran-dan-tafsir": "ilmu-al-qur-an-dan-tafsir", "ilmu-alquran-dan-tafsir": "ilmu-al-qur-an-dan-tafsir", "teknologi-informasi": "teknologi-informasi",
  "pendidikan-ilmu-pengetahuan-alam": "pendidikan-ipa", "pendidikan-ilmu-pengetahuan-sosial": "pendidikan-ips", "ppkn": "pendidikan-pancasila-dan-kewarganegaraan",
  "pendidikan-pancasila-dan-kewarganegaraan-ppkn": "pendidikan-pancasila-dan-kewarganegaraan", "pgsd": "pendidikan-guru-sekolah-dasar",
  "pendidikan-guru-paud": "pendidikan-guru-pendidikan-anak-usia-dini", "pg-paud": "pendidikan-guru-pendidikan-anak-usia-dini", "pendidikan-anak-usia-dini": "pendidikan-guru-pendidikan-anak-usia-dini",
  "bimbingan-konseling": "bimbingan-dan-konseling", "sains-aktuaria": "aktuaria", "antropologi-sosial": "antropologi",
  "teknik-pertanian": "teknik-pertanian-dan-biosistem", "keteknikan-pertanian": "teknik-pertanian-dan-biosistem", "perpajakan": "administrasi-perpajakan",
  "keuangan-dan-perbankan": "perbankan-dan-keuangan", "perbankan-dan-keuangan-digital": "perbankan-dan-keuangan", "perpustakaan-dan-sains-informasi": "ilmu-perpustakaan",
  "perpustakaan-dan-ilmu-informasi": "ilmu-perpustakaan", "teknologi-pangan-dan-hasil-pertanian": "teknologi-pangan", "agrobisnis-perikanan": "agribisnis-perikanan",
  "pendidikan-khusus": "pendidikan-luar-biasa", "pendidikan-musik": "pendidikan-seni-musik", "pendidikan-tari": "pendidikan-seni-tari",
  "pendidikan-luar-sekolah": "pendidikan-masyarakat", "pendidikan-non-formal": "pendidikan-masyarakat", "manajemen-pendidikan": "administrasi-pendidikan",
  "nutrisi-dan-teknologi-pakan-ternak": "nutrisi-dan-teknologi-pakan", "seni-murni": "seni-rupa-murni", "tari": "seni-tari", "musik": "seni-musik", "teater": "seni-teater",
  "statistika-dan-sains-data": "statistika", "sains-data-terapan": "sains-data", "ekonomi-dan-keuangan-islam": "ekonomi-islam",
  "pendidikan-teknik-informatika": "pendidikan-teknik-informatika-dan-komputer", "pendidikan-komputer": "pendidikan-ilmu-komputer", "akuntansi-manajerial": "akuntansi-manajemen",
  "bahasa-inggris-untuk-komunikasi-bisnis-dan-profesional": "bahasa-inggris-untuk-komunikasi-bisnis", "administrasi-bisnis-terapan": "administrasi-bisnis",
  "perancangan-jalan-dan-jembatan": "teknik-perancangan-jalan-dan-jembatan", "teknologi-kimia-industri": "teknologi-rekayasa-kimia-industri",
  "pemeliharaan-mesin": "teknik-perawatan-dan-perbaikan-mesin", "teknik-alat-berat": "teknologi-rekayasa-alat-berat", "teknologi-rekayasa-pemeliharaan-alat-berat": "teknologi-rekayasa-alat-berat",
  "budidaya-perikanan": "akuakultur", "kesekretariatan": "sekretari", "teknologi-listrik": "teknik-listrik-vokasi", "pendidikan-seni-pertunjukan": "pendidikan-seni-drama-tari-dan-musik",
  "arsitektur-bangunan-gedung": "teknik-arsitektur-bangunan-vokasi", "sumber-daya-akuatik": "manajemen-sumber-daya-perairan", "sains-biomedis": "biomedis", "kriya-seni": "kriya",
  "ekonomi-manajemen": "manajemen", "manajemen-perusahaan": "manajemen", "bahasa-dan-kebudayaan-inggris": "sastra-inggris", "sastra-perancis": "sastra-prancis",
  "pendidikan-vokasional-teknik-mesin": "pendidikan-teknik-mesin", "pendidikan-vokasional-rekayasa-elektro": "pendidikan-teknik-elektro", "pendidikan-vokasional-seni-kuliner": "pendidikan-tata-boga",
  "teknik-sumber-daya-air": "teknik-pengairan", "pengolahan-dan-penyimpanan-hasil-perikanan": "teknologi-hasil-perikanan", "pendidikan-bahasa-sastra-indonesia-dan-daerah": "pendidikan-bahasa-dan-sastra-indonesia",
  "teknologi-produksi-tanaman-perkebunan": "budidaya-tanaman-perkebunan", "teknologi-produksi-ternak": "peternakan-vokasi", "pengelolaan-agribisnis": "agribisnis-vokasi",
  "pengembangan-produk-agroindustri": "agroindustri", "administrasi-perkantoran-digital": "administrasi-perkantoran", "teknik-mesin-produksi-dan-perawatan": "teknik-mesin-vokasi",
  "rekayasa-perancangan-mekanik": "teknologi-rekayasa-perancangan-manufaktur", "teknologi-rekayasa-konstruksi-bangunan-air": "teknologi-rekayasa-sumber-daya-air" };
// Rapikan singkatan umum di nama resmi sebelum dicocokkan.
const rapikan = n => n.replace(/\bPend\.\s*/gi, "Pendidikan ").replace(/&/g, " dan ").replace(/sumberdaya/gi, "sumber daya").replace(/perancis/gi, "prancis").split("/")[0];
const tautProdi = (nama, jenjang) => {
  const dasar = slug(rapikan(nama).replace(/\(.*?\)/g, " ").replace(/\b(program studi|prodi|kampus [a-z ]+|psdku [a-z ]+)\b/gi, " "));
  const coba = [dasar, ATURAN[dasar], dasar.replace(/^ilmu-/, ""), "ilmu-" + dasar, dasar.replace(/^teknologi-rekayasa-/, "teknik-"), dasar.replace(/^sarjana-terapan-/, "")];
  if (jenjang !== "S1") coba.unshift(dasar + "-vokasi");
  for (const c of coba) {
    if (!c) continue;
    const i = prodiIndex.get(c) ?? prodiIndex.get(alias.get(c));
    if (i != null) return i;
  }
  return -1;
};

// ---------- Biaya (UKT & biaya masuk) dan skor aman: diisi sekolah dari SK resmi PTN ----------
const biaya = new Map(); // kunci: kode_prodi atau kampus_id|nama
if (existsSync(root + "data/biaya_ptn.csv")) {
  for (const r of parseCSV(read("data/biaya_ptn.csv"))) {
    const val = [num(r.ukt_terendah), num(r.ukt_tertinggi), num(r.ipi_terendah), num(r.ipi_tertinggi), r.tahun || "", r.sumber || ""];
    if (val.slice(0, 4).every(v => v == null)) continue;
    biaya.set(r.kode_prodi ? `k${r.kode_prodi}` : `${r.kampus_id}|${slug(r.nama_prodi || "")}`, val);
  }
}
const skorAman = new Map();
if (existsSync(root + "data/skor_aman.csv")) {
  for (const r of parseCSV(read("data/skor_aman.csv"))) {
    const v = num(r.skor_aman); if (v == null) continue;
    skorAman.set(r.kode_prodi ? `k${r.kode_prodi}` : `${r.kampus_id}|${slug(r.nama_prodi || "")}`, [v, r.sumber || ""]);
  }
}
const cariBy = (map, kode, kampusId, nama) => map.get(`k${kode}`) ?? map.get(`${kampusId}|${slug(nama)}`) ?? null;

// ---------- Profil kampus (diisi sekolah dari situs resmi kampus) ----------
if (existsSync(root + "data/profil_kampus.csv")) {
  for (const r of parseCSV(read("data/profil_kampus.csv"))) {
    const k = kampusIndex.get(r.kampus_id); if (k == null) continue;
    const pr = { akreditasi: r.akreditasi, berdiri: r.tahun_berdiri, mahasiswa: r.jumlah_mahasiswa, ringkas: r.ringkas, sumber: r.sumber };
    if (Object.values(pr).some(Boolean)) kampus[k].profil = pr;
  }
}

// ---------- Prodi per kampus ----------
// Baris kp.json: [kampus, prodiKatalog|-1, jenjang, skor_aman, daya_tampung, peminat, sumber, nama_resmi, riwayat, kode_prodi, biaya, portofolio]
//   riwayat = [[daya_tampung, peminat] untuk 2021..2025], biaya = [ukt_min, ukt_max, ipi_min, ipi_max, tahun, sumber]
const kp = [];
const tercakupSnpmb = new Set();
let tertaut = 0, totalSnpmb = 0;
if (existsSync(root + "data/snpmb_prodi.csv")) {
  const barisSnpmb = parseCSV(read("data/snpmb_prodi.csv"));
  const kolom = Object.keys(barisSnpmb[0] || {});
  const th = kolom.filter(c => /^dt_\d{4}$/.test(c)).map(c => +c.slice(3)).sort();
  if (th.length) TAHUN = th.slice(-5);
  const kolomDT = kolom.find(c => /^daya_tampung_\d{4}$/.test(c)) || "daya_tampung_2026";
  for (const r of barisSnpmb) {
    const k = kampusIndex.get(r.kampus_id);
    if (k == null) { warn(`snpmb_prodi.csv: kampus "${r.kampus_id}" tidak ada di kampus.csv`); continue; }
    tercakupSnpmb.add(k);
    const p = r.prodi_katalog ? (findProdi(r.prodi_katalog) ?? -1) : tautProdi(r.nama_resmi, r.jenjang);
    totalSnpmb++; if (p >= 0) tertaut++;
    const riwayat = TAHUN.map(t => [num(r[`dt_${t}`]), num(r[`peminat_${t}`])]);
    const sk = cariBy(skorAman, r.kode_prodi, r.kampus_id, r.nama_resmi);
    kp.push([k, p, r.jenjang || "S1", sk ? sk[0] : null, num(r[kolomDT]), riwayat[riwayat.length - 1][1], "SNPMB", r.nama_resmi, riwayat, r.kode_prodi,
      cariBy(biaya, r.kode_prodi, r.kampus_id, r.nama_resmi), r.portofolio || ""]);
  }
}
// Kampus lain (PTS, kedinasan, luar negeri, dll.) memakai daftar perkiraan di kampus_prodi.csv.
const seen = new Set();
parseCSV(read("data/kampus_prodi.csv")).forEach((r, i) => {
  const line = `kampus_prodi.csv baris ${i + 2}`;
  const k = kampusIndex.get(r.kampus_id);
  if (k == null) { warn(`${line}: kampus "${r.kampus_id}" tidak ada di kampus.csv`); return; }
  if (tercakupSnpmb.has(k)) return; // sudah memakai daftar resmi SNPMB
  const p = findProdi(r.prodi);
  if (p == null) { warn(`${line}: prodi "${r.prodi}" tidak ada di prodi.csv (tambahkan, atau daftarkan di alias.csv)`); return; }
  const key = `${k}|${p}|${r.jenjang}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (r.sumber === "CONTOH") return; // angka ilustrasi lama tidak dipakai lagi
  const sk = cariBy(skorAman, "", r.kampus_id, prodi[p].nama);
  kp.push([k, p, r.jenjang || "S1", sk ? sk[0] : num(r.skor_aman), num(r.daya_tampung), num(r.peminat), r.sumber || "", "", null, "", cariBy(biaya, "", r.kampus_id, prodi[p].nama), ""]);
});

// ---------- Kata sandi ----------
// Kata sandi tidak pernah ditulis ke situs. Yang ditulis hanya salt dan hash PBKDF2-nya.
// Huruf besar/kecil dan spasi berlebih diabaikan, jadi "halim mbs" juga diterima.
const ITER = 150000;
const normSandi = s => String(s).trim().replace(/\s+/g, " ").toLowerCase();
let sandi = process.env.KATA_SANDI || "";
if (!sandi && existsSync(root + "data-private/kata-sandi.txt")) sandi = read("data-private/kata-sandi.txt");
sandi = normSandi(sandi);
const salt = randomBytes(16);
if (!sandi) warn("Kata sandi kosong: tidak ada yang bisa masuk. Isi secret KATA_SANDI di GitHub, atau data-private/kata-sandi.txt untuk uji lokal.");
const akses = { salt: salt.toString("base64"), iter: ITER, hash: sandi ? pbkdf2Sync(sandi, salt, ITER, 32, "sha256").toString("hex") : "" };

// ---------- Tulis dist/ ----------
const dist = root + "dist/";
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist + "data", { recursive: true });
cpSync(root + "site", dist, { recursive: true });
const out = (name, obj) => writeFileSync(dist + "data/" + name, JSON.stringify(obj));
out("prodi.json", prodi);
out("kampus.json", kampus);
out("negara.json", negara);
out("linimasa.json", linimasa);
out("mapel.json", mapel);
out("kp.json", kp);
out("akses.json", akses);
out("meta.json", {
  sekolah, diperbarui: new Date().toISOString(),
  jumlah: { prodi: prodi.length, kampus: kampus.length, provinsi: new Set(kampus.filter(k => k.jenis !== "PTLN").map(k => k.prov)).size, negara: new Set(kampus.filter(k => k.jenis === "PTLN").map(k => k.prov)).size, kampusLN: kampus.filter(k => k.jenis === "PTLN").length, provinsiResmi: (sekolah.provinsi || []).length, kampusProdi: kp.length, snpmbProdi: totalSnpmb, snpmbPTN: tercakupSnpmb.size }
});
writeFileSync(dist + ".nojekyll", "");

console.log(`SNPMB: ${totalSnpmb} prodi resmi di ${tercakupSnpmb.size} PTN, ${tertaut} tertaut ke katalog (${Math.round(tertaut / Math.max(totalSnpmb, 1) * 100)}%)`);
console.log(`Selesai: ${prodi.length} prodi, ${kampus.length} kampus, ${kp.length} prodi-kampus, kata sandi ${sandi ? "terpasang" : "BELUM diisi"} -> dist/`);
if (warnings.length) {
  console.log(`\n${warnings.length} peringatan:`);
  for (const w of warnings.slice(0, 60)) console.log("  - " + w);
  if (warnings.length > 60) console.log(`  ... dan ${warnings.length - 60} lainnya`);
}
