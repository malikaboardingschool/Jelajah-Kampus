// Jelajah Kampus (SMA Malika IBS) — aplikasi statis. Data dibaca dari data/*.json hasil scripts/build.mjs.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let LINIMASA = [], MAPEL = [];
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
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/></svg>'
};
// Logo sekolah dari data/sekolah.json; kalau gagal dimuat, pakai logo cadangan bawaan.
const LOGO = (n = 38) => `<img class="logo" src="${esc(META.sekolah.logo || "assets/logo.svg")}" width="${n}" height="${n}" alt="Logo ${esc(META.sekolah.nama)}" onerror="this.onerror=null;this.src='assets/logo.svg'">`;

/* ---------------- Data ---------------- */
async function loadData() {
  const get = f => fetch(`data/${f}`, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [meta, prodi, kampus, kp] = await Promise.all([get("meta.json"), get("prodi.json"), get("kampus.json"), get("kp.json")]);
  META = meta; PRODI = prodi; KAMPUS = kampus;
  NEGARA = await get("negara.json").catch(() => []);
  LINIMASA = await get("linimasa.json").catch(() => []);
  MAPEL = await get("mapel.json").catch(() => []);
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
  const akses = await fetch("data/akses.json", { cache: "no-cache" }).then(r => r.json());
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
      user = { masuk: true };
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
const MENU = [["#/", "Beranda", "home"], ["#/cari", "Kampus Indonesia", "indonesia"], ["#/luar-negeri", "Kampus Luar Negeri", "luar"],
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
  $("#logout").onclick = () => { store.set("mp_user", null); user = null; location.hash = ""; route(); };
}
// Sub-menu Kampus Indonesia
const SUBMENU = [["#/cari", "Cari Prodi", "cari"], ["#/kampus", "Daftar Kampus", "kampus"], ["#/kedinasan", "Sekolah Kedinasan", "kedinasan"], ["#/bahas", "Bahas Prodi", "bahas"], ["#/skor", "Cek Skor", "skor"], ["#/mapel", "Cek Jurusan", "mapel"]];
const subnav = active => `<nav class="subnav" aria-label="Kampus Indonesia">${SUBMENU.map(([h, l, k]) => `<button class="subbtn" data-href="${h}" aria-current="${active === k ? "page" : "false"}">${l}</button>`).join("")}</nav>`;
const bindNav = () => $$("#main [data-href]").forEach(b => b.onclick = () => go(b.dataset.href));
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const backBtn = (label = "← Beranda", h = "#/") => `<button class="back" data-back="${h}">${label}</button>`;
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
      <p>Sistem ini dibuat eksklusif hanya untuk siswa siswi SMA Malika IBS. Jelajahi prodi dan kampus, ukur peluangmu dengan skor UTBK, lalu susun rencana untuk didiskusikan dengan orang tuamu dan sekolah.</p>
      <div class="hero-cta">
        <button class="btn" data-go="#/cari">Mulai Cari Prodi</button>
        <button class="btn ghost" data-go="#/linimasa">Jadwal Penting</button>
      </div>
    </div>
    <figure class="hero-img"><img src="assets/hero.webp" alt="Siswa dan siswi SMA Malika IBS bersiap melanjutkan kuliah" width="722" height="784" fetchpriority="high"></figure>
  </section>
  ${agendaCard()}
  <div class="quick">
    ${quick("#/cari", "campus", "Kampus Indonesia", `${nDN} kampus · data resmi SNPMB`)}
    ${quick("#/luar-negeri", "globe", "Kampus Luar Negeri", `${j.kampusLN} kampus · ${j.negara} negara`)}
    ${quick("#/linimasa", "calendar", "Jadwal Penting", "TKA, SNBP, SNBT, mandiri")}
    ${quick("#/rencana", "list", "Rencanaku", plan.length ? `${plan.length} pilihan tersimpan` : "Susun pilihanmu")}
  </div>
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

/* ---------------- Cek Skor ---------------- */
function viewSkor() {
  shell("indonesia");
  const s = q.skor ||= { skor: "", jenjang: "", text: "", jenis: "" };
  const nSkor = ROWS.filter(r => r.skor != null).length;
  $("#main").innerHTML = `${subnav("skor")}
  <section class="panel">
    <h2>Cek Skormu</h2>
    <p class="hint">Masukkan perkiraan skor UTBK-mu (rata-rata, skala 0–1000), misalnya dari tryout terakhir. Pilihan dengan skor aman sama atau di bawah skormu tergolong realistis.</p>
    <div class="row">
      <input class="search mono" id="s-v" type="number" min="200" max="1000" step="1" inputmode="numeric" placeholder="Contoh: 620" value="${esc(s.skor)}" aria-label="Skor UTBK">
      <select class="search" id="s-j" aria-label="Jenjang"><option value="">Semua jenjang</option>${["S1", "D4", "D3"].map(j => `<option ${s.jenjang === j ? "selected" : ""}>${j}</option>`).join("")}</select>
    </div>
    <input class="search" id="s-t" placeholder="(opsional) saring nama prodi atau kampus" value="${esc(s.text)}" autocomplete="off">
    <div id="s-out"></div>
    <p class="foot">${nSkor ? `Saat ini ${nSkor} pilihan sudah memiliki skor aman.` : `<b>Belum ada data skor aman.</b> SNPMB tidak menerbitkan skor aman; sekolah dapat mengisinya di <code>data/skor_aman.csv</code> dari hasil tryout atau data alumni. Sementara itu, pakai <a href="#/cari">Cari Prodi</a> untuk melihat keketatan resmi.`}</p>
    ${FOOT()}
  </section>`;
  bindNav();
  const draw = () => {
    const out = $("#s-out"); out.innerHTML = "";
    const v = parseFloat(s.skor);
    if (!(v >= 200 && v <= 1000)) { out.innerHTML = '<div class="empty">Isi skor antara 200 dan 1000 untuk mulai.</div>'; return; }
    const t = norm(s.text.trim());
    const base = ROWS.filter(r => r.skor != null && (!s.jenjang || r.j === s.jenjang) && (!t || r._n.includes(t) || r.k._n.includes(t)));
    const aman = sortRows(base.filter(r => r.skor <= v), "skor");
    const tipis = sortRows(base.filter(r => r.skor > v && r.skor <= v + 25), "skor").reverse();
    out.insertAdjacentHTML("beforeend", `<div class="summary">Dengan skor <b class="mono">${v}</b>, ada <b>${aman.length}</b> pilihan yang tergolong aman dan <b>${tipis.length}</b> pilihan yang selisihnya tipis (maksimal 25 poin di atas skormu).</div>`);
    if (tipis.length) {
      out.insertAdjacentHTML("beforeend", '<p class="label" style="margin:14px 0 8px">Selisih tipis: perlu usaha ekstra</p>');
      const d = document.createElement("div"); out.append(d);
      pagedList(d, tipis, (r, i) => rowItem(r, i, "skor"), openModal, 30);
    }
    out.insertAdjacentHTML("beforeend", '<p class="label" style="margin:14px 0 8px">Peluang realistis</p>');
    if (!aman.length) { out.insertAdjacentHTML("beforeend", '<div class="empty">Belum ada pilihan dengan skor aman di bawah skormu. Coba naikkan target belajarmu atau pertimbangkan PTS dan jalur lain.</div>'); return; }
    const d2 = document.createElement("div"); out.append(d2);
    pagedList(d2, aman, (r, i) => rowItem(r, i, "skor"), openModal, 40);
  };
  let timer;
  $("#s-v").oninput = e => { s.skor = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 200); };
  $("#s-j").onchange = e => { s.jenjang = e.target.value; draw(); };
  $("#s-t").oninput = e => { s.text = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 200); };
  draw();
}

