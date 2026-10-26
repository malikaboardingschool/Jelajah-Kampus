// Jelajah Kampus (SMA Malika IBS) — aplikasi statis. Data dibaca dari data/*.json hasil scripts/build.mjs.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let META, PRODI, KAMPUS, ROWS, PROVS, prodiById, kampusById;
let user = store.get("mp_user");
let plan = store.get("mp_rencana") || []; // [{k, p, j}]
const q = {}; // isi filter per halaman, bertahan selama sesi

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  campus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/></svg>'
};
// Logo sekolah dari data/sekolah.json; kalau gagal dimuat, pakai logo cadangan bawaan.
const LOGO = (n = 38) => `<img class="logo" src="${esc(META.sekolah.logo || "assets/logo.svg")}" width="${n}" height="${n}" alt="Logo ${esc(META.sekolah.nama)}" onerror="this.onerror=null;this.src='assets/logo.svg'">`;

/* ---------------- Data ---------------- */
async function loadData() {
  const get = f => fetch(`data/${f}`, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [meta, prodi, kampus, kp] = await Promise.all([get("meta.json"), get("prodi.json"), get("kampus.json"), get("kp.json")]);
  META = meta; PRODI = prodi; KAMPUS = kampus;
  ROWS = kp.map(([k, p, j, skor, tampung, peminat, sumber]) => ({ k: kampus[k], p: prodi[p], j, skor, tampung, peminat, contoh: sumber === "CONTOH" }));
  // Urutan resmi (barat ke timur) dari data/sekolah.json; provinsi tanpa kampus tetap tampil di filter.
  PROVS = meta.sekolah.provinsi?.length ? meta.sekolah.provinsi : [...new Set(kampus.map(k => k.prov))].sort();
  prodiById = Object.fromEntries(prodi.map(p => [p.id, p]));
  kampusById = Object.fromEntries(kampus.map(k => [k.id, k]));
  prodi.forEach(p => { p._n = norm(p.nama); p._kampus = 0; });
  kampus.forEach(k => { k._n = norm(`${k.nama} ${k.singkat}`); k._prodi = 0; });
  ROWS.forEach(r => { r.p._kampus++; r.k._prodi++; });
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
      if (!(await cekSandi(pw))) { err.textContent = "Kata sandi salah. Periksa lagi, atau tanyakan ke guru BK."; return; }
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
function shell(active) {
  const s = META.sekolah;
  const nav = (h, l, key) => `<button class="navbtn" data-href="${h}" aria-current="${active === key}">${l}</button>`;
  $("#app").innerHTML = `
  <header class="top"><div class="in">
    <button class="brand" data-href="#/">${LOGO()}<div><b>${esc(s.app)}</b><small>${esc(s.nama)}</small></div></button>
    ${nav("#/", "Beranda", "home")}
    ${nav("#/rencana", `Rencanaku${plan.length ? `<span class="count">${plan.length}</span>` : ""}`, "rencana")}
    ${nav("#/panduan", "Panduan", "panduan")}
    <button class="navbtn" id="logout">Keluar</button>
  </div></header>
  <main class="wrap" id="main"></main>`;
  $$("[data-href]").forEach(b => b.onclick = () => go(b.dataset.href));
  $("#logout").onclick = () => { store.set("mp_user", null); user = null; location.hash = ""; route(); };
}
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const backBtn = (label = "← Beranda", h = "#/") => `<button class="back" data-back="${h}">${label}</button>`;
const bindBack = () => $$("[data-back]").forEach(b => b.onclick = () => go(b.dataset.back));
const FOOT = () => `<p class="foot">*Skor aman, daya tampung, dan peminat diisi guru BK dari sumber resmi. Baris bertanda <span class="tag contoh">contoh</span> masih angka ilustrasi. Gunakan untuk perencanaan, bukan jaminan lolos. Data diperbarui ${new Date(META.diperbarui).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.</p>`;

function statsHTML() {
  const j = META.jumlah;
  return `<div class="stats">
    <div class="stat"><b class="mono">${j.prodi}</b><span class="label">Prodi</span></div>
    <div class="stat"><b class="mono">${j.kampus}</b><span class="label">Kampus</span></div>
    <div class="stat"><b class="mono">${j.provinsi}${j.provinsiResmi && j.provinsi < j.provinsiResmi ? `/${j.provinsiResmi}` : ""}</b><span class="label">Provinsi</span></div>
  </div>`;
}

const scoreBadge = r => {
  if (r.skor == null) return `<span class="score na">${r.k.jenis === "PTS" ? "Mandiri" : "Belum ada skor"}</span>`;
  return `${r.contoh ? '<span class="tag contoh">contoh</span>' : ""}<span class="score ${r.skor < 650 ? "mid" : ""}">${r.skor.toFixed(1)}</span>`;
};
function ketat(t, p) {
  if (!t || !p) return null;
  const r = t / p * 100;
  return { r, cls: r < 3 ? "bad" : r < 8 ? "warn" : "ok", lbl: r < 3 ? "Sangat ketat" : r < 8 ? "Ketat" : "Cukup longgar" };
}
const sortRows = (rows, asc) => rows.sort((a, b) => ((b.skor ?? -1) - (a.skor ?? -1)) * (asc ? -1 : 1) || a.k.nama.localeCompare(b.k.nama));

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
  const title = mode === "kampus" ? r.k.nama : r.p.nama;
  const sub = mode === "kampus" ? r.p.nama : mode === "skor" ? r.k.nama : r.p.rumpun;
  return `<button class="item" data-i="${i}"><div class="t"><b>${esc(title)}</b><span>${esc(sub)} · ${r.j} · ${JENIS_LABEL[r.k.jenis]}</span></div>${scoreBadge(r)}</button>`;
};

/* ---------------- Beranda ---------------- */
function viewHome() {
  shell("home");
  $("#main").innerHTML = `
  <section class="hero hero-home">
    <div class="hero-text">
      <h1>Pilih Program Studi <span class="grad-text">dengan Data dan Strategi</span></h1>
      <p>Sistem ini dibuat eksklusif hanya untuk siswa siswi SMA Malika IBS. Jelajahi prodi dan kampus, ukur peluangmu dengan skor UTBK, lalu susun rencana untuk didiskusikan dengan orang tuamu dan sekolah.</p>
      <div class="hero-cta">
        <button class="btn" data-go="#/cari">Mulai Cari Prodi</button>
        <button class="btn ghost" data-go="#/kedinasan">Sekolah Kedinasan</button>
      </div>
    </div>
    <figure class="hero-img"><img src="assets/hero.webp" alt="Siswa dan siswi SMA Malika IBS bersiap melanjutkan kuliah" width="722" height="784" fetchpriority="high"></figure>
  </section>
  ${statsHTML()}
  <div class="menu">
    ${tile("#/cari", "search", "Cari Prodi", "Ketik nama jurusan, lihat kampus mana saja yang membukanya beserta skor amannya.")}
    ${tile("#/kampus", "campus", "Daftar Kampus", "Telusuri PTN, UIN, politeknik, sekolah kedinasan, dan PTS per provinsi.")}
    ${tile("#/skor", "target", "Cek Skormu", "Masukkan perkiraan skor UTBK-mu, lihat pilihan yang peluangnya realistis.")}
    ${tile("#/bahas", "book", "Bahas Prodi", "Baca penjelasan tiap prodi: mata kuliah, prospek karier, dan mapel pendukung.")}
    ${tile("#/kedinasan", "campus", "Sekolah Kedinasan", `${KAMPUS.filter(k => k.jenis === "PTKN").length} sekolah kedinasan: STAN, STIS, IPDN, akademi TNI/Polri, pelayaran, penerbangan, Poltekkes, dan lainnya. Lihat mana yang ikatan dinas.`).replace('class="tile"', 'class="tile wide"')}
  </div>`;
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}
const tile = (h, ic, t, p) => `<button class="tile" data-go="${h}"><span class="ic">${ICON[ic]}</span><h3>${t}</h3><p>${p}</p></button>`;

/* ---------------- Cari Prodi ---------------- */
function viewCari() {
  shell("home");
  const s = q.cari ||= { text: "", jenjang: "", jenis: "", asc: false };
  const CHIPS = ["Kedokteran", "Teknik Informatika", "Psikologi", "Ekonomi Syariah", "Ilmu Hukum", "Farmasi", "Pendidikan Agama Islam", "Hubungan Internasional"];
  $("#main").innerHTML = `${backBtn()}
  <section class="panel">
    <h2>Cari Prodi</h2>
    <p class="hint">Ketik nama jurusan, lihat tersedia di kampus mana saja.</p>
    <input class="search" id="c-q" placeholder="Contoh: Psikologi, Informatika, Ekonomi Syariah" value="${esc(s.text)}" autocomplete="off">
    <div class="chips">${CHIPS.map(c => `<button class="chip" data-chip="${esc(c)}" aria-pressed="${s.text === c}">${esc(c)}</button>`).join("")}</div>
    <div class="row">
      <select class="search" id="c-j" aria-label="Jenjang"><option value="">Semua jenjang</option>${["S1", "D4", "D3"].map(j => `<option ${s.jenjang === j ? "selected" : ""}>${j}</option>`).join("")}</select>
      <select class="search" id="c-t" aria-label="Jenis kampus"><option value="">Semua jenis kampus</option>${[["PTN","PTN"],["PTKIN","UIN/IAIN (PTKIN)"],["PTKN","Kedinasan"],["PTS","Swasta"]].map(([v,l]) => `<option value="${v}" ${s.jenis === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="search" id="c-s">↕ Skor ${s.asc ? "terendah dulu" : "tertinggi dulu"}</button>
    </div>
    <div id="c-out"></div>
    ${FOOT()}
  </section>`;
  bindBack();
  const draw = () => {
    const out = $("#c-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    if (t.length < 2) { out.innerHTML = '<div class="empty">Ketik minimal 2 huruf nama jurusan untuk mulai.</div>'; return; }
    const rows = sortRows(ROWS.filter(r => r.p._n.includes(t) && (!s.jenjang || r.j === s.jenjang) && (!s.jenis || r.k.jenis === s.jenis)), s.asc);
    if (!rows.length) {
      const sug = PRODI.filter(p => p._n.includes(t)).slice(0, 5);
      out.innerHTML = `<div class="empty">Belum ada kampus untuk pencarian ini.${sug.length ? ` Coba baca penjelasan prodinya: ${sug.map(p => `<a href="#/prodi/${p.id}">${esc(p.nama)}</a>`).join(", ")}.` : " Coba kata lain, misalnya \"Teknik\" atau \"Syariah\"."}</div>`;
      return;
    }
    const nk = j => new Set(rows.filter(r => r.k.jenis === j).map(r => r.k.id)).size;
    const sk = rows.filter(r => r.skor != null).map(r => r.skor);
    out.insertAdjacentHTML("beforeend", `<div class="summary" style="margin-bottom:10px">Ditemukan <b>${rows.length}</b> pilihan di <b>${nk("PTN")}</b> PTN, <b>${nk("PTKIN")}</b> PTKIN, <b>${nk("PTKN")}</b> kedinasan, dan <b>${nk("PTS")}</b> PTS.${sk.length ? ` Skor aman yang sudah terisi berkisar <b class="mono">${Math.min(...sk)}</b>–<b class="mono">${Math.max(...sk)}</b>.` : ""}</div>`);
    pagedList(out, rows, (r, i) => rowItem(r, i, "kampus"), openModal);
  };
  let timer;
  $("#c-q").oninput = e => { s.text = e.target.value; $$("[data-chip]").forEach(c => c.setAttribute("aria-pressed", c.dataset.chip === s.text)); clearTimeout(timer); timer = setTimeout(draw, 150); };
  $$("[data-chip]").forEach(c => c.onclick = () => { s.text = c.dataset.chip; $("#c-q").value = s.text; $$("[data-chip]").forEach(x => x.setAttribute("aria-pressed", x === c)); draw(); });
  $("#c-j").onchange = e => { s.jenjang = e.target.value; draw(); };
  $("#c-t").onchange = e => { s.jenis = e.target.value; draw(); };
  $("#c-s").onclick = () => { s.asc = !s.asc; $("#c-s").textContent = `↕ Skor ${s.asc ? "terendah dulu" : "tertinggi dulu"}`; draw(); };
  draw();
}

/* ---------------- Daftar Kampus ---------------- */
const JENIS_LABEL = { PTN: "PTN", PTKIN: "PTKIN", PTKN: "Kedinasan", PTS: "PTS" };
const IKATAN = { ya: ["ok", "Ikatan dinas"], sebagian: ["warn", "Sebagian ikatan dinas"], tidak: ["", "Bukan ikatan dinas"] };
const ikatanPill = d => d && IKATAN[d.ikatan] ? `<span class="pill ${IKATAN[d.ikatan][0]}">${IKATAN[d.ikatan][1]}</span>` : "";
const dinasBox = d => d ? `<div class="box"><div class="label">Info sekolah kedinasan</div>
  <div class="pills">${ikatanPill(d)}</div>
  <p><b>Instansi:</b> ${esc(d.instansi)}</p>
  <p><b>Jalur masuk:</b> ${esc(d.jalur)}</p>
  ${d.catatan ? `<p>${esc(d.catatan)}</p>` : ""}
  <p class="hint">Syarat usia, tinggi badan, kesehatan, dan kuota berubah setiap tahun. Selalu cek pengumuman resmi terbaru.</p></div>` : "";
function viewKampus() {
  shell("home");
  const s = q.kampus ||= { text: "", prov: "", jenis: "", ikatan: "" };
  $("#main").innerHTML = `${backBtn()}
  <section class="panel">
    <h2>Daftar Kampus</h2>
    <p class="hint">Cari kampus atau saring per provinsi dan jenis. Ketuk kampus untuk melihat semua prodinya.</p>
    <input class="search" id="k-q" placeholder="Contoh: UIN, Gadjah Mada, Politeknik" value="${esc(s.text)}" autocomplete="off">
    <div class="row">
      <select class="search" id="k-p" aria-label="Provinsi"><option value="">Semua provinsi</option>${PROVS.map(p => `<option ${s.prov === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <select class="search" id="k-j" aria-label="Jenis kampus"><option value="">Semua jenis</option>${[["PTN","PTN"],["PTKIN","UIN/IAIN (PTKIN)"],["PTKN","Sekolah kedinasan"],["PTS","Swasta"]].map(([v,l]) => `<option value="${v}" ${s.jenis === v ? "selected" : ""}>${l}</option>`).join("")}</select>
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
  bindBack();
  const draw = () => {
    const out = $("#k-out"); out.innerHTML = "";
    const t = norm(s.text.trim());
    $("#k-ik").hidden = s.jenis !== "PTKN";
    $$("[data-ik]").forEach(c => c.setAttribute("aria-pressed", c.dataset.ik === (s.ikatan || "")));
    const ks = KAMPUS.filter(k => (!t || k._n.includes(t)) && (!s.prov || k.prov === s.prov) && (!s.jenis || k.jenis === s.jenis) && (s.jenis !== "PTKN" || !s.ikatan || k.dinas?.ikatan === s.ikatan)).sort((a, b) => a.nama.localeCompare(b.nama));
    if (!ks.length) { out.innerHTML = '<div class="empty">Kampus tidak ditemukan. Coba hapus filter provinsi atau jenis.</div>'; return; }
    out.insertAdjacentHTML("beforeend", `<p class="label" style="margin:0 0 8px">${ks.length} kampus</p>`);
    pagedList(out, ks, (k, i) => `<button class="item" data-i="${i}"><div class="t"><b>${esc(k.nama)}</b><span>${esc(k.kota ? k.kota + ", " : "")}${esc(k.prov)} · ${k._prodi} prodi</span></div>${k.dinas?.ikatan === "ya" ? '<span class="pill ok">Ikatan dinas</span>' : ""}<span class="tag">${JENIS_LABEL[k.jenis]}</span></button>`, k => go(`#/kampus/${k.id}`));
  };
  $("#k-q").oninput = e => { s.text = e.target.value; draw(); };
  $("#k-p").onchange = e => { s.prov = e.target.value; draw(); };
  $("#k-j").onchange = e => { s.jenis = e.target.value; s.ikatan = ""; draw(); };
  $$("[data-ik]").forEach(c => c.onclick = () => { s.ikatan = c.dataset.ik; draw(); });
  draw();
}
function viewKampusDetail(id) {
  shell("home");
  const k = kampusById[id];
  if (!k) return notFound();
  const rows = sortRows(ROWS.filter(r => r.k === k), false);
  $("#main").innerHTML = `${backBtn("← Daftar kampus", "#/kampus")}
  <section class="panel">
    <div><div class="label">${JENIS_LABEL[k.jenis]} · ${esc(k.kota ? k.kota + ", " : "")}${esc(k.prov)}</div><h2>${esc(k.nama)}</h2></div>
    ${k.web ? `<p class="hint">Situs resmi: <a href="https://${esc(k.web)}" target="_blank" rel="noopener">${esc(k.web)}</a></p>` : ""}
    ${dinasBox(k.dinas)}
    <div id="kd-out"></div>
    ${FOOT()}
  </section>`;
  bindBack();
  if (!rows.length) $("#kd-out").innerHTML = '<div class="empty">Daftar prodi kampus ini belum diisi.</div>';
  else pagedList($("#kd-out"), rows, (r, i) => rowItem(r, i, "prodi"), openModal, 100);
}

/* ---------------- Cek Skor ---------------- */
function viewSkor() {
  shell("home");
  const s = q.skor ||= { skor: "", jenjang: "", text: "", jenis: "" };
  const nSkor = ROWS.filter(r => r.skor != null).length;
  $("#main").innerHTML = `${backBtn()}
  <section class="panel">
    <h2>Cek Skormu</h2>
    <p class="hint">Masukkan perkiraan skor UTBK-mu (rata-rata, skala 0–1000), misalnya dari tryout terakhir. Pilihan dengan skor aman sama atau di bawah skormu tergolong realistis.</p>
    <div class="row">
      <input class="search mono" id="s-v" type="number" min="200" max="1000" step="1" inputmode="numeric" placeholder="Contoh: 620" value="${esc(s.skor)}" aria-label="Skor UTBK">
      <select class="search" id="s-j" aria-label="Jenjang"><option value="">Semua jenjang</option>${["S1", "D4", "D3"].map(j => `<option ${s.jenjang === j ? "selected" : ""}>${j}</option>`).join("")}</select>
    </div>
    <input class="search" id="s-t" placeholder="(opsional) saring nama prodi atau kampus" value="${esc(s.text)}" autocomplete="off">
    <div id="s-out"></div>
    <p class="foot">Saat ini ${nSkor} pilihan sudah memiliki skor aman. Pilihan tanpa skor tidak ikut ditampilkan di sini.</p>
    ${FOOT()}
  </section>`;
  bindBack();
  const draw = () => {
    const out = $("#s-out"); out.innerHTML = "";
    const v = parseFloat(s.skor);
    if (!(v >= 200 && v <= 1000)) { out.innerHTML = '<div class="empty">Isi skor antara 200 dan 1000 untuk mulai.</div>'; return; }
    const t = norm(s.text.trim());
    const base = ROWS.filter(r => r.skor != null && (!s.jenjang || r.j === s.jenjang) && (!t || r.p._n.includes(t) || r.k._n.includes(t)));
    const aman = sortRows(base.filter(r => r.skor <= v), false);
    const tipis = sortRows(base.filter(r => r.skor > v && r.skor <= v + 25), true);
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

/* ---------------- Bahas Prodi ---------------- */
function viewBahas() {
  shell("home");
  const s = q.bahas ||= { text: "", rumpun: "", rek: false };
  $("#main").innerHTML = `${backBtn()}
  <section class="panel">
    <h2>Bahas Prodi</h2>
    <p class="hint">Pilih prodi untuk membaca penjelasannya. Tanda <span class="star">★</span> berarti rekomendasi guru BK ${esc(META.sekolah.nama)}.</p>
    <input class="search" id="b-q" placeholder="Cari nama prodi, misalnya Arsitektur" value="${esc(s.text)}" autocomplete="off">
    <div class="chips" id="b-chips">
      <button class="chip" data-r="">Semua</button>
      <button class="chip" data-rek="1">★ Rekomendasi</button>
      ${META.sekolah.rumpun.map(r => `<button class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join("")}
    </div>
    <div id="b-out"></div>
  </section>`;
  bindBack();
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
  shell("home");
  const p = prodiById[id];
  if (!p) return notFound();
  const rows = sortRows(ROWS.filter(r => r.p === p), false);
  const list = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("#main").innerHTML = `${backBtn("← Daftar prodi", "#/bahas")}
  <article class="panel detail">
    <div><div class="label">${esc(p.rumpun)} · ${p.jenjang.join(" / ")}${p.rek ? ' · <span class="star">★ Rekomendasi BK</span>' : ""}</div><h2>${esc(p.nama)}</h2></div>
    <div class="box"><div class="label">Tentang prodi ini</div><p>${esc(p.ringkas)}</p></div>
    <div class="cols">
      <div class="box"><div class="label">Contoh mata kuliah</div>${list(p.matkul)}</div>
      <div class="box"><div class="label">Prospek karier</div>${list(p.karier)}</div>
      <div class="box"><div class="label">Saran mapel pilihan (Kelas XI)</div>${list(p.mapel)}</div>
    </div>
    <div class="box"><div class="label">Tersedia di ${rows.length} kampus</div><div id="pd-out"></div></div>
    ${FOOT()}
  </article>`;
  bindBack();
  if (!rows.length) $("#pd-out").innerHTML = '<div class="empty">Belum ada kampus yang tercatat untuk prodi ini.</div>';
  else pagedList($("#pd-out"), rows, (r, i) => rowItem(r, i, "kampus"), openModal, 40);
}

/* ---------------- Rencanaku ---------------- */
const planKey = r => `${r.k.id}|${r.p.id}|${r.j}`;
const inPlan = r => plan.some(x => `${x.k}|${x.p}|${x.j}` === planKey(r));
function togglePlan(r) {
  if (inPlan(r)) plan = plan.filter(x => `${x.k}|${x.p}|${x.j}` !== planKey(r));
  else plan.push({ k: r.k.id, p: r.p.id, j: r.j });
  store.set("mp_rencana", plan);
}
function viewRencana() {
  shell("rencana");
  const rows = plan.map(x => ROWS.find(r => r.k.id === x.k && r.p.id === x.p && r.j === x.j)).filter(Boolean);
  $("#main").innerHTML = `
  <section class="hero"><span class="badge">Rencanaku</span><h1>Pilihan Prodi <span class="grad-text">& Kampusmu</span></h1>
  <p>Susun urutan pilihan dari yang paling kamu inginkan. Bawa daftar ini saat konsultasi dengan guru BK. Daftar ini tersimpan di perangkat ini saja.</p></section>
  <section class="panel">
    ${rows.length ? `<div class="plan">${rows.map((r, i) => `
      <div class="plan-item">
        <div style="min-width:0"><b>${esc(r.p.nama)}</b> <span class="hint">(${r.j})</span><div class="hint">${esc(r.k.nama)} · ${JENIS_LABEL[r.k.jenis]}</div></div>
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
    const text = `Rencana Prodi — ${META.sekolah.nama}\n` + rows.map((r, i) => `${i + 1}. ${r.p.nama} (${r.j}) — ${r.k.nama}${r.skor != null ? ` — skor aman ${r.skor}${r.contoh ? " [contoh]" : ""}` : ""}`).join("\n");
    try { await navigator.clipboard.writeText(text); $("#copied").textContent = "Daftar disalin. Tempel di WhatsApp atau catatanmu."; }
    catch { $("#copied").textContent = "Browser menolak menyalin otomatis. Salin manual dari daftar di atas."; }
  };
}

/* ---------------- Modal detail ---------------- */
function openModal(r) {
  const kt = ketat(r.tampung, r.peminat);
  const el = document.createElement("div");
  el.className = "scrim";
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t">
    <div class="hd"><div><div class="label">${esc(r.k.prov)} · ${JENIS_LABEL[r.k.jenis]}</div><h3 id="m-t">${esc(r.k.nama)}</h3></div><button class="x" aria-label="Tutup">✕</button></div>
    <div><b style="color:var(--primary)">${esc(r.p.nama)}</b> <span class="hint">(${r.j})</span> ${r.contoh ? '<span class="tag contoh">angka contoh</span>' : ""}</div>
    <div class="kv">
      <div>Perkiraan skor aman UTBK</div><div class="mono">${r.skor != null ? r.skor.toFixed(1) : "—"}</div>
      <div>Keketatan</div><div>${kt ? `<span class="pill ${kt.cls}">${kt.lbl}</span>` : "—"}</div>
      <div>Peluang (tampung ÷ peminat)</div><div class="mono">${kt ? kt.r.toFixed(1) + "%" : "—"}</div>
      <div>Daya tampung</div><div class="mono">${r.tampung ?? "—"}</div>
      <div>Peminat tahun lalu</div><div class="mono">${r.peminat ?? "—"}</div>
      <div>Saran mapel pendukung</div><div>${esc(r.p.mapel.join(" / "))}</div>
      ${r.k.web ? `<div>Situs resmi</div><div><a href="https://${esc(r.k.web)}" target="_blank" rel="noopener">${esc(r.k.web)}</a></div>` : ""}
    </div>
    ${r.k.jenis === "PTS" ? '<p class="hint">Kampus swasta menerima mahasiswa lewat seleksi mandiri. Cek jadwal dan syaratnya di situs resmi.</p>' : ""}
    ${r.k.jenis === "PTKN" ? (r.k.dinas ? `<p class="hint">${ikatanPill(r.k.dinas)} ${esc(r.k.dinas.instansi)}. ${esc(r.k.dinas.jalur)}.</p>` : '<p class="hint">Sekolah kedinasan punya seleksi sendiri dengan syarat usia, tinggi badan, dan kesehatan.</p>') : ""}
    <div class="row">
      <button class="btn" data-plan>${inPlan(r) ? "Hapus dari Rencanaku" : "Tambah ke Rencanaku"}</button>
      <button class="btn ghost" data-detail>Tentang prodi ini</button>
    </div>
  </div>`;
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  el.onclick = e => { if (e.target === el) close(); };
  el.querySelector(".x").onclick = close;
  el.querySelector("[data-plan]").onclick = () => {
    togglePlan(r);
    el.querySelector("[data-plan]").textContent = inPlan(r) ? "Hapus dari Rencanaku" : "Tambah ke Rencanaku";
    const n = $(".navbtn[data-href='#/rencana']");
    if (n) n.innerHTML = `Rencanaku${plan.length ? `<span class="count">${plan.length}</span>` : ""}`;
  };
  el.querySelector("[data-detail]").onclick = () => { close(); go(`#/prodi/${r.p.id}`); };
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
  <p>Lima langkah menyusun rencana kuliah sebelum konsultasi dengan guru BK.</p></section>
  <section class="panel">
    <ol class="steps">
      <li><div><b>Kenali prodinya dulu</b><p>Buka <b>Bahas Prodi</b>. Baca mata kuliah dan prospek kariernya. Pastikan kamu tertarik dengan isinya, bukan hanya namanya.</p></div></li>
      <li><div><b>Cek mapel pilihan</b><p>Setiap prodi punya saran mapel pilihan Kelas XI. Sesuaikan pilihan mapelmu sejak awal agar sejalan dengan prodi incaran.</p></div></li>
      <li><div><b>Lihat kampus yang membukanya</b><p>Di <b>Cari Prodi</b>, ketik nama jurusan. Kamu akan melihat daftar kampus beserta skor aman UTBK jika sudah diisi.</p></div></li>
      <li><div><b>Ukur peluangmu</b><p>Di <b>Cek Skormu</b>, masukkan skor tryout terakhirmu. Pilihan dengan selisih tipis bisa jadi target, yang aman bisa jadi cadangan.</p></div></li>
      <li><div><b>Susun Rencanaku dan diskusikan</b><p>Tambahkan pilihan ke <b>Rencanaku</b>, urutkan, lalu bawa ke sesi BK di ${esc(s.nama)}. Jangan lupa istikharah dan minta doa orang tua.</p></div></li>
    </ol>
    <div class="box"><div class="label">Arti tanda skor</div>
      <div class="pills"><span class="score">700.0</span><span class="hint">650 ke atas</span></div>
      <div class="pills"><span class="score mid">600.0</span><span class="hint">di bawah 650</span></div>
      <div class="pills"><span class="tag contoh">contoh</span><span class="hint">angka ilustrasi, belum data resmi</span></div>
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
  if (a === "kampus") return b ? viewKampusDetail(decodeURIComponent(b)) : viewKampus();
  if (a === "kedinasan") { q.kampus = { text: "", prov: "", jenis: "PTKN", ikatan: "" }; return viewKampus(); }
  if (a === "skor") return viewSkor();
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
  $("#app").innerHTML = '<div class="boot">Data aplikasi gagal dimuat. Muat ulang halaman, atau hubungi guru BK jika masalah berlanjut.</div>';
});
