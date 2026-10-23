window.addEventListener("error", e => { const b = document.getElementById("err"); if(b){ b.textContent = "Error: " + e.message; b.hidden = false; } });
window.addEventListener("unhandledrejection", e => { const b = document.getElementById("err"); if(b){ b.textContent = "Error: " + (e.reason && e.reason.message || e.reason); b.hidden = false; } });

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const num = s => parseInt(String(s).replace(/\D/g, '')) || 0;
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ toast('Gagal menyimpan data'); } }
};
let _tt;
function toast(m){ const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(_tt); _tt = setTimeout(() => t.hidden = true, 2400); }

const CATS = ['Makanan', 'Minuman', 'Alat Tulis'];
const METHODS = ['Tunai', 'QRIS', 'Debit', 'Transfer', 'E-Wallet'];
const DEFAULTS = [
  {id:1, name:'Nasi Goreng', price:18000, cat:'Makanan', emoji:'🍛'},
  {id:2, name:'Mie Ayam', price:15000, cat:'Makanan', emoji:'🍜'},
  {id:3, name:'Roti Bakar', price:12000, cat:'Makanan', emoji:'🍞'},
  {id:4, name:'Es Teh Manis', price:5000, cat:'Minuman', emoji:'🧋'},
  {id:5, name:'Kopi Susu', price:15000, cat:'Minuman', emoji:'☕'},
  {id:6, name:'Air Mineral', price:4000, cat:'Minuman', emoji:'💧'},
  {id:7, name:'Pulpen', price:3000, cat:'Alat Tulis', emoji:'🖊️'},
  {id:8, name:'Buku Tulis', price:7000, cat:'Alat Tulis', emoji:'📓'},
  {id:9, name:'Penghapus', price:2000, cat:'Alat Tulis', emoji:'🧽'}
];

let users, products, hist, me, view = 'kasir', cat = 'Semua', cart = {}, method = 'Tunai', paidVal = 0, qris = '';

async function H(s){
  try{
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kasir:' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }catch(e){
    let h = 5381; for(const c of 'kasir:' + s) h = (h * 33) ^ c.charCodeAt(0);
    return 'f' + (h >>> 0);
  }
}

async function init(){
  users = LS.get('kasir_users', null);
  if(!users){
    users = [
      {u:'admin', name:'Admin', role:'admin', h: await H('admin123')},
      {u:'kasir', name:'Kasir 1', role:'kasir', h: await H('kasir123')}
    ];
    LS.set('kasir_users', users);
  }
  products = LS.get('kasir_products', null);
  if(!products){ products = DEFAULTS.map(p => ({...p, img:''})); LS.set('kasir_products', products); }
  hist = LS.get('kasir_hist', []);
  qris = LS.get('kasir_qris', '');
  me = LS.get('kasir_me', null);
  start();
}

function start(){
  $('#login').hidden = !!me;
  $('#app').hidden = !me;
  if(me){ view = 'kasir'; render(); }
}

$('#lf').addEventListener('submit', async e => {
  e.preventDefault();
  const u = $('#lu').value.trim().toLowerCase(), h = await H($('#lp').value);
  const f = users.find(x => x.u === u && x.h === h);
  if(!f){ $('#le').textContent = 'Username atau password salah.'; return; }
  me = {u:f.u, name:f.name, role:f.role}; LS.set('kasir_me', me);
  $('#lf').reset(); $('#le').textContent = '';
  start();
});

const prod = id => products.find(p => String(p.id) === String(id));
const total = () => Object.keys(cart).reduce((s, id) => s + (prod(id) ? prod(id).price * cart[id] : 0), 0);

function render(){
  const tabs = [['kasir','Kasir'], ['riwayat','Riwayat']];
  if(me.role === 'admin') tabs.push(['kelola','Kelola']);
  $('#nav').innerHTML = tabs.map(t => `<button class="tab ${view===t[0]?'on':''}" data-tab="${t[0]}">${t[1]}</button>`).join('');
  $('#who').textContent = me.name;
  $('#view').classList.toggle('pos-on', view === 'kasir');
  document.body.classList.remove('sheet');
  if(view === 'kasir') viewKasir();
  else if(view === 'riwayat') viewRiwayat();
  else viewKelola();
  $('#bar').hidden = view !== 'kasir';
}

