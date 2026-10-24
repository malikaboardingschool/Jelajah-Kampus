// Parser CSV kecil tanpa dependensi. Mendukung tanda kutip ("..."), koma/titik koma
// sebagai pemisah (dideteksi otomatis dari baris judul), dan BOM dari Excel.

export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== "")) rows.push(row);
  const header = rows.shift().map(h => h.trim().toLowerCase());
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function toCSV(rows, columns) {
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map(r => columns.map(c => q(r[c])).join(","))].join("\n") + "\n";
}

export function slug(s) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "a; b; c" -> ["a","b","c"]
export const list = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
