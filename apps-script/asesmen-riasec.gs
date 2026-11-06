/**
 * Penerima hasil Asesmen Minat RIASEC dari Jelajah Kampus.
 *
 * Pasang di Google Spreadsheet sekolah:
 *   1. Buat spreadsheet baru, lalu buka Ekstensi → Apps Script.
 *   2. Hapus isi Code.gs, tempel seluruh isi file ini, lalu simpan.
 *   3. Klik Terapkan → Deployment baru → jenis "Aplikasi web".
 *      Jalankan sebagai: Saya. Yang memiliki akses: Siapa saja.
 *   4. Salin URL aplikasi web (berakhiran /exec) ke "asesmen_url" di data/sekolah.json.
 *
 * Menu "Asesmen RIASEC" di spreadsheet menghitung reliabilitas (Cronbach's alpha) tiap skala.
 */
const LEMBAR_HASIL = "Hasil";
const LEMBAR_RELIABILITAS = "Reliabilitas";
const TIPE = ["R", "I", "A", "S", "E", "C"];
const KOLOM = ["Waktu kirim", "Waktu tes", "Nama", "Kelas", "Kode Holland",
  ...TIPE.map(k => `Total ${k}`), ...TIPE.map(k => `Minat ${k}`), ...TIPE.map(k => `Kemampuan ${k}`),
  "Konsistensi", "Kejelasan profil", "Prodi rekomendasi", "Mapel pilihan",
  ...TIPE.map(k => `Jawaban minat ${k}`), ...TIPE.map(k => `Jawaban kemampuan ${k}`), "Versi"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const sh = lembar_(LEMBAR_HASIL);
    if (sh.getLastRow() === 0) { sh.appendRow(KOLOM); sh.setFrozenRows(1); sh.getRange(1, 1, 1, KOLOM.length).setFontWeight("bold"); }
    const angka = (o, k) => Math.max(0, Math.min(100, Number((o || {})[k]) || 0));
    const digit = (o, k) => String((o || {})[k] || "").replace(/[^1-5]/g, "").slice(0, 20);
    sh.appendRow([
      new Date(), teks_(d.waktu, 30), teks_(d.nama, 80), teks_(d.kelas, 30), teks_(d.kode, 3).replace(/[^RIASEC]/g, ""),
      ...TIPE.map(k => angka(d.total, k)), ...TIPE.map(k => angka(d.minat, k)), ...TIPE.map(k => angka(d.kemampuan, k)),
      teks_(d.konsistensi, 10), teks_(d.diferensiasi, 10),
      teks_((d.prodi || []).join("; "), 400), teks_((d.mapel || []).join("; "), 300),
      // Jawaban disimpan sebagai teks (diawali ') agar angka seperti "54321" tidak diubah format.
      ...TIPE.map(k => "'" + digit((d.jawaban || {}).minat, k)), ...TIPE.map(k => "'" + digit((d.jawaban || {}).kemampuan, k)),
      Number(d.versi) || 1
    ]);
    return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Teks dari siswa dipotong panjangnya dan dicegah terbaca sebagai rumus spreadsheet.
function teks_(v, maks) {
  const s = String(v == null ? "" : v).slice(0, maks);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function lembar_(nama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nama) || ss.insertSheet(nama);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Asesmen RIASEC")
    .addItem("Hitung reliabilitas (Cronbach's alpha)", "hitungReliabilitas")
    .addToUi();
}

// Cronbach's alpha per skala minat (8 butir). Nilai 0,70 ke atas lazim dianggap reliabel.
function hitungReliabilitas() {
  const sh = lembar_(LEMBAR_HASIL);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) { SpreadsheetApp.getUi().alert("Belum ada data hasil asesmen."); return; }
  const kepala = data[0];
  const out = [["Skala", "Tipe", "Jumlah siswa", "Jumlah butir", "Cronbach's alpha", "Keterangan"]];
  const NAMA = { R: "Realistic", I: "Investigative", A: "Artistic", S: "Social", E: "Enterprising", C: "Conventional" };
  TIPE.forEach(k => {
    const kol = kepala.indexOf(`Jawaban minat ${k}`);
    const baris = data.slice(1).map(r => String(r[kol]).replace(/^'/, "")).filter(s => /^[1-5]+$/.test(s));
    const n = baris.length ? Math.max(...baris.map(s => s.length)) : 0;
    const lengkap = baris.filter(s => s.length === n).map(s => s.split("").map(Number));
    const a = alpha_(lengkap);
    out.push(["Minat", `${k} · ${NAMA[k]}`, lengkap.length, n, a == null ? "-" : Math.round(a * 1000) / 1000, ket_(a, lengkap.length)]);
  });
  const r = lembar_(LEMBAR_RELIABILITAS);
  r.clear();
  r.getRange(1, 1, out.length, out[0].length).setValues(out);
  r.getRange(1, 1, 1, out[0].length).setFontWeight("bold");
  r.getRange(out.length + 2, 1).setValue(`Dihitung ${new Date().toLocaleString("id-ID")}. Butuh minimal 30 siswa agar hasilnya bermakna.`);
  r.autoResizeColumns(1, out[0].length);
  SpreadsheetApp.getActive().setActiveSheet(r);
}

function alpha_(m) {
  if (m.length < 3 || !m[0] || m[0].length < 2) return null;
  const k = m[0].length;
  const varian = xs => { const r = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + (b - r) ** 2, 0) / (xs.length - 1); };
  const vButir = Array.from({ length: k }, (_, j) => varian(m.map(r => r[j]))).reduce((a, b) => a + b, 0);
  const vTotal = varian(m.map(r => r.reduce((a, b) => a + b, 0)));
  return vTotal ? (k / (k - 1)) * (1 - vButir / vTotal) : null;
}

function ket_(a, n) {
  if (a == null) return "Data belum cukup";
  const t = a >= 0.8 ? "Baik" : a >= 0.7 ? "Dapat diterima" : a >= 0.6 ? "Cukup, perlu ditinjau" : "Rendah, butir perlu diperbaiki";
  return n < 30 ? `${t} (sampel masih kecil)` : t;
}