/* ---------- KASIR ---------- */
function viewKasir(){
  const list = products.filter(p => cat === 'Semua' || p.cat === cat);
  $('#view').innerHTML = `<div class="pos">
    <section class="cat">
      <div class="chips">${['Semua', ...CATS].map(c => `<button class="chip ${c===cat?'on':''}" data-cat="${c}">${c}</button>`).join('')}</div>
      <div class="grid">${list.map(p => `<button class="item" data-add="${p.id}">
        <span class="ph">${p.img ? `<img src="${p.img}" alt="">` : (p.emoji || '📦')}</span>
        <b>${esc(p.name)}</b><span class="pr">${rp(p.price)}</span></button>`).join('') || '<p class="mut">Belum ada produk di kategori ini.</p>'}</div>
    </section>
    <aside class="cart" id="cart"></aside></div>`;
  renderCart();
}

function renderCart(){
  const ids = Object.keys(cart).filter(id => prod(id)), t = total();
  $('#cart').innerHTML = `
    <div class="chead"><h2>Pesanan</h2><button class="x" data-act="close" aria-label="Tutup">✕</button></div>
    <div>${ids.map(id => { const p = prod(id); return `<div class="ln">
      <div><b>${esc(p.name)}</b><small>${rp(p.price)}</small></div>
      <div class="qty"><button data-dec="${id}" aria-label="Kurangi">−</button><span>${cart[id]}</span><button data-inc="${id}" aria-label="Tambah">+</button></div>
      <div class="sub">${rp(p.price * cart[id])}</div></div>`; }).join('') || '<p class="mut">Ketuk produk untuk menambah pesanan.</p>'}</div>
    <div class="tot"><span>Total</span><strong>${rp(t)}</strong></div>
    <div class="meth">${METHODS.map(m => `<button class="chip ${m===method?'on':''}" data-m="${m}">${m}</button>`).join('')}</div>
    <div id="pay"></div>
    <button class="go" id="go" data-act="pay">Bayar</button>`;
  renderPay();
  const n = ids.reduce((s, id) => s + cart[id], 0);
  $('#bar').innerHTML = `<span>${n ? n + ' item' : 'Pesanan kosong'}</span><span>${rp(t)}</span>`;
}

function renderPay(){
  const el = $('#pay');
  if(method === 'Tunai'){
    el.innerHTML = `<label class="fld">Uang diterima<input id="paid" inputmode="numeric" autocomplete="off" placeholder="0" value="${paidVal ? paidVal.toLocaleString('id-ID') : ''}"></label>
      <div class="quick"><button data-q="0">Uang pas</button>${[20000, 50000, 100000].map(v => `<button data-q="${v}">${v/1000}rb</button>`).join('')}</div>
      <div class="chg" id="chg"></div>`;
  }else if(method === 'QRIS'){
    el.innerHTML = qris
      ? `<div class="qr"><button data-act="bigq" aria-label="Perbesar QRIS"><img src="${qris}" alt="QRIS toko"></button>
         <p class="mut">Pelanggan scan lalu bayar <b>${rp(total())}</b>. Tekan Bayar setelah pembayaran masuk. Ketuk QR untuk memperbesar.</p></div>`
      : `<p class="mut">QRIS toko belum diunggah. ${me.role === 'admin' ? 'Unggah di tab Kelola.' : 'Minta admin mengunggahnya di tab Kelola.'}</p>`;
  }else{
    el.innerHTML = `<p class="mut">Pastikan pembayaran sudah diterima, lalu tekan Bayar.</p>`;
  }
  updChg();
}

function updChg(){
  const t = total(), g = $('#go'); let ok = t > 0;
  if(method === 'Tunai'){
    const d = paidVal - t, c = $('#chg'); ok = t > 0 && d >= 0;
    if(c) c.innerHTML = t ? (d >= 0 ? `Kembalian <strong>${rp(d)}</strong>` : `Kurang <strong class="bad">${rp(-d)}</strong>`) : '';
  }
  if(g) g.disabled = !ok;
}

document.addEventListener('input', e => {
  if(e.target.id === 'paid'){
    paidVal = num(e.target.value);
    e.target.value = paidVal ? paidVal.toLocaleString('id-ID') : '';
    updChg();
  }
});