/* ---------------- Cek Jurusan (mapel favorit) ---------------- */
// Cocokkan nama jurusan dengan katalog prodi; keterangan dalam kurung diabaikan.
const prodiDariNama = j => {
  const n = norm(j.replace(/\s*\(.*?\)/g, "").trim());
  return PRODI.find(p => norm(p.nama) === n) || PRODI.find(p => norm(p.nama) === `ilmu ${n}`) || null;
};
function viewMapel() {
  shell("indonesia");
  const s = q.mapel ||= { pilih: [] };
  $("#main").innerHTML = `${subnav("mapel")}
  <section class="panel">
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
  $("#main").innerHTML = `${backBtn("← Daftar prodi", "#/bahas")}
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
      <div>Biaya masuk / IPI</div><div class="mono">${b[2] == null && b[3] == null ? "—" : `${rupiah(b[2])} – ${rupiah(b[3])}`}</div>` : `<div>UKT & biaya masuk</div><div class="hint" style="font-weight:500">Belum diisi</div>`}
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
function route() {
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
  if (a === "skor") return viewSkor();
  if (a === "mapel") return viewMapel();
  if (a === "bahas") return viewBahas();
  if (a === "prodi") return viewProdi(decodeURIComponent(b || ""));
  if (a === "rencana") return viewRencana();
  if (a === "panduan") return viewPanduan();
  viewHome();
}

loadData().then(() => {
  window.addEventListener("hashchange", route);
  route();
}).catch(() => {
  $("#app").innerHTML = '<div class="boot">Data aplikasi gagal dimuat. Muat ulang halaman, atau hubungi sekolah jika masalah berlanjut.</div>';
});
