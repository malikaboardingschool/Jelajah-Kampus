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

// ---------- Info sekolah kedinasan ----------
if (existsSync(root + "data/kedinasan.csv")) {
  parseCSV(read("data/kedinasan.csv")).forEach((r, i) => {
    const k = kampusIndex.get(r.kampus_id);
    if (k == null) { warn(`kedinasan.csv baris ${i + 2}: kampus "${r.kampus_id}" tidak ada di kampus.csv`); return; }
    kampus[k].dinas = { instansi: r.instansi, ikatan: (r.ikatan_dinas || "").toLowerCase(), jalur: r.jalur, catatan: r.catatan };
  });
}

// ---------- Prodi per kampus ----------
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const kp = [];
const seen = new Set();
parseCSV(read("data/kampus_prodi.csv")).forEach((r, i) => {
  const line = `kampus_prodi.csv baris ${i + 2}`;
  const k = kampusIndex.get(r.kampus_id);
  if (k == null) { warn(`${line}: kampus "${r.kampus_id}" tidak ada di kampus.csv`); return; }
  const p = findProdi(r.prodi);
  if (p == null) { warn(`${line}: prodi "${r.prodi}" tidak ada di prodi.csv (tambahkan, atau daftarkan di alias.csv)`); return; }
  const key = `${k}|${p}|${r.jenjang}`;
  if (seen.has(key)) return;
  seen.add(key);
  // [kampus, prodi, jenjang, skor_aman, daya_tampung, peminat, sumber]
  kp.push([k, p, r.jenjang || "S1", num(r.skor_aman), num(r.daya_tampung), num(r.peminat), r.sumber || ""]);
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
out("kp.json", kp);
out("akses.json", akses);
out("meta.json", {
  sekolah, diperbarui: new Date().toISOString(),
  jumlah: { prodi: prodi.length, kampus: kampus.length, provinsi: new Set(kampus.filter(k => k.jenis !== "PTLN").map(k => k.prov)).size, negara: new Set(kampus.filter(k => k.jenis === "PTLN").map(k => k.prov)).size, kampusLN: kampus.filter(k => k.jenis === "PTLN").length, provinsiResmi: (sekolah.provinsi || []).length, kampusProdi: kp.length }
});
writeFileSync(dist + ".nojekyll", "");

console.log(`Selesai: ${prodi.length} prodi, ${kampus.length} kampus, ${kp.length} prodi-kampus, kata sandi ${sandi ? "terpasang" : "BELUM diisi"} -> dist/`);
if (warnings.length) {
  console.log(`\n${warnings.length} peringatan:`);
  for (const w of warnings.slice(0, 60)) console.log("  - " + w);
  if (warnings.length > 60) console.log(`  ... dan ${warnings.length - 60} lainnya`);
}