function pay(){
  const t = total(); if(!t) return;
  const paid = method === 'Tunai' ? paidVal : t; if(paid < t) return;
  const items = Object.keys(cart).filter(id => prod(id)).map(id => { const p = prod(id); return {nama:p.name, kat:p.cat, harga:p.price, qty:cart[id]}; });
  const tx = {id:'TRX-' + Date.now().toString().slice(-7), t:new Date().toISOString(), kasir:me.name, method, items, total:t, paid, change:paid - t};
  hist.unshift(tx); LS.set('kasir_hist', hist);
  cart = {}; paidVal = 0;
  render();
  modal(`<h3>Transaksi selesai</h3><small>${tx.id}</small>
    <div class="rcp">${items.map(i => `<div><span>${esc(i.nama)} x${i.qty}</span><span>${rp(i.harga * i.qty)}</span></div>`).join('')}</div>
    <div class="rcp" style="border-top:0;margin-top:-4px"><div><b>Total</b><b>${rp(tx.total)}</b></div><div><span>Metode</span><span>${tx.method}</span></div>
    <div><span>Dibayar</span><span>${rp(tx.paid)}</span></div><div><span>Kembalian</span><b>${rp(tx.change)}</b></div></div>
    <button class="btn" data-act="mclose">Transaksi baru</button>
    <button class="btn sec" data-act="xl">Unduh riwayat Excel</button>`);
}

/* ---------- RIWAYAT ---------- */
function viewRiwayat(){
  const today = new Date().toDateString();
  const tt = hist.filter(x => new Date(x.t).toDateString() === today);
  $('#view').innerHTML = `<div class="page"><h2>Riwayat transaksi</h2>
    <div class="sum"><div><small>Hari ini</small><strong>${rp(tt.reduce((s, x) => s + x.total, 0))}</strong></div><div><small>Transaksi hari ini</small><strong>${tt.length}</strong></div></div>
    <button class="btn sec" style="margin:0 0 12px" data-act="xl">Unduh semua ke Excel</button>
    ${hist.map(x => `<details class="tx"><summary><span><b>${x.id}</b><small>${new Date(x.t).toLocaleString('id-ID')}</small></span><span class="mt">${x.method}</span><strong>${rp(x.total)}</strong></summary>
      <div class="det"><ul>${x.items.map(i => `<li>${esc(i.nama)} x${i.qty} — ${rp(i.harga * i.qty)}</li>`).join('')}</ul>
      Kasir: ${esc(x.kasir)}<br>Dibayar ${rp(x.paid)}, kembalian ${rp(x.change)}</div></details>`).join('') || '<p class="mut">Belum ada transaksi. Riwayat muncul di sini setelah pembayaran pertama.</p>'}</div>`;
}

function xl(){
  if(!hist.length) return toast('Belum ada transaksi');
  if(!window.XLSX) return toast('Library Excel belum termuat, cek koneksi internet');
  const f = iso => new Date(iso).toLocaleString('id-ID');
  const a = hist.map(x => ({ID:x.id, Waktu:f(x.t), Kasir:x.kasir, Metode:x.method, Item:x.items.map(i => i.nama + ' x' + i.qty).join(', '), Total:x.total, Dibayar:x.paid, Kembalian:x.change}));
  const b = hist.flatMap(x => x.items.map(i => ({ID:x.id, Waktu:f(x.t), Produk:i.nama, Kategori:i.kat, Harga:i.harga, Qty:i.qty, Subtotal:i.harga * i.qty})));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a), 'Transaksi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b), 'Detail Item');
  XLSX.writeFile(wb, 'riwayat-kasir-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/* ---------- KELOLA (admin) ---------- */
function viewKelola(){
  $('#view').innerHTML = `<div class="page"><h2>Kelola toko</h2>
    <div class="box2"><h3>QRIS toko</h3>
      ${qris ? `<div class="qr"><img src="${qris}" alt="QRIS toko"></div>` : '<p class="mut">Belum ada QRIS. Unggah gambar QRIS toko (screenshot dari aplikasi bank atau e-wallet).</p>'}
      <label class="fld">Gambar QRIS<input id="qf" type="file" accept="image/*"></label>
      <button class="btn" data-act="saveq">Simpan QRIS</button>
      ${qris ? '<button class="btn sec" data-act="delq">Hapus QRIS</button>' : ''}</div>
    <div class="box2"><h3>Tambah produk</h3>
      <label class="fld">Nama produk<input id="pn"></label>
      <div class="two"><label class="fld">Harga<input id="pp" inputmode="numeric"></label>
      <label class="fld">Kategori<select id="pc">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label></div>
      <div class="two"><label class="fld">Emoji (jika tanpa foto)<input id="pe" maxlength="4" placeholder="🍛"></label>
      <label class="fld">Foto produk<input id="pf" type="file" accept="image/*"></label></div>
      <button class="btn" data-act="addp">Simpan produk</button></div>
    <div class="box2"><h3>Produk (${products.length})</h3>${products.map(p => `<div class="row"><span>${p.img ? '🖼️' : (p.emoji || '📦')} ${esc(p.name)}<br><small>${esc(p.cat)}, ${rp(p.price)}</small></span><button class="del" data-delp="${p.id}">Hapus</button></div>`).join('')}</div>
    <div class="box2"><h3>Tambah karyawan</h3>
      <label class="fld">Nama<input id="un"></label>
      <div class="two"><label class="fld">Username<input id="uu" autocapitalize="none"></label>
      <label class="fld">Password (min. 6 karakter)<input id="up" type="password"></label></div>
      <button class="btn" data-act="addu">Simpan karyawan</button></div>
    <div class="box2"><h3>Karyawan (${users.length})</h3>${users.map(u => `<div class="row"><span>${esc(u.name)}<br><small>${esc(u.u)}, ${u.role}</small></span>${u.u === me.u ? '' : `<button class="del" data-delu="${u.u}">Hapus</button>`}</div>`).join('')}</div></div>`;
}

function shrink(f, max = 260, q = .75){
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => {
        const s = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas');
        c.width = i.width * s; c.height = i.height * s;
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      i.onerror = () => res('');
      i.src = r.result;
    };
    r.readAsDataURL(f);
  });
}

