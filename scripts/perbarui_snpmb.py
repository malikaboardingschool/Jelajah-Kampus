# Memperbarui data resmi daya tampung & peminat dari snpmb.id (data publik SNPMB).
#
# Jalankan dari folder proyek:  python3 scripts/perbarui_snpmb.py
#
# Hasil:
#   data/snpmb_ptn.csv   -> daftar PTN SNPMB beserta kampus_id di aplikasi (kolom kampus_id boleh diedit)
#   data/snpmb_prodi.csv -> prodi resmi per PTN: daya tampung tahun berjalan + riwayat 5 tahun
#
# PTN baru yang belum punya kampus_id ditandai "BARU-..." dan perlu ditambahkan ke data/kampus.csv.
# Kolom prodi_katalog di snpmb_prodi.csv (isian manual) dipertahankan saat diperbarui.
import csv, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
H = {"User-Agent": "Mozilla/5.0 (Jelajah Kampus SMA Malika IBS)", "Referer": "https://snpmb.id/utbk-snbt/daya-tampung-snbt"}

def get(url):
    err = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            err = e; time.sleep(2)
    raise err

def read_csv(name):
    p = os.path.join(DATA, name)
    if not os.path.exists(p): return []
    with open(p, encoding="utf-8-sig") as f: return list(csv.DictReader(f))

def judul(s):
    kecil = {"dan", "di", "ke", "untuk", "dengan"}
    s = " ".join(w if w in kecil else w.capitalize() for w in s.lower().split())
    s = re.sub(r"\((\w)", lambda m: "(" + m.group(1).upper(), s)
    for a in ["Uin", "Isi", "Isbi", "Upn", "Pens", "Ppns", "K3", "Sdm", "Ti", "Ui", "Ux", "Ppkn", "Pgsd", "Paud", "Ipa", "Ips"]:
        s = re.sub(rf"\b{a}\b", a.upper(), s)
    return s.replace('"', "")

def main():
    lama_ptn = {r["id_ptn"]: r["kampus_id"] for r in read_csv("snpmb_ptn.csv")}
    lama_katalog = {r["kode_prodi"]: r.get("prodi_katalog", "") for r in read_csv("snpmb_prodi.csv")}
    ptn = get("https://snpmb.id/proxy-ptn-sb.php")
    print(f"{len(ptn)} PTN ditemukan, mengunduh prodi…")
    baris_ptn, baris_prodi, tahun_set = [], [], set()
    for i, p in enumerate(ptn):
        kid = lama_ptn.get(str(p["id_ptn"])) or f"BARU-{p['id_ptn']}"
        baris_ptn.append([p["id_ptn"], kid, p["nama"].strip(), p["is_ptnbh"], p["is_vokasi"], p["is_ptkin"], (p["web"] or "").strip()])
        for r in get(f"https://snpmb.id/proxy-prodi-sb.php?ptn={p['id_ptn']}"):
            h = {x["tahun"]: x for x in r.get("history_daya_tampung") or []}
            tahun_set.update(h.keys())
            baris_prodi.append((kid, r, h))
        if i % 20 == 0: print(f"  {i + 1}/{len(ptn)} {p['nama']}", flush=True)
        time.sleep(0.4)  # beri jeda agar tidak membebani server SNPMB
    TH = sorted(tahun_set)[-5:]  # 5 tahun riwayat terakhir
    with open(os.path.join(DATA, "snpmb_ptn.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id_ptn", "kampus_id", "nama_snpmb", "ptnbh", "vokasi", "ptkin", "laman_pmb"]); w.writerows(baris_ptn)
    with open(os.path.join(DATA, "snpmb_prodi.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, lineterminator="\n")
        # Nama kolom memakai urutan 5 tahun terakhir; build membaca kolom dt_<tahun>/peminat_<tahun>.
        w.writerow(["kampus_id", "kode_prodi", "nama_resmi", "jenjang", "portofolio", "daya_tampung_2026"] + [f"{k}_{t}" for t in TH for k in ("dt", "peminat")] + ["prodi_katalog"])
        for kid, r, h in baris_prodi:
            row = [kid, r["kode_prodi"], judul(r["nama"]), r["jenjang"], "" if r["nama_portofolio"] == "Tidak Ada" else r["nama_portofolio"], r["daya_tampung_snbt"] or ""]
            for t in TH: row += [h.get(t, {}).get("daya_tampung") or "", h.get(t, {}).get("peminat") or ""]
            w.writerow(row + [lama_katalog.get(str(r["kode_prodi"]), "")])
    baru = [b for b in baris_ptn if b[1].startswith("BARU-")]
    print(f"Selesai: {len(baris_prodi)} prodi dari {len(ptn)} PTN. Riwayat tahun: {TH[0]}–{TH[-1]}.")
    if baru:
        print(f"{len(baru)} PTN baru perlu kampus_id di data/snpmb_ptn.csv dan baris di data/kampus.csv:")
        for b in baru: print("  -", b[2])

if __name__ == "__main__":
    main()
