// ===== 1. STATE: satu sumber kebenaran untuk seluruh tampilan =====
const state = {
  tugas: [],
  matkul: [],
  filter: "semua",
  kata: "",
  status: "loading", // "loading" | "ok" | "error"
  error: "",
};

const $ = (s) => document.querySelector(s);
const daftar = $("#daftar");

// ===== 2. HELPER api(): satu pintu untuk semua request =====
async function api(url, opsi = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opsi,
      headers: { "Content-Type": "application/json" },
      body: opsi.body ? JSON.stringify(opsi.body) : undefined,
    });
  } catch {
    // fetch hanya reject kalau jaringan gagal (offline), BUKAN untuk 400/500
    throw new Error("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
  }
  if (!res.ok) {
    // fetch tetap "sukses" untuk 4xx/5xx, jadi res.ok harus dicek manual
    let pesan = `Terjadi kesalahan di server (${res.status}).`;
    try { const data = await res.json(); if (data.error) pesan = data.error; } catch {}
    throw new Error(pesan);
  }
  return res.status === 204 ? null : res.json(); // 204 = tanpa body
}

// ===== 3. RENDER: gambar ulang UI dari state =====
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function tugasTampil() {
  return state.tugas.filter((t) => {
    const cocokFilter = state.filter === "semua" || (state.filter === "aktif" ? !t.selesai : t.selesai);
    const cocokCari = t.judul.toLowerCase().includes(state.kata.toLowerCase());
    return cocokFilter && cocokCari;
  });
}

function render() {
  const jumlah = $("#jumlah");
  if (state.status === "loading") {
    daftar.innerHTML = '<li class="skeleton"></li>'.repeat(3);
    jumlah.textContent = "Memuat…";
    return;
  }
  if (state.status === "error") {
    daftar.innerHTML = `<li class="status error">${esc(state.error)}<br><button id="coba-lagi">Coba lagi</button></li>`;
    jumlah.textContent = "";
    return;
  }
  jumlah.textContent = `${state.tugas.filter((t) => !t.selesai).length} tugas aktif`;
  const tampil = tugasTampil();
  if (tampil.length === 0) {
    daftar.innerHTML = `<li class="status">${state.tugas.length ? "Tidak ada tugas yang cocok." : "Belum ada tugas. Tambahkan tugas pertama di atas."}</li>`;
    return;
  }
  daftar.innerHTML = tampil.map((t) => `
    <li class="tugas ${t.selesai ? "selesai" : ""}" data-id="${t.id}">
      <input type="checkbox" data-aksi="selesai" ${t.selesai ? "checked" : ""} aria-label="Tandai selesai">
      <div class="isi">
        <span class="judul">${esc(t.judul)}</span>
        <span class="meta">${esc(t.matkul)}${t.deadline ? " · deadline " + esc(t.deadline) : ""}</span>
      </div>
      <button class="hapus" data-aksi="hapus" aria-label="Hapus tugas">✕</button>
    </li>`).join("");
}

function isiMatkul() {
  $("#matkul").innerHTML = state.matkul
    .map((m) => {
      const nama = typeof m === "string" ? m : (m.nama ?? m.name ?? m.matkul);
      return `<option>${esc(nama)}</option>`;
    })
    .join("");
}

// ===== 4. GET: muat tugas + matkul PARALEL dengan Promise.all =====
async function muat() {
  state.status = "loading";
  render();
  try {
    const [tugas, matkul] = await Promise.all([api("/api/tugas"), api("/api/matkul")]);
    state.tugas = tugas;
    state.matkul = matkul;
    isiMatkul();
    state.status = "ok";
  } catch (err) {
    state.status = "error";
    state.error = err.message;
  }
  render();
}
// ===== 5. POST: tambah tugas =====
$("#form-tugas").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tombol = $("#btn-tambah");
  const err = $("#form-error");
  err.hidden = true;
  tombol.disabled = true; // cegah klik ganda selama request berjalan
  tombol.textContent = "Mengirim…";
  try {
    const baru = await api("/api/tugas", {
      method: "POST",
      body: { judul: $("#judul").value, matkul: $("#matkul").value, deadline: $("#deadline").value },
    });
    state.tugas.push(baru); // state dari respons server
    $("#judul").value = "";
    $("#deadline").value = "";
    render();
  } catch (e2) {
    err.textContent = e2.message; // mis. "Judul minimal 3 karakter" (400)
    err.hidden = false;
  } finally {
    tombol.disabled = false; // finally: selalu jalan, sukses maupun gagal
    tombol.textContent = "Tambah";
  }
});
// ===== 6. PATCH & DELETE lewat EVENT DELEGATION (1 listener untuk semua item) =====
daftar.addEventListener("click", async (e) => {
  if (e.target.id === "coba-lagi") return muat();
  const aksi = e.target.dataset.aksi;
  if (aksi !== "hapus") return;
  const id = Number(e.target.closest(".tugas").dataset.id);
  e.target.disabled = true;
  try {
    await api(`/api/tugas/${id}`, { method: "DELETE" }); // 204: tidak ada body
    state.tugas = state.tugas.filter((t) => t.id !== id);
  } catch (err) {
    alert(err.message);
  }
  render();
});

daftar.addEventListener("change", async (e) => {
  if (e.target.dataset.aksi !== "selesai") return;
  const id = Number(e.target.closest(".tugas").dataset.id);
  const item = state.tugas.find((t) => t.id === id);
  const lama = item.selesai;
  item.selesai = e.target.checked; // BONUS optimistic update: ubah tampilan dulu
  render();
  try {
    const dariServer = await api(`/api/tugas/${id}`, { method: "PATCH", body: { selesai: item.selesai } });
    Object.assign(item, dariServer); // sinkronkan dengan respons server
  } catch (err) {
    item.selesai = lama; // dibatalkan kalau server gagal
    alert(err.message);
  }
  render();
});
// ===== 7. Filter, pencarian (BONUS debounce), dan mode jaringan =====
$("#filter").addEventListener("click", (e) => {
  if (!e.target.dataset.filter) return;
  state.filter = e.target.dataset.filter;
  document.querySelectorAll("#filter button").forEach((b) => b.classList.toggle("aktif", b === e.target));
  render();
});

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
$("#cari").addEventListener("input", debounce((e) => { state.kata = e.target.value; render(); }, 300));

$("#mode").addEventListener("change", (e) => __API.setMode(e.target.value));
  muat();