async function saveQ(){
  const f = $('#qf').files[0]; if(!f) return toast('Pilih gambar QRIS dulu');
  const img = await shrink(f, 700, .92); if(!img) return toast('Gambar tidak bisa dibaca');
  qris = img; LS.set('kasir_qris', qris); toast('QRIS disimpan'); render();
}

function bigQ(){
  modal(`<div class="qr" style="margin-top:0"><img src="${qris}" alt="QRIS toko" style="max-width:100%"></div>
    <p style="text-align:center;margin:0 0 4px">Total <b>${rp(total())}</b></p>
    <button class="btn" data-act="mclose">Tutup</button>`);
}

async function addP(){
  const n = $('#pn').value.trim(), pr = num($('#pp').value);
  if(!n || !pr) return toast('Isi nama dan harga produk');
  const f = $('#pf').files[0], img = f ? await shrink(f) : '';
  products.push({id:Date.now(), name:n, price:pr, cat:$('#pc').value, emoji:$('#pe').value.trim() || '📦', img});
  LS.set('kasir_products', products); toast('Produk ditambahkan'); render();
}

async function addU(){
  const name = $('#un').value.trim(), u = $('#uu').value.trim().toLowerCase(), p = $('#up').value;
  if(!name || !u || p.length < 6) return toast('Isi nama, username, dan password (min. 6 karakter)');
  if(users.some(x => x.u === u)) return toast('Username sudah dipakai');
  users.push({u, name, role:'kasir', h: await H(p)});
  LS.set('kasir_users', users); toast('Karyawan ditambahkan'); render();
}

/* ---------- modal & klik ---------- */
function modal(h){ const m = $('#modal'); m.innerHTML = `<div class="box">${h}</div>`; m.hidden = false; }
const mclose = () => $('#modal').hidden = true;

document.addEventListener('click', e => {
  if(e.target.id === 'modal') return mclose();
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  if(d.tab){ view = d.tab; render(); }
  else if(d.cat){ cat = d.cat; viewKasir(); }
  else if(d.add){ cart[d.add] = (cart[d.add] || 0) + 1; renderCart(); }
  else if(d.inc){ cart[d.inc]++; renderCart(); }
  else if(d.dec){ if(--cart[d.dec] <= 0) delete cart[d.dec]; renderCart(); }
  else if(d.m){ method = d.m; renderCart(); }
  else if(d.q !== undefined){ paidVal = d.q === '0' ? total() : +d.q; renderPay(); }
  else if(d.delp){ if(confirm('Hapus produk ini?')){ products = products.filter(p => String(p.id) !== d.delp); delete cart[d.delp]; LS.set('kasir_products', products); render(); } }
  else if(d.delu){ if(confirm('Hapus karyawan ini?')){ users = users.filter(u => u.u !== d.delu); LS.set('kasir_users', users); render(); } }
  else if(d.act === 'open') document.body.classList.add('sheet');
  else if(d.act === 'close') document.body.classList.remove('sheet');
  else if(d.act === 'pay') pay();
  else if(d.act === 'mclose') mclose();
  else if(d.act === 'xl') xl();
  else if(d.act === 'saveq') saveQ();
  else if(d.act === 'delq'){ if(confirm('Hapus QRIS toko?')){ qris = ''; LS.set('kasir_qris', ''); render(); } }
  else if(d.act === 'bigq') bigQ();
  else if(d.act === 'addp') addP();
  else if(d.act === 'addu') addU();
  else if(d.act === 'logout'){ me = null; cart = {}; paidVal = 0; LS.set('kasir_me', null); start(); }
});

init();