// Jelajah Kampus (SMA Malika IBS) — aplikasi statis. Data dibaca dari data/*.json hasil scripts/build.mjs.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let LINIMASA = [], MAPEL = [], AKSES = {}, RIASEC = { tipe: [], soal: [] };
let META, PRODI, KAMPUS, KAMPUS_DN, ROWS_ALL, ROWS, ROWS_LN, PROVS, NEGARA = [], negaraByName = {}, prodiById, kampusById;
let user = store.get("mp_user");
let plan = store.get("mp_rencana") || []; // [{k, p, j}]
const q = {}; // isi filter per halaman, bertahan selama sesi

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  campus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/></svg>'
};
// Logo sekolah dari data/sekolah.json; kalau gagal dimuat, pakai logo cadangan bawaan.
const LOGO = (n = 38) => `<img class="logo" src="${esc(META.sekolah.logo || "assets/logo.svg")}" width="${n}" height="${n}" alt="Logo ${esc(META.sekolah.nama)}" onerror="this.onerror=null;this.src='assets/logo.svg'">`;

/* ---------------- Data ---------------- */
async function loadData() {
  const get = f => fetch(`data/${f}`, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [meta, prodi, kampus, kp] = await Promise.all([get("meta.json"), get("prodi.json"), get("kampus.json"), get("kp.json")]);
  META = meta; PRODI = prodi; KAMPUS = kampus;
  // Kata sandi diganti -> sesi lama tidak berlaku lagi.
  AKSES = await get("akses.json").catch(() => ({}));
  if (user && user.v !== (AKSES.hash || "").slice(0, 16)) { user = null; store.set("mp_user", null); }
  NEGARA = await get("negara.json").catch(() => []);
  LINIMASA = await get("linimasa.json").catch(() => []);
  MAPEL = await get("mapel.json").catch(() => []);
  RIASEC = await get("riasec.json").catch(() => RIASEC);
  negaraByName = Object.fromEntries(NEGARA.map(n => [n.nama, n]));
  ROWS_ALL = kp.map(([k, p, j, skor, tampung, peminat, sumber, nama, riwayat, kode, biaya, porto]) => {
    const pr = p >= 0 ? prodi[p] : null;
    const r = { k: kampus[k], p: pr, j, skor, tampung, peminat, resmi: sumber === "SNPMB", nama: nama || pr?.nama || "", riwayat, kode, biaya, porto };
    // Keketatan resmi tahun terakhir (2025): daya tampung ÷ peminat
    const last = riwayat?.[4];
    r.kt = last && last[0] && last[1] ? last[0] / last[1] : (tampung && peminat ? tampung / peminat : null);
    r._n = norm(`${r.nama} ${pr && pr.nama !== r.nama ? pr.nama : ""}`);
    return r;
  });
  // Halaman pencarian Indonesia hanya memakai ROWS (dalam negeri); kampus luar negeri punya halaman sendiri.
  ROWS = ROWS_ALL.filter(r => r.k.jenis !== "PTLN");
  ROWS_LN = ROWS_ALL.filter(r => r.k.jenis === "PTLN");
  KAMPUS_DN = kampus.filter(k => k.jenis !== "PTLN");
  // Urutan resmi (barat ke timur) dari data/sekolah.json; provinsi tanpa kampus tetap tampil di filter.
  PROVS = meta.sekolah.provinsi?.length ? meta.sekolah.provinsi : [...new Set(kampus.map(k => k.prov))].sort();
  prodiById = Object.fromEntries(prodi.map(p => [p.id, p]));
  kampusById = Object.fromEntries(kampus.map(k => [k.id, k]));
  prodi.forEach(p => { p._n = norm(p.nama); p._kampus = 0; p._kampusLN = 0; });
  kampus.forEach(k => { k._n = norm(`${k.nama} ${k.singkat}`); k._prodi = 0; });
  ROWS_ALL.forEach(r => { if (r.p) r.k.jenis === "PTLN" ? r.p._kampusLN++ : r.p._kampus++; r.k._prodi++; });
}

/* ---------------- Login ---------------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const normSandi = s => String(s).trim().replace(/\s+/g, " ").toLowerCase();
async function cekSandi(sandi) {
  const akses = AKSES;
  if (!akses.hash) return false;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normSandi(sandi)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(akses.salt), iterations: akses.iter }, base, 256);
  return hex(bits) === akses.hash;
}

function renderLogin() {
  const s = META.sekolah;
  document.title = `Masuk · ${s.app}`;
  $("#app").innerHTML = `
  <div class="login">
    <div class="login-band">${LOGO(76)}<b>${esc(s.app)}</b><small>${esc(s.nama)}</small></div>
    <div class="login-main"><form class="login-card" id="lf" novalidate>
    <h1>Masuk</h1>
    <p>Masukkan kata sandi eksklusif.</p>
    <input class="field" id="pw" type="password" autocomplete="current-password" placeholder="Kata sandi" aria-label="Kata sandi">
    <p class="err" id="err" role="alert"></p>
    <button class="btn" type="submit" id="go">Masuk</button>
  </form></div></div>`;
  $("#pw").focus();
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const pw = $("#pw").value;
    const err = $("#err");
    if (!pw.trim()) { err.textContent = "Isi kata sandi terlebih dahulu."; return; }
    $("#go").disabled = true; $("#go").textContent = "Memeriksa…"; err.textContent = "";
    try {
      if (!(await cekSandi(pw))) { err.textContent = "Kata sandi salah. Periksa lagi, atau tanyakan ke orang tua dan sekolah."; return; }
      user = { masuk: true, v: AKSES.hash.slice(0, 16) };
      store.set("mp_user", user);
      location.hash = "#/";
      route();
    } catch {
      err.textContent = "Gagal memeriksa kata sandi. Periksa koneksi internet, lalu coba lagi.";
    } finally {
      const b = $("#go"); if (b) { b.disabled = false; b.textContent = "Masuk"; }
    }
  };
}

/* ---------------- Kerangka ---------------- */
// Menu utama. Halaman detail ikut menyorot menu induknya.
const MENU = [["#/", "Beranda", "home"], ["#/asesmen", "Asesmen Minat", "asesmen"], ["#/cari", "Kampus Indonesia", "indonesia"], ["#/luar-negeri", "Kampus Luar Negeri", "luar"],
  ["#/linimasa", "Jadwal Penting", "jadwal"], ["#/panduan", "Panduan", "panduan"], ["#/rencana", "Rencanaku", "rencana"]];
const rencanaLabel = () => `Rencanaku${plan.length ? `<span class="count">${plan.length}</span>` : ""}`;
function shell(active) {
  const s = META.sekolah;
  $("#app").innerHTML = `
  <header class="top"><div class="in">
    <button class="brand" data-href="#/">${LOGO()}<div><b>${esc(s.app)}</b><small>${esc(s.nama)}</small></div></button>
    <button class="logout" id="logout" aria-label="Keluar" title="Keluar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg><span>Keluar</span></button>
  </div>
  <nav class="mainnav" aria-label="Menu utama"><div class="mainnav-in">
    ${MENU.map(([h, l, key]) => `<button class="navbtn" data-href="${h}" data-key="${key}" aria-current="${active === key ? "page" : "false"}">${key === "rencana" ? rencanaLabel() : l}</button>`).join("")}
  </div></nav></header>
  <main class="wrap" id="main"></main>`;
  $(".navbtn[aria-current='page']")?.scrollIntoView({ block: "nearest", inline: "center" });
  $$("[data-href]").forEach(b => b.onclick = () => go(b.dataset.href));
  $("#logout").onclick = () => { store.set("mp_user", null); store.set("mp_riasec", null); store.set("mp_riasec_draft", null); user = null; location.hash = ""; route(); };
}
// Sub-menu Kampus Indonesia
const SUBMENU = [["#/cari", "Cari Prodi", "cari"], ["#/kampus", "Daftar Kampus", "kampus"], ["#/kedinasan", "Sekolah Kedinasan", "kedinasan"], ["#/bahas", "Bahas Prodi", "bahas"]];
const subnav = active => `<nav class="subnav" aria-label="Kampus Indonesia">${SUBMENU.map(([h, l, k]) => `<button class="subbtn" data-href="${h}" aria-current="${active === k ? "page" : "false"}">${l}</button>`).join("")}</nav>`;
const bindNav = () => $$("#main [data-href]").forEach(b => b.onclick = () => go(b.dataset.href));
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const backBtn = (label = "← Beranda", h = "#/") => `<button class="back" data-back="${h}">${label}</button>`;
// Tombol kembali di halaman prodi mengikuti halaman asal siswa.
let hashLalu = "", hashKini = location.hash;
const ASAL = [["#/mapel", "← Cek Jurusan"], ["#/asesmen", "← Hasil asesmen"], ["#/cari", "← Cari Prodi"], ["#/rencana", "← Rencanaku"], ["#/kampus/", "← Kembali ke kampus"], ["#/negara/", "← Kembali"], ["#/luar-negeri", "← Kampus Luar Negeri"]];
const asalProdi = () => { const a = ASAL.find(([h]) => hashLalu.startsWith(h)); return a ? [a[1], hashLalu] : ["← Daftar prodi", "#/bahas"]; };
const bindBack = () => $$("[data-back]").forEach(b => b.onclick = () => go(b.dataset.back));
const FOOT = () => `<p class="foot">*Daya tampung dan peminat PTN: data resmi <a href="https://snpmb.id/utbk-snbt/daya-tampung-snbt" target="_blank" rel="noopener">SNPMB</a> (daya tampung SNBT 2026, peminat 2021–2025). Keketatan = daya tampung ÷ peminat tahun terakhir. Skor aman, UKT, dan biaya masuk diisi sekolah dari SK resmi PTN. Gunakan untuk perencanaan, bukan jaminan lolos. Data diperbarui ${new Date(META.diperbarui).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.</p>`;

function statsHTML() {
  const j = META.jumlah;
  return `<div class="stats">
    <div class="stat"><b class="mono">${(j.snpmbProdi || j.prodi).toLocaleString("id-ID")}</b><span class="label">Prodi resmi PTN</span></div>
    <div class="stat"><b class="mono">${j.kampus - (j.kampusLN || 0)}</b><span class="label">Kampus Indonesia</span></div>
    <div class="stat"><b class="mono">${j.provinsi}${j.provinsiResmi && j.provinsi < j.provinsiResmi ? `/${j.provinsiResmi}` : ""}</b><span class="label">Provinsi</span></div>
    ${j.negara ? `<div class="stat"><b class="mono">${j.negara}</b><span class="label">Negara</span></div>` : ""}
  </div>`;
}

const rasio = kt => `1 : ${(1 / kt).toFixed(1).replace(".", ",")}`;
const ketatKelas = kt => kt < 0.05 ? "bad" : kt < 0.15 ? "warn" : "ok";
const scoreBadge = r => {
  if (r.k.jenis === "PTLN") return `<span class="score na">${BENDERA[r.k.prov] || ""} ${esc(r.k.prov)}</span>`;
  const sk = r.skor != null ? `<span class="score">${r.skor.toFixed(1)}</span>` : "";
  if (r.kt) return `${sk}<span class="kt-badge ${ketatKelas(r.kt)}" title="Peminat per kursi tahun terakhir">${rasio(r.kt)}</span>`;
  if (sk) return sk;
  return `<span class="score na">${r.k.jenis === "PTS" ? "Mandiri" : r.k.jenis === "PTKN" ? "Seleksi instansi" : "Belum ada data"}</span>`;
};
function ketat(kt) {
  if (!kt) return null;
  const r = kt * 100;
  return { r, cls: ketatKelas(kt), lbl: kt < 0.05 ? "Sangat ketat" : kt < 0.15 ? "Ketat" : "Cukup longgar" };
}
// Urutan: "ketat" (paling ketat dulu), "longgar", "tampung" (kursi terbanyak), "nama", "skor"
const URUTAN = [["ketat", "Paling ketat dulu"], ["longgar", "Paling longgar dulu"], ["tampung", "Daya tampung terbanyak"], ["nama", "Nama kampus A–Z"]];
const sortRows = (rows, by = "ketat") => rows.sort((a, b) => {
  const nm = a.k.nama.localeCompare(b.k.nama) || a.nama.localeCompare(b.nama);
  if (by === "nama") return nm;
  if (by === "tampung") return (b.tampung ?? -1) - (a.tampung ?? -1) || nm;
  if (by === "skor") return (b.skor ?? -1) - (a.skor ?? -1) || nm;
  const ka = a.kt ?? 9, kb = b.kt ?? 9;
  return (by === "longgar" ? (b.kt ?? -1) - (a.kt ?? -1) : ka - kb) || nm;
});

// Daftar panjang ditampilkan bertahap agar ringan di HP.
function pagedList(el, items, renderItem, onPick, step = 60) {
  let shown = 0;
  const list = document.createElement("div"); list.className = "list";
  const more = document.createElement("button"); more.className = "btn ghost more";
  el.append(list, more);
  const draw = () => {
    const next = items.slice(shown, shown + step);
    list.insertAdjacentHTML("beforeend", next.map((it, i) => renderItem(it, shown + i)).join(""));
    shown += next.length;
    more.hidden = shown >= items.length;
    more.textContent = `Tampilkan lebih banyak (${items.length - shown} lagi)`;
  };
  list.onclick = e => { const b = e.target.closest("[data-i]"); if (b) onPick(items[+b.dataset.i]); };
  more.onclick = draw;
  draw();
}
// mode "kampus": judul = nama kampus; "prodi": judul = nama prodi; "skor": judul prodi, keterangan kampus
const rowItem = (r, i, mode = "kampus") => {
  const title = mode === "kampus" ? r.k.nama : r.nama;
  const sub = mode === "kampus" ? r.nama : mode === "skor" ? r.k.nama : (r.p?.rumpun || (r.resmi ? "Prodi resmi SNPMB" : ""));
  return `<button class="item" data-i="${i}"><div class="t"><b>${esc(title)}</b><span>${esc(sub)} · ${r.j} · ${JENIS_LABEL[r.k.jenis]}</span></div>${scoreBadge(r)}</button>`;
};

/* ---------------- Beranda ---------------- */
function viewHome() {
  shell("home");
  const j = META.jumlah;
  const nDN = j.kampus - (j.kampusLN || 0);
  $("#main").innerHTML = `
  <section class="hero hero-home">
    <div class="hero-text">
      <h1>Pilih Program Studi <span class="grad-text">dengan Data dan Strategi</span></h1>
      <p>Sistem ini dibuat eksklusif hanya untuk siswa siswi SMA Malika IBS. Jelajahi prodi dan kampus, temukan jurusan sesuai mapel yang kamu kuasai, lalu susun rencana untuk didiskusikan dengan orang tuamu dan sekolah.</p>
      <div class="hero-cta">
        <button class="btn" data-go="#/mapel">Cek Jurusan Sesuai Mapel</button>
        <button class="btn ghost" data-go="#/cari">Mulai Cari Prodi</button>
      </div>
    </div>
    <figure class="hero-img"><img src="assets/hero.webp" alt="Siswa dan siswi SMA Malika IBS bersiap melanjutkan kuliah" width="722" height="816" fetchpriority="high"></figure>
  </section>
  ${agendaCard()}
  <div class="quick">
    ${quick("#/cari", "campus", "Kampus Indonesia", `${nDN} kampus · data resmi SNPMB`)}
    ${quick("#/luar-negeri", "globe", "Kampus Luar Negeri", `${j.kampusLN} kampus · ${j.negara} negara`)}
    ${quick("#/linimasa", "calendar", "Jadwal Penting", "TKA, SNBP, SNBT, mandiri")}
    ${quick("#/rencana", "list", "Rencanaku", plan.length ? `${plan.length} pilihan tersimpan` : "Susun pilihanmu")}
  </div>
  <button class="promo-as" data-go="${store.get("mp_riasec") ? "#/asesmen/hasil" : "#/asesmen"}">
    <span class="ic">${ICON.target}</span>
    <span class="t"><b>Asesmen Minat & Bakat (RIASEC)</b><small>${store.get("mp_riasec") ? `Kode Holland-mu: ${esc(store.get("mp_riasec").kode)}. Lihat lagi hasil, mapel, dan rekomendasi prodimu.` : "10 menit mengenali tipe minatmu, lalu dapatkan saran mapel pilihan, rekomendasi prodi, dan peta karier."}</small></span>
    <span class="go" aria-hidden="true">${store.get("mp_riasec") ? "Lihat hasil" : "Mulai"} →</span>
  </button>
  <a class="beasiswa" href="https://satubeasiswa.kemdiktisaintek.go.id/" target="_blank" rel="noopener">
    <span class="ic">${ICON.gift}</span>
    <span class="t"><b>Info Beasiswa</b><small>Cari beasiswa kuliah dalam dan luar negeri di portal resmi Satu Beasiswa Kemdiktisaintek</small></span>
    <span class="go" aria-hidden="true">Buka ↗</span>
  </a>
  ${statsHTML()}`;
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}
const quick = (h, ic, t, p) => `<button class="quick-card" data-go="${h}"><span class="ic">${ICON[ic]}</span><span><b>${t}</b><small>${p}</small></span></button>`;
const tile = (h, ic, t, p) => `<button class="tile" data-go="${h}"><span class="ic">${ICON[ic]}</span><h3>${t}</h3><p>${p}</p></button>`;

/* ---------------- Cari Prodi ---------------- */
function viewCari() {
  shell("indonesia");
  const s = q.cari ||= { text: "", jenjang: "", jenis: "", urut: "ketat" };
  const CHIPS = ["Kedokteran", "Teknik Informatika", "Psikologi", "Ekonomi Syariah", "Ilmu Hukum", "Farmasi", "Pendidikan Agama Islam", "Hubungan Internasional"];
  $("#main").innerHTML = `${subnav("cari")}
  <section class="panel">
    <h2>Cari Prodi</h2>
    <p class="hint">Ketik nama jurusan, lihat kampus mana saja yang membukanya beserta daya tampung, peminat, dan keketatan resmi SNPMB.</p>
    <input class="search" id="c-q" placeholder="Contoh: Psikologi, Informatika, Ekonomi Syariah" value="${esc(s.text)}" autocomplete="off">
    <div class="chips">${CHIPS.map(c => `<button class="chip" data-chip="${esc(c)}" aria-pressed="${s.text === c}">${esc(c)}</button>`).join("")}</div>
    <div class="row">
      <select class="search" id="c-j" aria-label="Jenjang"><option value="">Semua jenjang</option>${["S1", "D4", "D3"].map(j => `<option ${s.jenjang === j ? "selected" : ""}>${j}</option>`).join("")}</select>
      <select class="search" id="c-t" aria-label="Jenis kampus"><option value="">Semua jenis kampus</option>${JENIS_OPTS.map(([v,l]) => `<option value="${v}" ${s.jenis === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="search" id="c-s" aria-label="Urutkan">${URUTAN.map(([v, l]) => `<option value="${v}" ${s.urut === v ? "selected" : ""}>↕ ${l}</option>`).join("")}</select>
    </div>
    <div id="c-out"></div>
    ${FOOT()}
  </section>`;
  bindNav();
  const draw = () => {
    const out = $("#c-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    if (t.length < 2) { out.innerHTML = '<div class="empty">Ketik minimal 2 huruf nama jurusan untuk mulai.</div>'; return; }
    const rows = sortRows(ROWS.filter(r => r._n.includes(t) && (!s.jenjang || r.j === s.jenjang) && (!s.jenis || r.k.jenis === s.jenis)), s.urut);
    if (!rows.length) {
      const sug = PRODI.filter(p => p._n.includes(t)).slice(0, 5);
      out.innerHTML = `<div class="empty">Belum ada kampus untuk pencarian ini.${sug.length ? ` Coba baca penjelasan prodinya: ${sug.map(p => `<a href="#/prodi/${p.id}">${esc(p.nama)}</a>`).join(", ")}.` : " Coba kata lain, misalnya \"Teknik\" atau \"Syariah\"."}</div>`;
      return;
    }
    const nk = j => new Set(rows.filter(r => r.k.jenis === j).map(r => r.k.id)).size;
    const dt = rows.reduce((a, r) => a + (r.tampung || 0), 0);
    out.insertAdjacentHTML("beforeend", `<div class="summary" style="margin-bottom:10px">Ditemukan <b>${rows.length}</b> pilihan di <b>${nk("PTN")}</b> PTN, <b>${nk("PTKIN")}</b> PTKIN, <b>${nk("PTKN")}</b> kedinasan, dan <b>${nk("PTS")}</b> PTS.${dt ? ` Total daya tampung SNBT 2026: <b class="mono">${dt.toLocaleString("id-ID")}</b> kursi.` : ""} Angka <span class="kt-badge warn">1 : 8</span> berarti 8 peminat berebut 1 kursi.</div>`);
    pagedList(out, rows, (r, i) => rowItem(r, i, "kampus"), openModal);
  };
  let timer;
  $("#c-q").oninput = e => { s.text = e.target.value; $$("[data-chip]").forEach(c => c.setAttribute("aria-pressed", c.dataset.chip === s.text)); clearTimeout(timer); timer = setTimeout(draw, 150); };
  $$("[data-chip]").forEach(c => c.onclick = () => { s.text = c.dataset.chip; $("#c-q").value = s.text; $$("[data-chip]").forEach(x => x.setAttribute("aria-pressed", x === c)); draw(); });
  $("#c-j").onchange = e => { s.jenjang = e.target.value; draw(); };
  $("#c-t").onchange = e => { s.jenis = e.target.value; draw(); };
  $("#c-s").onchange = e => { s.urut = e.target.value; draw(); };
  draw();
}

/* ---------------- Daftar Kampus ---------------- */
const JENIS_LABEL = { PTN: "PTN", PTKIN: "PTKIN", PTKN: "Kedinasan", PTS: "PTS", PTLN: "Luar Negeri" };
const JENIS_OPTS = [["PTN","PTN"],["PTKIN","UIN/IAIN (PTKIN)"],["PTKN","Sekolah kedinasan"],["PTS","Swasta"]];
const BENDERA = { "Mesir":"🇪🇬","Turkiye":"🇹🇷","Jepang":"🇯🇵","Amerika Serikat":"🇺🇸","Inggris":"🇬🇧","Korea Selatan":"🇰🇷","Arab Saudi":"🇸🇦","Malaysia":"🇲🇾","Australia":"🇦🇺","Jerman":"🇩🇪","Cina":"🇨🇳","Singapura":"🇸🇬","Brunei":"🇧🇳","Tunisia":"🇹🇳","Yordania":"🇯🇴","Maroko":"🇲🇦" };
const negaraLink = n => `#/negara/${encodeURIComponent(n)}`;
const IKATAN = { ya: ["ok", "Ikatan dinas"], sebagian: ["warn", "Sebagian ikatan dinas"], tidak: ["", "Bukan ikatan dinas"] };
const ikatanPill = d => d && IKATAN[d.ikatan] ? `<span class="pill ${IKATAN[d.ikatan][0]}">${IKATAN[d.ikatan][1]}</span>` : "";
const dinasBox = d => d ? `<div class="box"><div class="label">Info sekolah kedinasan</div>
  <div class="pills">${ikatanPill(d)}</div>
  <p><b>Instansi:</b> ${esc(d.instansi)}</p>
  <p><b>Jalur masuk:</b> ${esc(d.jalur)}</p>
  ${d.catatan ? `<p>${esc(d.catatan)}</p>` : ""}
  <p class="hint">Syarat usia, tinggi badan, kesehatan, dan kuota berubah setiap tahun. Selalu cek pengumuman resmi terbaru.</p></div>` : "";
function viewKampus(sub = "kampus") {
  shell("indonesia");
  const s = q.kampus ||= { text: "", prov: "", jenis: "", ikatan: "" };
  $("#main").innerHTML = `${subnav(sub)}
  <section class="panel">
    <h2>${sub === "kedinasan" ? "Sekolah Kedinasan" : "Daftar Kampus"}</h2>
    <p class="hint">${sub === "kedinasan" ? "Sekolah di bawah kementerian/lembaga. Saring yang ikatan dinas (lulus langsung menjadi ASN/TNI/Polri)." : "Cari kampus di Indonesia atau saring per provinsi dan jenis. Ketuk kampus untuk melihat semua prodinya."}</p>
    <input class="search" id="k-q" placeholder="Contoh: UIN, Gadjah Mada, Politeknik" value="${esc(s.text)}" autocomplete="off">
    <div class="row">
      <select class="search" id="k-p" aria-label="Provinsi"><option value="">Semua provinsi</option>${PROVS.map(p => `<option ${s.prov === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <select class="search" id="k-j" aria-label="Jenis kampus"><option value="">Semua jenis</option>${JENIS_OPTS.map(([v,l]) => `<option value="${v}" ${s.jenis === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    <div class="chips" id="k-ik" ${s.jenis === "PTKN" ? "" : "hidden"}>
      <button class="chip" data-ik="">Semua kedinasan</button>
      <button class="chip" data-ik="ya">Ikatan dinas</button>
      <button class="chip" data-ik="sebagian">Sebagian ikatan dinas</button>
      <button class="chip" data-ik="tidak">Bukan ikatan dinas</button>
    </div>
    <div id="k-out"></div>
    ${FOOT()}
  </section>`;
  bindNav();
  const draw = () => {
    const out = $("#k-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    $("#k-ik").hidden = s.jenis !== "PTKN";
    $$("[data-ik]").forEach(c => c.setAttribute("aria-pressed", c.dataset.ik === (s.ikatan || "")));
    const ks = KAMPUS_DN.filter(k => (!t || k._n.includes(t)) && (!s.prov || k.prov === s.prov) && (!s.jenis || k.jenis === s.jenis) && (s.jenis !== "PTKN" || !s.ikatan || k.dinas?.ikatan === s.ikatan)).sort((a, b) => a.nama.localeCompare(b.nama));
    if (!ks.length) { out.innerHTML = '<div class="empty">Kampus tidak ditemukan. Coba hapus filter provinsi atau jenis.</div>'; return; }
    out.insertAdjacentHTML("beforeend", `<p class="label" style="margin:0 0 8px">${ks.length} kampus</p>`);
    pagedList(out, ks, (k, i) => `<button class="item" data-i="${i}"><div class="t"><b>${esc(k.nama)}</b><span>${esc(k.kota ? k.kota + ", " : "")}${esc(k.prov)} · ${k._prodi} prodi</span></div>${k.ptnbh ? '<span class="pill">PTN-BH</span>' : ""}${k.dinas?.ikatan === "ya" ? '<span class="pill ok">Ikatan dinas</span>' : ""}<span class="tag">${JENIS_LABEL[k.jenis]}</span></button>`, k => go(`#/kampus/${k.id}`));
  };
  $("#k-q").oninput = e => { s.text = e.target.value; draw(); };
  $("#k-p").onchange = e => { s.prov = e.target.value; draw(); };
  $("#k-j").onchange = e => { s.jenis = e.target.value; s.ikatan = ""; draw(); };
  $$("[data-ik]").forEach(c => c.onclick = () => { s.ikatan = c.dataset.ik; draw(); });
  draw();
}
function viewKampusDetail(id) {
  const k = kampusById[id];
  shell(k?.jenis === "PTLN" ? "luar" : "indonesia");
  if (!k) return notFound();
  const rows = sortRows(ROWS_ALL.filter(r => r.k === k), "nama").sort((a, b) => a.nama.localeCompare(b.nama));
  const dtTotal = rows.reduce((a, r) => a + (r.tampung || 0), 0);
  const pmTotal = rows.reduce((a, r) => a + (r.peminat || 0), 0);
  const pr = k.profil;
  $("#main").innerHTML = `${backBtn(k.jenis === "PTLN" ? `← Kuliah di ${esc(k.prov)}` : "← Daftar kampus", k.jenis === "PTLN" ? negaraLink(k.prov) : "#/kampus")}
  <section class="panel">
    <div><div class="label">${JENIS_LABEL[k.jenis]}${k.ptnbh ? " · PTN-BH" : ""} · ${esc(k.kota ? k.kota + ", " : "")}${esc(k.prov)}</div><h2>${esc(k.nama)}</h2></div>
    <div class="kstats">
      <div><b class="mono">${rows.length}</b><span>Prodi</span></div>
      ${dtTotal ? `<div><b class="mono">${dtTotal.toLocaleString("id-ID")}</b><span>Kursi SNBT 2026</span></div>` : ""}
      ${pmTotal ? `<div><b class="mono">${pmTotal.toLocaleString("id-ID")}</b><span>Peminat SNBT 2025</span></div>` : ""}
      ${dtTotal && pmTotal ? `<div><b class="mono">${rasio(rows.reduce((a, r) => a + (r.riwayat?.[4]?.[0] || 0), 0) / pmTotal)}</b><span>Keketatan rata-rata</span></div>` : ""}
    </div>
    ${pr ? `<div class="box"><div class="label">Profil kampus</div>
      <div class="pills">${pr.akreditasi ? `<span class="pill ok">Akreditasi ${esc(pr.akreditasi)}</span>` : ""}${pr.berdiri ? `<span class="pill">Berdiri ${esc(pr.berdiri)}</span>` : ""}${pr.mahasiswa ? `<span class="pill">${esc(pr.mahasiswa)} mahasiswa</span>` : ""}</div>
      ${pr.ringkas ? `<p>${esc(pr.ringkas)}</p>` : ""}${pr.sumber ? `<p class="hint">Sumber: ${esc(pr.sumber)}</p>` : ""}</div>` : ""}
    <p class="hint">${k.web ? `Situs resmi: <a href="https://${esc(k.web)}" target="_blank" rel="noopener">${esc(k.web)}</a>` : ""}${k.pmb ? ` · Laman penerimaan: <a href="${esc(k.pmb)}" target="_blank" rel="noopener">${esc(k.pmb.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</p>
    ${k.snpmb ? '<p class="hint">Daftar prodi di bawah adalah daftar resmi SNBT 2026 dari SNPMB.</p>' : k.jenis !== "PTLN" ? '<p class="hint">Daftar prodi kampus ini masih perkiraan dan perlu dicek ke situs resminya.</p>' : ""}
    ${dinasBox(k.dinas)}
    ${k.jenis === "PTLN" ? negaraBox(negaraByName[k.prov], true) : ""}
    <div id="kd-out"></div>
    ${FOOT()}
  </section>`;
  bindBack();
  if (!rows.length) $("#kd-out").innerHTML = '<div class="empty">Daftar prodi kampus ini belum diisi.</div>';
  else pagedList($("#kd-out"), rows, (r, i) => rowItem(r, i, "prodi"), openModal, 100);
}

/* ---------------- Asesmen Minat RIASEC (teori Holland) ---------------- */
// Urutan heksagon Holland: tipe yang bersebelahan paling mirip, yang berseberangan paling berbeda.
const HEKS = ["R", "I", "A", "S", "E", "C"];
const SKALA = { minat: ["Sangat tidak suka", "Tidak suka", "Netral", "Suka", "Sangat suka"], kemampuan: ["Sangat tidak sesuai", "Tidak sesuai", "Ragu-ragu", "Sesuai", "Sangat sesuai"] };
const PER_HAL = 8;
const tipeOf = k => RIASEC.tipe.find(t => t.kode === k);

// Soal minat ditampilkan berselang-seling antartipe agar siswa tidak menebak pola; bagian kemampuan di akhir.
function urutanSoal() {
  const idx = RIASEC.soal.map((s, i) => ({ ...s, i }));
  const selang = b => {
    const per = HEKS.map(k => idx.filter(s => s.k === k && s.b === b));
    const out = [];
    for (let n = 0; per.some(a => a[n]); n++) per.forEach(a => a[n] && out.push(a[n]));
    return out;
  };
  const minat = selang("minat"), kemampuan = selang("kemampuan");
  const hal = [];
  for (let i = 0; i < minat.length; i += PER_HAL) hal.push(minat.slice(i, i + PER_HAL));
  if (kemampuan.length) hal.push(kemampuan);
  return hal;
}

// Skor 0–100 per tipe: rata-rata jawaban 1–5 diubah ke persen. Total = 70% minat + 30% kemampuan.
function hitungRiasec(jawab) {
  const skor = {};
  HEKS.forEach(k => {
    const rata = b => {
      const v = RIASEC.soal.map((s, i) => s.k === k && s.b === b ? jawab[i] : null).filter(x => x != null);
      return v.length ? (v.reduce((a, b) => a + b, 0) / v.length - 1) / 4 * 100 : null;
    };
    const m = rata("minat"), a = rata("kemampuan");
    skor[k] = { minat: m ?? 0, kemampuan: a ?? m ?? 0, total: a == null ? m ?? 0 : m * 0.7 + a * 0.3 };
  });
  const urut = [...HEKS].sort((a, b) => skor[b].total - skor[a].total || skor[b].minat - skor[a].minat);
  const kode = urut.slice(0, 3).join("");
  const jarak = (a, b) => { const d = Math.abs(HEKS.indexOf(a) - HEKS.indexOf(b)); return Math.min(d, 6 - d); };
  const konsistensi = ["", "tinggi", "sedang", "rendah"][jarak(urut[0], urut[1])];
  const beda = skor[urut[0]].total - skor[urut[5]].total;
  const diferensiasi = beda >= 40 ? "tinggi" : beda >= 20 ? "sedang" : "rendah";
  // Rekomendasi prodi: jatah 6-4-2 untuk tiga tipe teratas agar setiap tipe terwakili.
  // Prodi yang masuk daftar dua tipe atau lebih ("paduan") didahulukan; sisanya mengikuti urutan di riasec.csv.
  const top3 = urut.slice(0, 3).map(tipeOf);
  const tipeProdi = id => top3.filter(t => t.prodi.includes(id)).map(t => t.kode);
  const dipilih = new Map();
  [6, 4, 2].forEach((jatah, i) => {
    const calon = top3[i].prodi.filter(id => prodiById[id] && !dipilih.has(id));
    calon.sort((a, b) => tipeProdi(b).length - tipeProdi(a).length);
    calon.slice(0, jatah).forEach(id => dipilih.set(id, tipeProdi(id)));
  });
  const prodi = [...dipilih].map(([id, kode]) => ({ p: prodiById[id], kode }));
  // Mapel pilihan: gabungan saran tipe dan mapel pendukung dari prodi rekomendasi.
  const mp = {};
  urut.slice(0, 3).forEach((k, i) => tipeOf(k).mapel.forEach(m => (mp[m] ||= { m, s: 0, n: 0 }).s += 3 - i));
  prodi.forEach(({ p }) => p.mapel.forEach(m => { (mp[m] ||= { m, s: 0, n: 0 }).s += 1; mp[m].n++; }));
  const mapel = Object.values(mp).sort((a, b) => b.s - a.s).slice(0, 5);
  return { skor, urut, kode, konsistensi, diferensiasi, beda, prodi, mapel };
}

function heksagonSVG(skor) {
  const c = 160, R = 108;
  const titik = (i, r) => { const a = (-90 + i * 60) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const poli = f => HEKS.map((k, i) => titik(i, R * f(k) / 100).map(v => v.toFixed(1)).join(",")).join(" ");
  const grid = [25, 50, 75, 100].map(p => `<polygon points="${HEKS.map((_, i) => titik(i, R * p / 100).join(",")).join(" ")}" class="hx-grid"/>`).join("");
  const sumbu = HEKS.map((_, i) => { const [x, y] = titik(i, R); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="hx-grid"/>`; }).join("");
  const label = HEKS.map((k, i) => {
    const t = tipeOf(k); const [x, y] = titik(i, R + 30);
    return `<text x="${x}" y="${y - 4}" text-anchor="middle" class="hx-k" fill="${t.warna}">${k} · ${Math.round(skor[k].total)}</text><text x="${x}" y="${y + 11}" text-anchor="middle" class="hx-n">${esc(t.julukan)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 320 320" class="hx" role="img" aria-label="Heksagon RIASEC: ${HEKS.map(k => `${k} ${Math.round(skor[k].total)}`).join(", ")}">
    ${grid}${sumbu}
    <polygon points="${poli(k => skor[k].minat)}" class="hx-minat"/>
    <polygon points="${poli(k => skor[k].kemampuan)}" class="hx-mampu"/>
    ${label}</svg>`;
}

const RIASEC_KEY = "mp_riasec", RIASEC_DRAFT = "mp_riasec_draft";
function viewAsesmen(bagian) {
  shell("asesmen");
  if (!RIASEC.soal.length) { $("#main").innerHTML = '<section class="panel"><div class="empty">Soal asesmen belum tersedia.</div></section>'; return; }
  const hasil = store.get(RIASEC_KEY);
  if (bagian === "hasil" && hasil) return viewHasilRiasec(hasil);
  if (bagian === "tes") return viewTesRiasec();
  const d = store.get(RIASEC_DRAFT);
  const kirim = !!META.sekolah.asesmen_url;
  $("#main").innerHTML = `<section class="panel asesmen">
    <div class="as-intro">
      <div><div class="label">Teori Holland · RIASEC</div><h2>Asesmen Minat & Bakat</h2>
      <p class="hint">Kenali tipe minatmu dari enam tipe kepribadian kerja Holland: <b>R</b>ealistic, <b>I</b>nvestigative, <b>A</b>rtistic, <b>S</b>ocial, <b>E</b>nterprising, dan <b>C</b>onventional. Hasilnya berupa kode Holland, saran mapel pilihan, rekomendasi prodi, dan peta karier.</p></div>
      <div class="as-chips">${HEKS.map(k => { const t = tipeOf(k); return `<span style="--c:${t.warna}"><b>${k}</b>${esc(t.julukan)}</span>`; }).join("")}</div>
    </div>
    <div class="cols">
      <div class="box"><div class="label">Cara mengerjakan</div><ul><li>${RIASEC.soal.length} pernyataan, sekitar 10 menit.</li><li>Tidak ada jawaban benar atau salah.</li><li>Jawab sesuai dirimu sekarang, bukan harapan orang lain.</li></ul></div>
      <div class="box"><div class="label">Yang kamu dapatkan</div><ul><li>Kode Holland dan grafik heksagon</li><li>Saran mapel pilihan Kelas XI–XII</li><li>Rekomendasi prodi dan karier</li><li>Peta rencana dari kelas X sampai kuliah</li></ul></div>
    </div>
    ${hasil ? `<div class="as-last"><span>Hasil terakhirmu: <b class="mono">${esc(hasil.kode)}</b> · ${new Date(hasil.waktu).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span><button class="btn ghost" data-go="#/asesmen/hasil">Lihat hasil</button></div>` : ""}
    <form id="as-f" class="as-form">
      <label>Nama lengkap<input class="search" id="as-nama" required maxlength="80" autocomplete="name" value="${esc(d?.nama || hasil?.nama || "")}"></label>
      <label>Kelas<input class="search" id="as-kelas" required maxlength="30" placeholder="Contoh: X-2 atau XI IPA 1" value="${esc(d?.kelas || hasil?.kelas || "")}"></label>
      ${kirim ? '<label class="as-cek"><input type="checkbox" id="as-izin" required> Saya setuju nama, kelas, jawaban, dan hasil asesmen ini disimpan oleh sekolah untuk keperluan bimbingan.</label>' : ""}
      <button class="btn" type="submit">${d && Object.keys(d.jawab || {}).length ? "Lanjutkan asesmen" : hasil ? "Ulangi asesmen" : "Mulai asesmen"}</button>
    </form>
    <p class="foot">Asesmen ini disusun berdasarkan teori minat karier John L. Holland (RIASEC) dengan butir pernyataan orisinal. Hasilnya adalah gambaran minat untuk bahan diskusi dengan orang tua dan sekolah, bukan diagnosis psikologis dan bukan satu-satunya dasar memilih jurusan.</p>
  </section>`;
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $("#as-f").onsubmit = e => {
    e.preventDefault();
    const nama = $("#as-nama").value.trim().replace(/\s+/g, " "), kelas = $("#as-kelas").value.trim().replace(/\s+/g, " ");
    if (!nama || !kelas) return;
    const lama = store.get(RIASEC_DRAFT);
    store.set(RIASEC_DRAFT, { nama, kelas, izin: !!$("#as-izin")?.checked, jawab: lama?.jawab || {}, hal: lama?.hal || 0 });
    go("#/asesmen/tes");
  };
}

function viewTesRiasec() {
  const d = store.get(RIASEC_DRAFT);
  if (!d) return go("#/asesmen");
  const hal = urutanSoal();
  d.hal = Math.min(d.hal || 0, hal.length - 1);
  const s = hal[d.hal];
  const b = s[0].b;
  const total = RIASEC.soal.length, terjawab = Object.keys(d.jawab).length;
  $("#main").innerHTML = `<section class="panel asesmen">
    <div class="as-prog"><div class="label">Bagian ${d.hal + 1} dari ${hal.length} · ${b === "minat" ? "Seberapa suka kamu melakukan kegiatan ini?" : "Seberapa sesuai pernyataan ini dengan dirimu?"}</div>
      <div class="as-bar"><i style="width:${terjawab / total * 100}%"></i></div></div>
    <div class="as-list">${s.map((q, n) => `<fieldset class="as-q"><legend><span class="mono">${d.hal * PER_HAL + n + 1}.</span> ${esc(q.t)}</legend>
      <div class="as-opt">${SKALA[b].map((l, v) => `<label title="${l}"><input type="radio" name="q${q.i}" value="${v + 1}" ${d.jawab[q.i] === v + 1 ? "checked" : ""}><span>${v + 1}</span><small>${l}</small></label>`).join("")}</div></fieldset>`).join("")}</div>
    <div class="row as-nav">
      <button class="btn ghost" id="as-prev">${d.hal ? "← Sebelumnya" : "← Ubah data diri"}</button>
      <span class="hint" id="as-sisa"></span>
      <button class="btn" id="as-next">${d.hal === hal.length - 1 ? "Lihat hasil" : "Lanjut →"}</button>
    </div>
  </section>`;
  const cek = () => {
    const kurang = s.filter(q => !d.jawab[q.i]).length;
    $("#as-next").disabled = kurang > 0;
    $("#as-sisa").textContent = kurang ? `${kurang} pernyataan belum dijawab` : "";
  };
  $$(".as-q input").forEach(el => el.onchange = () => {
    d.jawab[el.name.slice(1)] = +el.value; store.set(RIASEC_DRAFT, d); cek();
    $(".as-bar i").style.width = `${Object.keys(d.jawab).length / total * 100}%`;
  });
  $("#as-prev").onclick = () => { if (!d.hal) return go("#/asesmen"); d.hal--; store.set(RIASEC_DRAFT, d); viewTesRiasec(); window.scrollTo(0, 0); };
  $("#as-next").onclick = () => {
    if (d.hal < hal.length - 1) { d.hal++; store.set(RIASEC_DRAFT, d); viewTesRiasec(); window.scrollTo(0, 0); return; }
    const jawab = RIASEC.soal.map((_, i) => d.jawab[i] ?? null);
    const h = hitungRiasec(jawab);
    const rekam = { nama: d.nama, kelas: d.kelas, izin: d.izin, waktu: new Date().toISOString(), jawab, kode: h.kode, terkirim: false };
    store.set(RIASEC_KEY, rekam); store.set(RIASEC_DRAFT, null);
    go("#/asesmen/hasil");
  };
  cek();
}

// Kirim ke Google Apps Script milik sekolah. Mode no-cors: browser tidak bisa membaca balasan, jadi status "terkirim" berarti permintaan sudah berangkat.
async function kirimRiasec(rekam, h) {
  const url = META.sekolah.asesmen_url;
  if (!url || !rekam.izin) return null;
  const pct = f => Object.fromEntries(HEKS.map(k => [k, Math.round(f(h.skor[k]))]));
  const jawaban = b => Object.fromEntries(HEKS.map(k => [k, RIASEC.soal.map((s, i) => s.k === k && s.b === b ? rekam.jawab[i] ?? 0 : null).filter(v => v != null).join("")]));
  const body = {
    versi: 1, waktu: rekam.waktu, nama: rekam.nama, kelas: rekam.kelas, kode: h.kode,
    minat: pct(s => s.minat), kemampuan: pct(s => s.kemampuan), total: pct(s => s.total),
    konsistensi: h.konsistensi, diferensiasi: h.diferensiasi,
    prodi: h.prodi.slice(0, 5).map(x => x.p.nama), mapel: h.mapel.map(x => x.m),
    jawaban: { minat: jawaban("minat"), kemampuan: jawaban("kemampuan") }
  };
  await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return true;
}

function viewHasilRiasec(rekam) {
  const h = hitungRiasec(rekam.jawab);
  const [t1, t2, t3] = h.urut.slice(0, 3).map(tipeOf);
  const KONS = { tinggi: "Dua tipe teratasmu bersebelahan di heksagon Holland. Minatmu searah, sehingga pilihan jurusan biasanya lebih mudah ditentukan.", sedang: "Dua tipe teratasmu berjarak satu tipe. Minatmu cukup searah dan tetap bisa dipadukan dalam banyak jurusan.", rendah: "Dua tipe teratasmu berseberangan di heksagon. Kamu punya minat yang beragam. Cari prodi atau karier yang memadukan keduanya, dan diskusikan dengan sekolah." };
  const DIF = { tinggi: "Profil minatmu jelas: ada tipe yang menonjol dan ada yang rendah.", sedang: "Profil minatmu cukup jelas.", rendah: "Skormu hampir rata di semua tipe. Ini wajar di usia SMA. Perbanyak pengalaman lewat ekskul dan kegiatan, lalu ulangi asesmen beberapa bulan lagi." };
  const karier = [...new Set([t1, t2, t3].flatMap(t => t.karier.slice(0, 3)))];
  $("#main").innerHTML = `<section class="panel asesmen as-hasil">
    <div class="as-head">
      <div><div class="label">Hasil asesmen · ${esc(rekam.nama)} · ${esc(rekam.kelas)}</div>
        <h2>Kode Holland-mu</h2>
        <div class="as-kode">${[t1, t2, t3].map((t, i) => `<span style="--c:${t.warna}" class="${i ? "" : "utama"}"><b>${t.kode}</b><small>${esc(t.julukan)}</small></span>`).join("")}</div>
        <p>${esc(t1.deskripsi)}</p>
        <div class="pills">${t1.ciri.map(c => `<span class="pill">${esc(c)}</span>`).join("")}</div>
      </div>
      <figure class="as-hx">${heksagonSVG(h.skor)}<figcaption><span class="lg minat"></span>Minat <span class="lg mampu"></span>Kemampuan yang dirasakan · angka = skor total</figcaption></figure>
    </div>
    <div class="as-skor">${h.urut.map(k => { const t = tipeOf(k); const s = h.skor[k]; return `<div style="--c:${t.warna}"><span><b>${k}</b> ${esc(t.nama)} <small>${esc(t.julukan)}</small></span><span class="mono">${Math.round(s.total)}</span><i><em style="width:${s.total}%"></em></i></div>`; }).join("")}</div>
    <div class="cols">
      <div class="box"><div class="label">Konsistensi minat: ${h.konsistensi}</div><p>${KONS[h.konsistensi]}</p></div>
      <div class="box"><div class="label">Kejelasan profil: ${h.diferensiasi}</div><p>${DIF[h.diferensiasi]}</p></div>
    </div>
    <div class="box"><div class="label">Saran mapel pilihan Kelas XI–XII</div>
      <div class="as-mapel">${h.mapel.map((m, i) => `<div><b>${i + 1}. ${esc(m.m)}</b><small>${m.n ? `Mendukung ${m.n} dari ${h.prodi.length} prodi rekomendasimu` : "Sesuai tipe minatmu"}</small></div>`).join("")}</div>
      <p class="hint">Sesuaikan dengan mapel pilihan yang dibuka di sekolah dan nilai rapormu. Cek juga <a href="#/mapel">Cek Jurusan Sesuai Mapel</a>.</p></div>
    <div class="box"><div class="label">Rekomendasi prodi</div>
      <div class="list" id="as-prodi">${h.prodi.map(({ p, kode }, i) => `<button class="item" data-i="${i}"><div class="t"><b>${esc(p.nama)}</b><span>${esc(p.rumpun)} · ${p._kampus} kampus · Mapel: ${esc(p.mapel.join(", "))}</span></div><span class="tag">${kode.length > 1 ? `Paduan ${kode.join("+")}` : `Tipe ${kode[0]}`}</span></button>`).join("")}</div>
      <p class="hint">Label <b>Paduan</b> berarti prodi ini cocok untuk lebih dari satu tipe minatmu. Klik prodi untuk melihat kampus dan keketatannya.</p></div>
    <div class="box"><div class="label">Peta karier dan rencana</div>
      <ol class="as-peta">
        <li><b>Kelas X · Eksplorasi</b><span>${esc([...t1.kegiatan.slice(0, 2), ...t2.kegiatan.slice(0, 1)].join("; "))}</span></li>
        <li><b>Kelas XI · Mapel pilihan</b><span>${esc(h.mapel.slice(0, 4).map(m => m.m).join(", "))}</span></li>
        <li><b>Kelas XII · Seleksi</b><span>Pilih 3–4 prodi dari rekomendasi, cek keketatannya di Cari Prodi, dan ikuti <a href="#/linimasa">Jadwal Penting</a> SNBP dan SNBT.</span></li>
        <li><b>Kuliah</b><span>${esc(h.prodi.slice(0, 3).map(x => x.p.nama).join(", "))}</span></li>
        <li><b>Karier</b><span>${esc(karier.join(", "))}</span></li>
      </ol></div>
    <p class="hint" id="as-kirim"></p>
    <div class="row no-print">
      <button class="btn" id="as-print">Cetak / simpan PDF</button>
      <button class="btn ghost" data-go="#/asesmen">Ulangi asesmen</button>
    </div>
    <p class="foot">Kode Holland disusun dari tiga tipe dengan skor total tertinggi (70% minat, 30% kemampuan yang dirasakan). Hasil ini gambaran minat, bukan diagnosis. Diskusikan dengan orang tua dan sekolah sebelum memutuskan.</p>
  </section>`;
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $$("#as-prodi .item").forEach(b => b.onclick = () => go(`#/prodi/${h.prodi[+b.dataset.i].p.id}`));
  $("#as-print").onclick = () => window.print();
  const status = $("#as-kirim");
  const kirim = async () => {
    status.textContent = "Mengirim hasil ke spreadsheet sekolah…";
    try { if (await kirimRiasec(rekam, h)) { rekam.terkirim = true; store.set(RIASEC_KEY, rekam); status.textContent = "✓ Hasil sudah dikirim ke spreadsheet sekolah."; } else status.textContent = ""; }
    catch { status.innerHTML = 'Hasil belum terkirim karena koneksi bermasalah. <button class="linkbtn" id="as-ulang">Coba kirim lagi</button>'; $("#as-ulang").onclick = kirim; }
  };
  if (rekam.terkirim) status.textContent = "✓ Hasil sudah dikirim ke spreadsheet sekolah.";
  else if (META.sekolah.asesmen_url && rekam.izin) kirim();
}

/* ---------------- Cek Jurusan (mapel favorit) ---------------- */
// Cocokkan nama jurusan dengan katalog prodi; keterangan dalam kurung diabaikan.
const prodiDariNama = j => {
  const n = norm(j.replace(/\s*\(.*?\)/g, "").trim());
  return PRODI.find(p => norm(p.nama) === n) || PRODI.find(p => norm(p.nama) === `ilmu ${n}`) || null;
};
function viewMapel() {
  shell("home");
  const s = q.mapel ||= { pilih: [] };
  $("#main").innerHTML = `<section class="panel">
    <h2>Cek Jurusan Sesuai Mapel Favoritmu</h2>
    <p class="hint">Pilih satu atau beberapa mata pelajaran rapor yang paling kamu kuasai. Jurusan yang linear dengan lebih banyak mapel pilihanmu tampil paling atas.</p>
    <div class="chips" id="m-chips">${MAPEL.map((m, i) => `<button class="chip" data-m="${i}">${esc(m.mapel)}</button>`).join("")}</div>
    <div id="m-out"></div>
    <p class="foot">Daftar ini panduan awal, bukan syarat resmi. Cek mapel pendukung tiap prodi di halaman prodinya dan diskusikan pilihanmu dengan orang tua dan sekolah.</p>
  </section>`;
  bindNav();
  const draw = () => {
    $$("#m-chips .chip").forEach(c => c.setAttribute("aria-pressed", s.pilih.includes(+c.dataset.m)));
    const out = $("#m-out");
    if (!s.pilih.length) { out.innerHTML = '<div class="empty">Pilih minimal satu mapel favoritmu untuk melihat jurusan yang linear.</div>'; return; }
    const skor = new Map();
    s.pilih.forEach(i => MAPEL[i].jurusan.forEach(j => { const e = skor.get(j) || { j, dari: [] }; e.dari.push(MAPEL[i].mapel); skor.set(j, e); }));
    const hasil = [...skor.values()].sort((a, b) => b.dari.length - a.dari.length || a.j.localeCompare(b.j, "id"));
    hasil.forEach(e => e.p = prodiDariNama(e.j));
    out.innerHTML = `<p class="label" style="margin:12px 0 8px">${hasil.length} jurusan linear</p><div class="list" id="m-list"></div>`;
    $("#m-list").innerHTML = hasil.map((e, i) => `<button class="item" data-i="${i}"><div class="t"><b>${esc(e.j)}</b><span>${e.dari.map(esc).join(" · ")}${e.p?._kampus ? ` · ${e.p._kampus} kampus` : ""}</span></div>${s.pilih.length > 1 ? `<span class="tag">${e.dari.length} mapel</span>` : ""}</button>`).join("");
    $$("#m-list .item").forEach(b => b.onclick = () => {
      const e = hasil[+b.dataset.i];
      if (e.p) return go(`#/prodi/${e.p.id}`);
      q.cari = { ...(q.cari || { jenjang: "", jenis: "", urut: "ketat" }), text: e.j.replace(/\s*\(.*?\)/g, "").replace(/^Jurusan lain di rumpun /, "") };
      go("#/cari");
    });
  };
  $$("#m-chips .chip").forEach(c => c.onclick = () => {
    const i = +c.dataset.m;
    s.pilih = s.pilih.includes(i) ? s.pilih.filter(x => x !== i) : [...s.pilih, i];
    draw();
  });
  draw();
}

/* ---------------- Bahas Prodi ---------------- */
function viewBahas() {
  shell("indonesia");
  const s = q.bahas ||= { text: "", rumpun: "", rek: false };
  $("#main").innerHTML = `${subnav("bahas")}
  <section class="panel">
    <h2>Bahas Prodi</h2>
    <p class="hint">Pilih prodi untuk membaca penjelasannya. Tanda <span class="star">★</span> berarti rekomendasi sekolah ${esc(META.sekolah.nama)}.</p>
    <input class="search" id="b-q" placeholder="Cari nama prodi, misalnya Arsitektur" value="${esc(s.text)}" autocomplete="off">
    <div class="chips" id="b-chips">
      <button class="chip" data-r="">Semua</button>
      <button class="chip" data-rek="1">★ Rekomendasi</button>
      ${META.sekolah.rumpun.map(r => `<button class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join("")}
    </div>
    <div id="b-out"></div>
  </section>`;
  bindNav();
  const chips = () => $$("#b-chips .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.rek ? s.rek : !s.rek && c.dataset.r === s.rumpun));
  const draw = () => {
    const out = $("#b-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    const ps = PRODI.filter(p => (!t || p._n.includes(t)) && (!s.rumpun || p.rumpun === s.rumpun) && (!s.rek || p.rek));
    out.insertAdjacentHTML("beforeend", `<p class="label" style="margin:0 0 8px">${ps.length} prodi</p>`);
    if (!ps.length) { out.insertAdjacentHTML("beforeend", '<div class="empty">Prodi tidak ditemukan.</div>'); return; }
    pagedList(out, ps, (p, i) => `<button class="item" data-i="${i}"><div class="t"><b>${p.rek ? '<span class="star">★</span> ' : ""}${esc(p.nama)}</b><span>${p.jenjang.join(" / ")} · ${p._kampus} kampus</span></div><span class="tag">${esc(p.rumpun)}</span></button>`, p => go(`#/prodi/${p.id}`), 80);
  };
  chips();
  $("#b-q").oninput = e => { s.text = e.target.value; draw(); };
  $$("[data-r]").forEach(c => c.onclick = () => { s.rumpun = c.dataset.r; s.rek = false; chips(); draw(); });
  $("[data-rek]").onclick = () => { s.rek = !s.rek; s.rumpun = ""; chips(); draw(); };
  draw();
}
function viewProdi(id) {
  shell("indonesia");
  const p = prodiById[id];
  if (!p) return notFound();
  const rows = sortRows(ROWS.filter(r => r.p === p), "ketat");
  const list = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const [lbl, h] = asalProdi();
  $("#main").innerHTML = `${backBtn(lbl, h)}
  <article class="panel detail">
    <div><div class="label">${esc(p.rumpun)} · ${p.jenjang.join(" / ")}${p.rek ? ' · <span class="star">★ Rekomendasi sekolah</span>' : ""}</div><h2>${esc(p.nama)}</h2></div>
    <div class="box"><div class="label">Tentang prodi ini</div><p>${esc(p.ringkas)}</p></div>
    <div class="cols">
      <div class="box"><div class="label">Contoh mata kuliah</div>${list(p.matkul)}</div>
      <div class="box"><div class="label">Prospek karier</div>${list(p.karier)}</div>
      <div class="box"><div class="label">Saran mapel pilihan (Kelas XI)</div>${list(p.mapel)}</div>
    </div>
    <div class="box"><div class="label">Tersedia di ${rows.length} kampus di Indonesia</div><div id="pd-out"></div></div>
    ${p._kampusLN ? `<div class="box"><div class="label">Di luar negeri</div><p>Prodi ini juga ada di ${p._kampusLN} kampus luar negeri.</p><div><button class="btn ghost" id="pd-ln">Lihat kampus luar negeri</button></div></div>` : ""}
    ${FOOT()}
  </article>`;
  bindBack();
  const ln = $("#pd-ln");
  if (ln) ln.onclick = () => { q.ln = { text: p.nama, negara: "" }; go("#/luar-negeri"); };
  if (!rows.length) $("#pd-out").innerHTML = '<div class="empty">Belum ada kampus di Indonesia yang tercatat untuk prodi ini.</div>';
  else pagedList($("#pd-out"), rows, (r, i) => rowItem(r, i, "kampus"), openModal, 40);
}

/* ---------------- Linimasa seleksi ---------------- */
const JALUR_WARNA = { TKA: "#4f46e5", SNBP: "#2563eb", SNBT: "#0891b2", Kedinasan: "#d97706", Mandiri: "#16a34a" };
const JALUR_NAMA = { TKA: "Tes Kemampuan Akademik", SNBP: "Seleksi Nasional Berdasarkan Prestasi", SNBT: "Seleksi Nasional Berdasarkan Tes", Kedinasan: "Sekolah Kedinasan", Mandiri: "Seleksi Mandiri PTN" };
const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const tgl = s => new Date(s + "T00:00:00");
const hariIni = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const selisihHari = (a, b) => Math.round((a - b) / 86400000);
function statusAgenda(e, today = hariIni()) {
  const m = tgl(e.mulai), z = tgl(e.selesai);
  if (z < today) return { kode: "selesai", teks: "Selesai" };
  if (m <= today) return { kode: "jalan", teks: "Sedang berlangsung" };
  return { kode: "nanti", teks: `${selisihHari(m, today)} hari lagi` };
}
function agendaCard() {
  if (!LINIMASA.length) return "";
  const today = hariIni();
  const e = LINIMASA.find(x => tgl(x.selesai) >= today);
  if (!e) return "";
  const st = statusAgenda(e, today);
  const n = selisihHari(tgl(e.mulai), today);
  return `<button class="agenda" data-go="#/linimasa" style="--c:${JALUR_WARNA[e.jalur] || "var(--primary)"}">
    <span class="agenda-num">${st.kode === "jalan" ? "Kini" : `<b class="mono">${n}</b><small>hari</small>`}</span>
    <span class="agenda-body"><span class="label">Agenda terdekat · ${esc(e.jalur)}</span><b>${esc(e.kegiatan)}</b><span class="hint">${esc(e.waktu)}</span></span>
    <span class="agenda-go" aria-hidden="true">Lihat linimasa →</span>
  </button>`;
}
function viewLinimasa() {
  shell("jadwal");
  const today = hariIni();
  const items = LINIMASA;
  if (!items.length) { $("#main").innerHTML = `${backBtn()}<section class="panel"><div class="empty">Linimasa belum diisi.</div></section>`; bindBack(); return; }
  // Rentang bulan untuk peta jalur
  const d0 = tgl(items.reduce((a, e) => e.mulai < a ? e.mulai : a, items[0].mulai));
  const d1 = tgl(items.reduce((a, e) => e.selesai > a ? e.selesai : a, items[0].selesai));
  const idx = d => (d.getFullYear() - d0.getFullYear()) * 12 + d.getMonth() - d0.getMonth();
  const nBulan = idx(d1) + 1;
  const bulanList = Array.from({ length: nBulan }, (_, i) => { const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1); return d; });
  const lanes = [...new Set(items.map(e => e.jalur))];
  const nomor = new Map(items.map((e, i) => [e, i + 1]));
  // Posisi penanda "hari ini" (persen dari lebar peta), bila berada dalam rentang
  const awal = new Date(d0.getFullYear(), d0.getMonth(), 1), akhir = new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
  const posHariIni = today >= awal && today < akhir ? (today - awal) / (akhir - awal) * 100 : null;
  const next = items.find(e => tgl(e.selesai) >= today);
  const nNext = next ? selisihHari(tgl(next.mulai), today) : null;
  const tahun = d0.getFullYear();

  // Kelompokkan kartu per bulan mulai
  const groups = [];
  for (const e of items) {
    const d = tgl(e.mulai), key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups.find(x => x.key === key);
    if (!g) groups.push(g = { key, judul: `${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`, items: [] });
    g.items.push(e);
  }

  $("#main").innerHTML = `
  <section class="hero"><span class="badge">Jadwal Penting · Kelas XII ${tahun}/${tahun + 1}</span>
    <h1>Timeline TKA & <span class="grad-text">Seleksi PTN Kelas XII</span></h1>
    <p>Semua jadwal penting dari TKA sampai pengumuman seleksi mandiri dalam satu halaman. Tanggal pasti mengikuti pengumuman resmi panitia; pantau terus informasi dari sekolah.</p>
  </section>

  <div class="tl-summary">
    <div class="tl-count">
      ${next ? (nNext > 0 ? `<b class="mono">${nNext}</b><span>hari menuju<br><strong>${esc(next.kegiatan)}</strong></span>` : `<b>Kini</b><span>sedang berlangsung<br><strong>${esc(next.kegiatan)}</strong></span>`) : `<b>✓</b><span>Semua agenda sudah selesai</span>`}
    </div>
    <div class="tl-legend">${lanes.map(l => `<span class="legend" style="--c:${JALUR_WARNA[l] || "#64748b"}"><i></i><b>${esc(l)}</b> ${esc(JALUR_NAMA[l] || "")}</span>`).join("")}</div>
  </div>

  <section class="panel tl-map-panel">
    <div class="tl-map-head"><h2>Peta Jalur</h2><span class="hint">Geser ke samping di HP</span></div>
    <div class="tl-scroll"><div class="tl-map" style="--n:${nBulan}">
      <div class="tl-row tl-months"><span></span><div class="tl-track">${bulanList.map(d => `<span class="${d.getMonth() === 0 ? "tl-year" : ""}">${BULAN[d.getMonth()]}${d.getMonth() === 0 || d === bulanList[0] ? `<small>${d.getFullYear()}</small>` : ""}</span>`).join("")}</div></div>
      ${lanes.map(l => `<div class="tl-row"><span class="tl-lane" style="--c:${JALUR_WARNA[l]}">${esc(l)}</span><div class="tl-track">
        ${items.filter(e => e.jalur === l).map(e => { const st = statusAgenda(e, today); return `<a class="tl-bar ${st.kode}" href="#ag-${nomor.get(e)}" style="--c:${JALUR_WARNA[l]};grid-column:${idx(tgl(e.mulai)) + 1} / ${idx(tgl(e.selesai)) + 2}" title="${esc(e.waktu)}: ${esc(e.kegiatan)}"><b>${nomor.get(e)}</b><span>${esc(e.singkat)}</span></a>`; }).join("")}
      </div></div>`).join("")}
      ${posHariIni != null ? `<div class="tl-today" style="--x:${posHariIni}%"><span>Hari ini</span></div>` : ""}
    </div></div>
  </section>

  <section class="tl-list">
    ${groups.map(g => `<div class="tl-month"><h3 class="tl-month-title">${g.judul}</h3>
      ${g.items.map(e => { const st = statusAgenda(e, today); const c = JALUR_WARNA[e.jalur] || "#64748b"; return `
        <article class="tl-item ${st.kode}" id="ag-${nomor.get(e)}" style="--c:${c}">
          <span class="tl-dot">${nomor.get(e)}</span>
          <div class="tl-card">
            <div class="tl-card-top"><span class="tl-when">${esc(e.waktu)}</span><span class="tl-chip">${esc(e.jalur)}</span><span class="tl-status ${st.kode}">${st.teks}</span></div>
            <h4>${esc(e.kegiatan)}</h4>
            ${e.tips ? `<p>${esc(e.tips)}</p>` : ""}
          </div>
        </article>`; }).join("")}
    </div>`).join("")}
  </section>
  <p class="foot">Jadwal bersifat perkiraan berdasarkan pola tahun sebelumnya. Selalu cocokkan dengan pengumuman resmi SNPMB, panitia TKA, SSCASN, dan masing-masing PTN.</p>`;
  bindBack();
  $$(".tl-bar").forEach(a => a.onclick = e => { e.preventDefault(); const t = document.querySelector(a.getAttribute("href")); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(() => t.classList.remove("flash"), 1400); } });
}

/* ---------------- Kuliah ke Luar Negeri ---------------- */
function negaraBox(n, ringkas = false) {
  if (!n) return "";
  return `<div class="box ${n.catatan.startsWith("PERHATIAN") ? "box-warn" : ""}">
    <div class="label">Info kuliah di ${esc(n.nama)}</div>
    <p><b>Bahasa kuliah:</b> ${esc(n.bahasa)}</p>
    <p><b>Tes & syarat:</b> ${esc(n.tes)}</p>
    <p><b>Beasiswa:</b> ${esc(n.beasiswa)}</p>
    <p><b>Jalur daftar:</b> ${esc(n.jalur)}</p>
    ${n.catatan ? `<p class="${n.catatan.startsWith("PERHATIAN") ? "warn-text" : "hint"}">${esc(n.catatan)}</p>` : ""}
    ${ringkas ? `<p><a href="${negaraLink(n.nama)}">Lihat linimasa persiapan dan kampus lain di ${esc(n.nama)} →</a></p>` : ""}
  </div>`;
}
function viewLuarNegeri() {
  shell("luar");
  const s = q.ln ||= { text: "", negara: "" };
  const wil = [...new Set(NEGARA.map(n => n.wilayah))];
  $("#main").innerHTML = `
  <section class="hero"><span class="badge">Kampus Luar Negeri</span>
    <h1>Kampus Dunia, <span class="grad-text">Persiapan Sejak Kelas X</span></h1>
    <p>Pilih negara untuk melihat bahasa kuliah, tes yang diperlukan, beasiswa, linimasa persiapan, dan daftar kampusnya. Syarat dan kuota beasiswa berubah setiap tahun, jadi selalu cek situs resminya.</p>
  </section>
  <section class="panel" style="margin-bottom:24px">
    <h2>Cari Prodi di Luar Negeri</h2>
    <div class="row">
      <input class="search" id="ln-q" placeholder="Contoh: Kedokteran, Syariah, Teknik Informatika" value="${esc(s.text)}" autocomplete="off" style="flex:2 1 240px">
      <select class="search" id="ln-n" aria-label="Negara"><option value="">Semua negara</option>${NEGARA.map(n => `<option ${s.negara === n.nama ? "selected" : ""}>${esc(n.nama)}</option>`).join("")}</select>
    </div>
    <div id="ln-out"></div>
  </section>
  ${wil.map(w => `<section class="neg-group"><p class="label">${esc(w)}</p><div class="neg-grid">${NEGARA.filter(n => n.wilayah === w).map(n => {
      const jml = KAMPUS.filter(k => k.jenis === "PTLN" && k.prov === n.nama).length;
      return `<button class="neg-card" data-go="${negaraLink(n.nama)}"><span class="flag" aria-hidden="true">${BENDERA[n.nama] || "🌐"}</span><span><b>${esc(n.nama)}</b><small>${jml} kampus · ${esc(n.beasiswa.split(/[;(]/)[0].trim())}</small></span></button>`;
    }).join("")}</div></section>`).join("")}`;
  bindBack();
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const draw = () => {
    const out = $("#ln-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    if (t.length < 2 && !s.negara) { out.innerHTML = '<p class="hint">Ketik nama jurusan atau pilih negara untuk melihat kampusnya.</p>'; return; }
    const rows = ROWS_LN.filter(r => (t.length < 2 || r._n.includes(t)) && (!s.negara || r.k.prov === s.negara))
      .sort((a, b) => a.k.prov.localeCompare(b.k.prov) || a.k.nama.localeCompare(b.k.nama) || a.nama.localeCompare(b.nama));
    if (!rows.length) { out.innerHTML = '<div class="empty">Belum ada kampus luar negeri untuk pencarian ini.</div>'; return; }
    const nNeg = new Set(rows.map(r => r.k.prov)).size;
    out.insertAdjacentHTML("beforeend", `<div class="summary" style="margin-bottom:10px">Ditemukan <b>${rows.length}</b> pilihan di <b>${new Set(rows.map(r => r.k.id)).size}</b> kampus, <b>${nNeg}</b> negara.</div>`);
    pagedList(out, rows, (r, i) => rowItem(r, i, "kampus"), openModal, 40);
  };
  let timer;
  $("#ln-q").oninput = e => { s.text = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 150); };
  $("#ln-n").onchange = e => { s.negara = e.target.value; draw(); };
  draw();
}
function viewNegara(nama) {
  shell("luar");
  const n = negaraByName[nama];
  if (!n) return notFound();
  const ks = KAMPUS.filter(k => k.jenis === "PTLN" && k.prov === nama).sort((a, b) => a.nama.localeCompare(b.nama));
  $("#main").innerHTML = `${backBtn("← Kampus Luar Negeri", "#/luar-negeri")}
  <article class="panel detail">
    <div><div class="label">${esc(n.wilayah)}</div><h2>${BENDERA[n.nama] || ""} Kuliah di ${esc(n.nama)}</h2></div>
    ${negaraBox(n)}
    <div class="box"><div class="label">Linimasa persiapan</div>
      <ol class="steps">${n.persiapan.map(x => { const [h, ...rest] = x.split(":"); return `<li><div><b>${esc(h.trim())}</b><p>${esc(rest.join(":").trim())}</p></div></li>`; }).join("")}</ol>
    </div>
    <div class="box"><div class="label">${ks.length} kampus di ${esc(n.nama)}</div><div id="ng-out"></div></div>
    <p class="foot">Informasi bersifat umum. Biaya, kuota, tenggat, dan syarat beasiswa berubah setiap tahun; cek situs resmi kampus dan penyelenggara beasiswa.</p>
  </article>`;
  bindBack();
  pagedList($("#ng-out"), ks, (k, i) => `<button class="item" data-i="${i}"><div class="t"><b>${esc(k.nama)}</b><span>${esc(k.kota)} · ${k._prodi} prodi</span></div><span class="tag">${esc(k.singkat)}</span></button>`, k => go(`#/kampus/${k.id}`));
}

/* ---------------- Rencanaku ---------------- */
const planKey = r => `${r.k.id}|${norm(r.nama)}|${r.j}`;
const keyOf = x => `${x.k}|${norm(x.n || prodiById[x.p]?.nama || "")}|${x.j}`;
const inPlan = r => plan.some(x => keyOf(x) === planKey(r));
function togglePlan(r) {
  if (inPlan(r)) plan = plan.filter(x => keyOf(x) !== planKey(r));
  else plan.push({ k: r.k.id, p: r.p?.id || "", n: r.nama, j: r.j });
  store.set("mp_rencana", plan);
}
// Cari baris untuk item Rencanaku (mendukung data lama yang hanya menyimpan id katalog)
const findPlanRow = x => ROWS_ALL.find(r => planKey(r) === keyOf(x)) || ROWS_ALL.find(r => r.k.id === x.k && r.p?.id === x.p && r.j === x.j);
function viewRencana() {
  shell("rencana");
  const rows = plan.map(findPlanRow).filter(Boolean);
  $("#main").innerHTML = `
  <section class="hero"><span class="badge">Rencanaku</span><h1>Pilihan Prodi <span class="grad-text">& Kampusmu</span></h1>
  <p>Susun urutan pilihan dari yang paling kamu inginkan. Diskusikan daftar ini dengan orang tua dan sekolah. Daftar ini tersimpan di perangkat ini saja.</p></section>
  <section class="panel">
    ${rows.length ? `<div class="plan">${rows.map((r, i) => `
      <div class="plan-item">
        <div style="min-width:0"><b>${esc(r.nama)}</b> <span class="hint">(${r.j})</span><div class="hint">${esc(r.k.nama)} · ${JENIS_LABEL[r.k.jenis]}</div></div>
        <div class="acts">${scoreBadge(r)}
          <button class="icon-btn" data-up="${i}" aria-label="Naikkan" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-down="${i}" aria-label="Turunkan" ${i === rows.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-btn" data-del="${i}" aria-label="Hapus">✕</button>
        </div>
      </div>`).join("")}</div>
      <div class="row"><button class="btn ghost" id="copy">Salin daftar sebagai teks</button></div>
      <p class="hint" id="copied" role="status"></p>`
      : `<div class="empty">Belum ada pilihan. Buka <a href="#/cari">Cari Prodi</a>, ketuk sebuah kampus, lalu pilih <b>Tambah ke Rencanaku</b>.</div>`}
  </section>`;
  const move = (i, d) => { const [x] = plan.splice(i, 1); plan.splice(i + d, 0, x); store.set("mp_rencana", plan); viewRencana(); };
  $$("[data-up]").forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  $$("[data-down]").forEach(b => b.onclick = () => move(+b.dataset.down, 1));
  $$("[data-del]").forEach(b => b.onclick = () => { plan.splice(+b.dataset.del, 1); store.set("mp_rencana", plan); viewRencana(); });
  const c = $("#copy");
  if (c) c.onclick = async () => {
    const text = `Rencana Prodi — ${META.sekolah.nama}\n` + rows.map((r, i) => `${i + 1}. ${r.nama} (${r.j}) — ${r.k.nama}${r.kt ? ` — keketatan ${rasio(r.kt)}` : ""}${r.skor != null ? ` — skor aman ${r.skor}` : ""}`).join("\n");
    try { await navigator.clipboard.writeText(text); $("#copied").textContent = "Daftar disalin. Tempel di WhatsApp atau catatanmu."; }
    catch { $("#copied").textContent = "Browser menolak menyalin otomatis. Salin manual dari daftar di atas."; }
  };
}

/* ---------------- Modal detail ---------------- */
const rupiah = v => v == null ? "—" : "Rp" + Math.round(v).toLocaleString("id-ID");
// Grafik keketatan 2021–2025: tinggi batang = peminat per kursi; label bawah = jumlah kursi & peminat
function grafikRiwayat(riw) {
  if (!riw || !riw.some(x => x[0] && x[1])) return "";
  const th = [2021, 2022, 2023, 2024, 2025];
  const per = riw.map(([dt, pm]) => dt && pm ? pm / dt : null);
  const max = Math.max(...per.filter(Boolean));
  const W = 320, H = 150, top = 22, base = H - 34, gap = W / th.length, bw = 30;
  const bars = th.map((t, i) => {
    const x = i * gap + gap / 2, v = per[i], [dt, pm] = riw[i];
    if (!v) return `<text x="${x}" y="${base - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">—</text><text x="${x}" y="${H - 18}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--fg)">${t}</text>`;
    const h = Math.max(4, v / max * (base - top));
    const kls = ketatKelas(1 / v);
    const warna = kls === "bad" ? "var(--bad)" : kls === "warn" ? "var(--accent)" : "var(--ok)";
    return `<g><rect x="${x - bw / 2}" y="${base - h}" width="${bw}" height="${h}" rx="6" fill="${warna}" opacity="${i === 4 ? 1 : .55}"><title>${t}: ${pm} peminat, ${dt} kursi</title></rect>
      <text x="${x}" y="${base - h - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${warna}">1:${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")}</text>
      <text x="${x}" y="${H - 18}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--fg)">${t}</text>
      <text x="${x}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--muted)">${dt} kursi</text></g>`;
  }).join("");
  return `<div class="box chart-box"><div class="label">Keketatan SNBT 2021–2025 (peminat per kursi)</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik keketatan 2021 sampai 2025">${bars}</svg>
    <p class="hint">Makin tinggi batang, makin ketat persaingan. Arahkan atau ketuk batang untuk melihat jumlah peminat.</p></div>`;
}
function openModal(r) {
  const kt = ketat(r.kt);
  const last = r.riwayat?.[4];
  const b = r.biaya;
  const el = document.createElement("div");
  el.className = "scrim";
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t">
    <div class="hd"><div><div class="label">${esc(r.k.prov)} · ${JENIS_LABEL[r.k.jenis]}${r.k.ptnbh ? " · PTN-BH" : ""}</div><h3 id="m-t">${esc(r.k.nama)}</h3></div><button class="x" aria-label="Tutup">✕</button></div>
    <div><b style="color:var(--primary)">${esc(r.nama)}</b> <span class="hint">(${r.j})</span> ${r.resmi ? '<span class="pill ok">Data resmi SNPMB</span>' : ""}</div>
    ${kt ? `<div class="kt-hero ${kt.cls}"><b class="mono">${rasio(r.kt)}</b><span><strong>${kt.lbl}</strong><br>Peluang ${kt.r.toFixed(1).replace(".", ",")}% · ${last?.[1] ? `${last[1].toLocaleString("id-ID")} peminat untuk ${last[0]} kursi (2025)` : ""}</span></div>` : ""}
    <div class="kv">
      <div>Daya tampung SNBT 2026</div><div class="mono">${r.tampung ?? "—"}</div>
      <div>Daya tampung 2025</div><div class="mono">${last?.[0] ?? "—"}</div>
      <div>Peminat 2025</div><div class="mono">${r.peminat != null ? r.peminat.toLocaleString("id-ID") : "—"}</div>
      <div>Perkiraan skor aman UTBK</div><div class="mono">${r.skor != null ? r.skor.toFixed(1) : "—"}</div>
      ${r.porto ? `<div>Portofolio</div><div>${esc(r.porto)}</div>` : ""}
      ${b ? `<div>UKT${b[4] ? ` ${esc(b[4])}` : ""}</div><div class="mono">${rupiah(b[0])} – ${rupiah(b[1])}</div>
      <div>Biaya masuk / IPI</div><div class="mono">${b[2] == null && b[3] == null ? "—" : `${rupiah(b[2])} – ${rupiah(b[3])}`}</div>` : `<div>UKT & biaya masuk</div><div class="hint" style="font-weight:500">Silakan cek website universitas${r.k.web ? ` (<a href="https://${esc(r.k.web)}" target="_blank" rel="noopener">${esc(r.k.web)}</a>)` : ""}</div>`}
      ${r.p ? `<div>Saran mapel pendukung</div><div>${esc(r.p.mapel.join(" / "))}</div>` : ""}
    </div>
    ${grafikRiwayat(r.riwayat)}
    ${b?.[5] ? `<p class="hint">Sumber biaya: ${esc(b[5])}</p>` : ""}
    ${r.k.pmb ? `<p class="hint">Laman penerimaan: <a href="${esc(r.k.pmb)}" target="_blank" rel="noopener">${esc(r.k.pmb.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a></p>` : r.k.web ? `<p class="hint">Situs resmi: <a href="https://${esc(r.k.web)}" target="_blank" rel="noopener">${esc(r.k.web)}</a></p>` : ""}
    ${r.k.jenis === "PTLN" && negaraByName[r.k.prov] ? `<p class="hint"><b>Beasiswa:</b> ${esc(negaraByName[r.k.prov].beasiswa)}. <a href="${negaraLink(r.k.prov)}">Lihat persiapan kuliah ke ${esc(r.k.prov)}</a></p>` : ""}
    ${r.k.jenis === "PTS" ? '<p class="hint">Kampus swasta menerima mahasiswa lewat seleksi mandiri. Cek jadwal dan syaratnya di situs resmi.</p>' : ""}
    ${r.k.jenis === "PTKN" ? (r.k.dinas ? `<p class="hint">${ikatanPill(r.k.dinas)} ${esc(r.k.dinas.instansi)}. ${esc(r.k.dinas.jalur)}.</p>` : '<p class="hint">Sekolah kedinasan punya seleksi sendiri dengan syarat usia, tinggi badan, dan kesehatan.</p>') : ""}
    <div class="row">
      <button class="btn" data-plan>${inPlan(r) ? "Hapus dari Rencanaku" : "Tambah ke Rencanaku"}</button>
      ${r.p ? '<button class="btn ghost" data-detail>Tentang prodi ini</button>' : ""}
      <button class="btn ghost" data-kampus>Lihat kampus</button>
    </div>
  </div>`;
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  el.onclick = e => { if (e.target === el) close(); };
  el.querySelector(".x").onclick = close;
  el.querySelector("[data-plan]").onclick = () => {
    togglePlan(r);
    el.querySelector("[data-plan]").textContent = inPlan(r) ? "Hapus dari Rencanaku" : "Tambah ke Rencanaku";
    const n = $(".navbtn[data-key='rencana']");
    if (n) n.innerHTML = rencanaLabel();
  };
  el.querySelector("[data-detail]")?.addEventListener("click", () => { close(); go(`#/prodi/${r.p.id}`); });
  el.querySelector("[data-kampus]").onclick = () => { close(); go(`#/kampus/${r.k.id}`); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(el);
  el.querySelector(".x").focus();
}

/* ---------------- Panduan ---------------- */
function viewPanduan() {
  shell("panduan");
  const s = META.sekolah;
  $("#main").innerHTML = `
  <section class="hero"><span class="badge">Panduan</span><h1>Cara Memakai <span class="grad-text">${esc(s.app)}</span></h1>
  <p>Lima langkah menyusun rencana kuliah sebelum berdiskusi dengan orang tua dan sekolah.</p></section>
  <section class="panel">
    <ol class="steps">
      <li><div><b>Kenali prodinya dulu</b><p>Buka <b>Bahas Prodi</b>. Baca mata kuliah dan prospek kariernya. Pastikan kamu tertarik dengan isinya, bukan hanya namanya.</p></div></li>
      <li><div><b>Cek mapel pilihan</b><p>Setiap prodi punya saran mapel pilihan Kelas XI. Sesuaikan pilihan mapelmu sejak awal agar sejalan dengan prodi incaran.</p></div></li>
      <li><div><b>Lihat kampus yang membukanya</b><p>Di <b>Kampus Indonesia → Cari Prodi</b>, ketik nama jurusan. Kamu akan melihat daftar kampus beserta daya tampung, peminat, dan keketatan resmi SNPMB.</p></div></li>
      <li><div><b>Ukur peluangmu</b><p>Bandingkan keketatan antarkampus. Angka <span class="kt-badge bad">1 : 25</span> berarti 25 peminat berebut 1 kursi. Pilih satu target, satu pilihan tengah, dan satu cadangan yang lebih longgar.</p></div></li>
      <li><div><b>Susun Rencanaku dan diskusikan</b><p>Tambahkan pilihan ke <b>Rencanaku</b>, urutkan, lalu diskusikan dengan orang tua dan sekolah ${esc(s.nama)}. Jangan lupa istikharah dan minta doa orang tua.</p></div></li>
    </ol>
    <div class="box"><div class="label">Arti tanda keketatan</div>
      <div class="pills"><span class="kt-badge bad">1 : 25</span><span class="hint">Sangat ketat: peluang di bawah 5%</span></div>
      <div class="pills"><span class="kt-badge warn">1 : 10</span><span class="hint">Ketat: peluang 5–15%</span></div>
      <div class="pills"><span class="kt-badge ok">1 : 4</span><span class="hint">Cukup longgar: peluang di atas 15%</span></div>
      <div class="pills"><span class="score na">Mandiri</span><span class="hint">PTS, lewat seleksi mandiri</span></div>
    </div>
    ${FOOT()}
  </section>`;
}

function notFound() {
  $("#main").innerHTML = `${backBtn()}<section class="panel"><div class="empty">Halaman tidak ditemukan. Mungkin datanya sudah diganti.</div></section>`;
  bindBack();
}

/* ---------------- Router ---------------- */
// Statistik kunjungan GoatCounter; aktif bila data/sekolah.json mengisi "goatcounter".
const hitung = () => { if (window.goatcounter?.count) window.goatcounter.count({ path: user ? (location.hash || "#/").replace(/^#/, "") : "/login" }); };
function pasangStatistik() {
  const kode = META.sekolah.goatcounter;
  if (!kode) return;
  window.goatcounter = { no_onload: true };
  const el = document.createElement("script");
  el.async = true; el.src = "https://gc.zgo.at/count.js"; el.dataset.goatcounter = `https://${kode}.goatcounter.com/count`;
  el.onload = hitung;
  document.head.append(el);
}
function route() {
  hitung();
  if (location.hash !== hashKini) { if (!location.hash.startsWith("#/prodi/")) hashLalu = location.hash; else if (!hashKini.startsWith("#/prodi/")) hashLalu = hashKini; hashKini = location.hash; }
  $$(".scrim").forEach(el => el.remove());
  if (!user) return renderLogin();
  document.title = `${META.sekolah.app} · ${META.sekolah.singkat || META.sekolah.nama}`;
  const [, a, b] = (location.hash || "#/").replace(/^#/, "").split("/");
  window.scrollTo(0, 0);
  if (!a) return viewHome();
  if (a === "cari") return viewCari();
  if (a === "kampus") { if (b) return viewKampusDetail(decodeURIComponent(b)); if (q.kampus?.jenis === "PTKN") q.kampus.jenis = ""; return viewKampus("kampus"); }
  if (a === "luar-negeri") return viewLuarNegeri();
  if (a === "linimasa") return viewLinimasa();
  if (a === "negara") return viewNegara(decodeURIComponent(b || ""));
  if (a === "kedinasan") { q.kampus = { text: "", prov: "", jenis: "PTKN", ikatan: "" }; return viewKampus("kedinasan"); }
  if (a === "mapel") return viewMapel();
  if (a === "asesmen") return viewAsesmen(b);
  if (a === "bahas") return viewBahas();
  if (a === "prodi") return viewProdi(decodeURIComponent(b || ""));
  if (a === "rencana") return viewRencana();
  if (a === "panduan") return viewPanduan();
  viewHome();
}

loadData().then(() => {
  pasangStatistik();
  window.addEventListener("hashchange", route);
  route();
}).catch(() => {
  $("#app").innerHTML = '<div class="boot">Data aplikasi gagal dimuat. Muat ulang halaman, atau hubungi sekolah jika masalah berlanjut.</div>';
});
