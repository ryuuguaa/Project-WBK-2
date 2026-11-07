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

let users, products, hist, me, view = 'kasir', cat = 'Semua', cart = {}, method = 'Tunai', paidVal = 0, qris = '', stockLog = [], lastSi = '';

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
  users = users || [];
  const old = [await H('admin123'), await H('kasir123')];
  users = users.filter(x => !old.includes(x.h));
  if(!users.some(x => x.u === 'upsmkyadika')) users.unshift({u:'upsmkyadika', name:'Admin UP', role:'admin', h: await H('upsmkyadika123')});
  LS.set('kasir_users', users);
  products = LS.get('kasir_products', null);
  if(!products){ products = DEFAULTS.map((p, i) => ({...p, img:'', stock: p.cat === 'Makanan' ? null : 50})); LS.set('kasir_products', products); }
  hist = LS.get('kasir_hist', []);
  qris = LS.get('kasir_qris', '');
  stockLog = LS.get('kasir_stockin', []);
  me = LS.get('kasir_me', null);
  if(me && me.role === 'pelanggan'){ me = null; LS.set('kasir_me', null); }
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

const tracked = p => typeof p.stock === 'number';
const stkLabel = p => !tracked(p) ? '' : `<small class="stk ${p.stock <= 0 ? 'out' : p.stock <= 5 ? 'low' : ''}">${p.stock <= 0 ? 'Stok habis' : 'Stok ' + p.stock}</small>`;
const prod = id => products.find(p => String(p.id) === String(id));
const total = () => Object.keys(cart).reduce((s, id) => s + (prod(id) ? prod(id).price * cart[id] : 0), 0);

function render(){
  const tabs = [['kasir','Kasir'], ['riwayat','Riwayat']];
  if(me.role === 'admin'){ tabs.push(['stok','Stok']); tabs.push(['kelola','Kelola']); }
  $('#nav').innerHTML = tabs.map(t => `<button class="tab ${view===t[0]?'on':''}" data-tab="${t[0]}">${t[1]}</button>`).join('');
  $('#who').textContent = me.name;
  $('#view').classList.toggle('pos-on', view === 'kasir');
  document.body.classList.remove('sheet');
  if(view !== 'kasir' && view !== 'stok' && view !== 'kelola') camOff();
  if(view === 'kasir') viewKasir();
  else if(view === 'riwayat') viewRiwayat();
  else if(view === 'stok') viewStok();
  else viewKelola();
  $('#bar').hidden = view !== 'kasir';
}

/* ---------- KASIR ---------- */
function viewKasir(){
  const list = products.filter(p => cat === 'Semua' || p.cat === cat);
  $('#view').innerHTML = `<div class="pos">
    <section class="cat">
      <div class="scanrow"><input id="bc" autocomplete="off" autocapitalize="none" placeholder="Scan barcode atau ketik kode, lalu Enter"><button class="chip" data-act="cam">📷 Kamera</button></div>
      <div class="chips">${['Semua', ...CATS].map(c => `<button class="chip ${c===cat?'on':''}" data-cat="${c}">${c}</button>`).join('')}</div>
      <div class="grid">${list.map(p => `<button class="item" data-add="${p.id}" ${tracked(p) && p.stock <= 0 ? 'disabled' : ''}>
        <span class="ph">${p.img ? `<img src="${p.img}" alt="">` : (p.emoji || '📦')}</span>
        <b>${esc(p.name)}</b><span class="pr">${rp(p.price)}</span>${stkLabel(p)}</button>`).join('') || '<p class="mut">Belum ada produk di kategori ini.</p>'}</div>
    </section>
    <aside class="cart" id="cart"></aside></div>`;
  renderCart();
  if(matchMedia('(pointer:fine)').matches){ const b = $('#bc'); if(b) b.focus(); }
}

function addCart(id){
  const p = prod(id); if(!p) return false;
  const n = (cart[id] || 0) + 1;
  if(tracked(p) && n > p.stock){ toast(`Stok ${p.name} hanya ${p.stock}`); return false; }
  cart[id] = n; renderCart(); return true;
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
  for(const id of Object.keys(cart)){
    const p = prod(id);
    if(p && tracked(p) && cart[id] > p.stock){ toast(`Stok ${p.name} hanya ${p.stock}`); return; }
  }
  const items = Object.keys(cart).filter(id => prod(id)).map(id => { const p = prod(id); return {nama:p.name, kat:p.cat, harga:p.price, qty:cart[id]}; });
  const tx = {id:'TRX-' + Date.now().toString().slice(-7), t:new Date().toISOString(), kasir:me.name, method, items, total:t, paid, change:paid - t};
  Object.keys(cart).forEach(id => { const p = prod(id); if(p && tracked(p)) p.stock -= cart[id]; });
  LS.set('kasir_products', products);
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

/* ---------- EXCEL (rapi: lebar kolom, header hijau, format Rp & tanggal, filter, baris beku) ---------- */
function xlData(){
  const sold = {}, inn = {};
  hist.forEach(x => x.items.forEach(i => { sold[i.nama] = (sold[i.nama] || 0) + i.qty; }));
  stockLog.forEach(x => { inn[x.nama] = (inn[x.nama] || 0) + x.qty; });
  return {
    trx: hist.map(x => ({id:x.id, t:new Date(x.t), kasir:x.kasir, method:x.method, item:x.items.map(i => i.nama + ' x' + i.qty).join(', '), total:x.total, paid:x.paid, change:x.change})),
    det: hist.flatMap(x => x.items.map(i => ({id:x.id, t:new Date(x.t), nama:i.nama, kat:i.kat, harga:i.harga, qty:i.qty, sub:i.harga * i.qty}))),
    stok: products.map(p => { const tr = tracked(p); return {nama:p.name, code:p.code ? String(p.code) : '', kat:p.cat, harga:p.price, stok: tr ? p.stock : 'tidak dihitung', terjual:sold[p.name] || 0, masuk:inn[p.name] || 0, status: !tr ? 'Tidak dihitung' : p.stock <= 0 ? 'Habis' : p.stock <= 5 ? 'Menipis' : 'Aman', nilai: tr ? p.stock * p.price : 0}; }),
    masuk: stockLog.map(s => ({t:new Date(s.t), nama:s.nama, qty:s.qty, sebelum:s.sebelum, sesudah:s.sesudah, oleh:s.oleh}))
  };
}

const XL_FILE = () => 'riwayat-kasir-' + new Date().toISOString().slice(0, 10) + '.xlsx';

async function xlPretty(){
  const D = xlData(), wb = new ExcelJS.Workbook();
  wb.creator = 'Kasir Toko'; wb.created = new Date();
  const RP = '"Rp" #,##0', DT = 'dd/mm/yyyy hh:mm', LINE = {style:'thin', color:{argb:'FFE4E9E6'}};
  const fill = argb => ({type:'pattern', pattern:'solid', fgColor:{argb}});
  /* opt.sum = daftar kunci kolom yang dijumlah di baris TOTAL (rumus + hasil, supaya langsung tampil) */
  function sheet(name, cols, rows, opt = {}){
    const ws = wb.addWorksheet(name, {views:[{state:'frozen', ySplit:1}]});
    ws.columns = cols.map(c => ({header:c.h, key:c.k, width:Math.max(c.w, Math.ceil(c.h.length * 1.3) + 6)}));
    rows.forEach(r => ws.addRow(r));
    ws.eachRow((row, n) => {
      row.eachCell({includeEmpty:true}, (cell, ci) => {
        const c = cols[ci - 1]; if(!c) return;
        cell.border = {top:LINE, bottom:LINE, left:LINE, right:LINE};
        if(n === 1){
          cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
          cell.fill = fill('FF25A244');
          cell.alignment = {vertical:'middle', horizontal:'center', wrapText:true};
        }else{
          if(c.f) cell.numFmt = c.f;
          cell.alignment = {vertical:'top', wrapText:!!c.wrap, horizontal: c.f === RP || c.num ? 'right' : (c.f === DT ? 'center' : 'left')};
        }
      });
    });
    ws.getRow(1).height = 28;
    const last = rows.length + 1;
    ws.autoFilter = {from:{row:1, column:1}, to:{row:Math.max(last, 1), column:cols.length}};
    if(opt.sum && rows.length){
      const tot = {}; tot[cols[0].k] = 'TOTAL';
      if(opt.label) tot[opt.label.k] = opt.label.v;
      opt.sum.forEach(k => {
        const ci = cols.findIndex(c => c.k === k) + 1, L = String.fromCharCode(64 + ci);
        tot[k] = {formula:`SUM(${L}2:${L}${last})`, result:rows.reduce((a, r) => a + (typeof r[k] === 'number' ? r[k] : 0), 0)};
      });
      const r = ws.addRow(tot);
      r.eachCell({includeEmpty:true}, (cell, ci) => {
        const c = cols[ci - 1]; if(!c) return;
        cell.font = {bold:true}; cell.fill = fill('FFE8F6EC');
        cell.border = {top:{style:'medium', color:{argb:'FF25A244'}}, bottom:LINE, left:LINE, right:LINE};
        if(c.f && c.f !== DT) cell.numFmt = c.f;
        cell.alignment = {vertical:'middle', horizontal: c.f === RP || c.num ? 'right' : 'left'};
      });
    }
    return ws;
  }
  sheet('Transaksi', [
    {h:'ID', k:'id', w:14}, {h:'Waktu', k:'t', w:19, f:DT}, {h:'Kasir', k:'kasir', w:18}, {h:'Metode', k:'method', w:12},
    {h:'Item', k:'item', w:50, wrap:true}, {h:'Total', k:'total', w:16, f:RP}, {h:'Dibayar', k:'paid', w:16, f:RP}, {h:'Kembalian', k:'change', w:16, f:RP}
  ], D.trx, {sum:['total', 'paid', 'change'], label:{k:'item', v:D.trx.length + ' transaksi'}});
  sheet('Detail Item', [
    {h:'ID', k:'id', w:14}, {h:'Waktu', k:'t', w:19, f:DT}, {h:'Produk', k:'nama', w:30}, {h:'Kategori', k:'kat', w:14},
    {h:'Harga', k:'harga', w:14, f:RP}, {h:'Qty', k:'qty', w:8, num:true}, {h:'Subtotal', k:'sub', w:16, f:RP}
  ], D.det, {sum:['qty', 'sub']});
  const sb = sheet('Stok Barang', [
    {h:'Produk', k:'nama', w:30}, {h:'Barcode', k:'code', w:20, f:'@'}, {h:'Kategori', k:'kat', w:14}, {h:'Harga', k:'harga', w:14, f:RP},
    {h:'Stok Sekarang', k:'stok', w:16, num:true}, {h:'Total Terjual', k:'terjual', w:15, num:true}, {h:'Total Masuk', k:'masuk', w:14, num:true},
    {h:'Status', k:'status', w:16}, {h:'Nilai Stok', k:'nilai', w:16, f:RP}
  ], D.stok, {sum:['stok', 'terjual', 'masuk', 'nilai']});
  const WARN = {Habis:['FFFDE2E4', 'FFB4232F'], Menipis:['FFFFF1D6', 'FF9A5B00'], Aman:['FFE8F6EC', 'FF1A8F3C']};
  D.stok.forEach((x, i) => {
    const w = WARN[x.status]; if(!w) return;
    const c = sb.getRow(i + 2).getCell(8);
    c.fill = fill(w[0]); c.font = {bold:true, color:{argb:w[1]}}; c.alignment = {vertical:'top', horizontal:'center'};
  });
  sheet('Stok Masuk', [
    {h:'Waktu', k:'t', w:19, f:DT}, {h:'Produk', k:'nama', w:30}, {h:'Masuk', k:'qty', w:10, num:true},
    {h:'Stok Sebelum', k:'sebelum', w:14, num:true}, {h:'Stok Sesudah', k:'sesudah', w:14, num:true}, {h:'Oleh', k:'oleh', w:18}
  ], D.masuk, {sum:['qty']});
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download = XL_FILE(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* cadangan kalau ExcelJS gagal dimuat: tetap ada lebar kolom dan filter */
function xlPlain(){
  const D = xlData(), f = d => d.toLocaleString('id-ID'), wb = XLSX.utils.book_new();
  const add = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows), keys = rows.length ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map(k => ({wch: Math.min(60, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2)}));
    if(ws['!ref']) ws['!autofilter'] = {ref:ws['!ref']};
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Transaksi', D.trx.map(x => ({ID:x.id, Waktu:f(x.t), Kasir:x.kasir, Metode:x.method, Item:x.item, Total:x.total, Dibayar:x.paid, Kembalian:x.change})));
  add('Detail Item', D.det.map(x => ({ID:x.id, Waktu:f(x.t), Produk:x.nama, Kategori:x.kat, Harga:x.harga, Qty:x.qty, Subtotal:x.sub})));
  add('Stok Barang', D.stok.map(x => ({Produk:x.nama, Barcode:x.code, Kategori:x.kat, Harga:x.harga, 'Stok Sekarang':x.stok, 'Total Terjual':x.terjual, 'Total Masuk':x.masuk, Status:x.status, 'Nilai Stok':x.nilai})));
  add('Stok Masuk', D.masuk.map(x => ({Waktu:f(x.t), Produk:x.nama, Masuk:x.qty, 'Stok Sebelum':x.sebelum, 'Stok Sesudah':x.sesudah, Oleh:x.oleh})));
  XLSX.writeFile(wb, XL_FILE());
}

async function xl(){
  if(!hist.length && !stockLog.length) return toast('Belum ada data');
  if(window.ExcelJS){
    try{ return await xlPretty(); }catch(e){ console.error('ExcelJS gagal:', e); }
  }
  if(!window.XLSX) return toast('Library Excel belum termuat, cek koneksi internet');
  xlPlain();
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
      <label class="fld">Stok awal (kosong = tidak dihitung)<input id="ps" inputmode="numeric"></label>
      <div class="fld">Barcode (opsional)<div class="scanrow" style="margin:4px 0 0"><input id="pb" autocomplete="off" placeholder="scan atau ketik kode" style="width:auto;margin-top:0"><button type="button" class="chip" data-act="capnew">📷 Scan</button></div></div>
      <button class="btn" data-act="addp">Simpan produk</button></div>
    <div class="box2"><h3>Produk (${products.length})</h3>${products.map(p => `<div class="row"><span>${p.img ? '🖼️' : (p.emoji || '📦')} ${esc(p.name)}<br><small>${esc(p.cat)}, ${rp(p.price)}<br>${tracked(p) ? 'stok ' + p.stock : 'stok tidak dihitung'}${p.code ? '<br>barcode ' + esc(p.code) : ''}</small></span><span class="acts"><button class="del ed" data-bc="${p.id}">Barcode</button><button class="del ed" data-stk="${p.id}">Koreksi</button><button class="del" data-delp="${p.id}">Hapus</button></span></div>`).join('')}</div>
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
  const code = ($('#pb').value || '').trim();
  if(code && products.some(p => p.code === code)) return toast('Barcode itu sudah dipakai produk lain');
  const f = $('#pf').files[0], img = f ? await shrink(f) : '';
  const sv = $('#ps').value.trim();
  products.push({id:Date.now(), name:n, price:pr, cat:$('#pc').value, emoji:$('#pe').value.trim() || '📦', img, stock: sv === '' ? null : num(sv), code});
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
const mclose = () => { $('#modal').hidden = true; };

document.addEventListener('click', e => {
  if(e.target.id === 'modal') return mclose();
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  if(d.tab){ view = d.tab; render(); }
  else if(d.cat){ cat = d.cat; viewKasir(); }
  else if(d.add) addCart(d.add);
  else if(d.inc) addCart(d.inc);
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
  else if(d.act === 'addstock') addStock();
  else if(d.stk) editStock(d.stk);
  else if(d.act === 'cam'){ scanTarget = null; camOn(); }
  else if(d.act === 'camoff') camOff();
  else if(d.act === 'capnew'){ scanTarget = {input:'pb'}; camOn('produk baru'); }
  else if(d.act === 'bcman') bcManual();
  else if(d.bc) bcFor(d.bc);
  else if(d.act === 'addp') addP();
  else if(d.act === 'addu') addU();
  else if(d.act === 'logout'){ camOff(); me = null; cart = {}; paidVal = 0; LS.set('kasir_me', null); start(); }
});

/* ---------- STOK MASUK ---------- */
function viewStok(){
  $('#view').innerHTML = `<div class="page"><h2>Stok barang</h2>
    <div class="box2"><h3>Barang masuk</h3>
      <p class="mut" style="margin:0">Pilih produk dan isi jumlah yang masuk. Stok bertambah, lalu berkurang otomatis setiap ada penjualan. Scan barcode untuk memilih produk.</p>
      <div class="scanrow" style="margin-top:10px"><input id="bc" autocomplete="off" placeholder="Scan barcode atau ketik kode, lalu Enter"><button class="chip" data-act="cam">📷 Kamera</button></div>
      <label class="fld">Produk<select id="si">${products.map(p => `<option value="${p.id}">${esc(p.name)} (${tracked(p) ? 'stok ' + p.stock : 'stok tidak dihitung'})</option>`).join('')}</select></label>
      <label class="fld">Jumlah masuk<input id="sq" inputmode="numeric" placeholder="0"></label>
      <button class="btn" data-act="addstock">Tambah stok</button></div>
    <div class="box2"><h3>Stok saat ini</h3>${products.map(p => `<div class="row"><span>${esc(p.name)}<br><small>${esc(p.cat)}</small></span>
      <span style="display:flex;align-items:center;gap:8px"><b class="${tracked(p) && p.stock <= 5 ? (p.stock <= 0 ? 'bad' : 'warn') : ''}">${tracked(p) ? p.stock : '-'}</b><button class="del ed" data-stk="${p.id}">Koreksi</button></span></div>`).join('') || '<p class="mut">Belum ada produk.</p>'}</div>
    <div class="box2"><h3>Barang masuk terakhir</h3>${stockLog.slice(0, 15).map(s => `<div class="row"><span>${esc(s.nama)}<br><small>${new Date(s.t).toLocaleString('id-ID')}, oleh ${esc(s.oleh)}</small></span><b>+${s.qty}</b></div>`).join('') || '<p class="mut">Belum ada barang masuk.</p>'}</div></div>`;
  if(lastSi && prod(lastSi)) $('#si').value = lastSi;
}

function addStock(){
  const id = $('#si').value, q = num($('#sq').value), p = prod(id);
  if(!p || !q) return toast('Pilih produk dan isi jumlah masuk');
  const before = tracked(p) ? p.stock : 0;
  p.stock = before + q; lastSi = p.id;
  LS.set('kasir_products', products);
  stockLog.unshift({t:new Date().toISOString(), nama:p.name, qty:q, sebelum:before, sesudah:p.stock, oleh:me.name});
  stockLog = stockLog.slice(0, 1000); LS.set('kasir_stockin', stockLog);
  toast(`${p.name}: stok jadi ${p.stock}`); render();
}

/* ---------- EDIT STOK & BARCODE ---------- */
function editStock(id){
  const p = prod(id); if(!p) return;
  const v = prompt(`Stok ${p.name} (kosongkan = tidak dihitung)`, tracked(p) ? p.stock : '');
  if(v === null) return;
  p.stock = v.trim() === '' ? null : num(v);
  LS.set('kasir_products', products); render();
}


/* ---------- BARCODE ---------- */
let scanTarget = null, scanStop = null, scanLast = '', scanAt = 0, camTok = 0;
const findCode = c => products.find(p => p.code && String(p.code).trim() === c);

function beep(ok){
  try{
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = ok ? 880 : 200; g.gain.value = .08;
    o.start(); o.stop(a.currentTime + .12); setTimeout(() => a.close(), 400);
  }catch(e){}
  if(navigator.vibrate) navigator.vibrate(ok ? 40 : [60, 40, 60]);
}

function flash(cls, name, sub){
  const w = $('#scanwin'); if(!w || w.hidden) return;
  w.classList.remove('ok', 'bad'); void w.offsetWidth; w.classList.add(cls);
  if($('#sn')) $('#sn').textContent = name;
  if($('#ss')) $('#ss').textContent = sub || '';
  setTimeout(() => w.classList.remove('ok', 'bad'), 700);
}

function scanCode(raw, fromCam){
  const c = String(raw || '').trim(); if(!c) return;
  const now = Date.now();
  if(fromCam && c === scanLast && now - scanAt < 1800) return;
  scanLast = c; scanAt = now;
  if(scanTarget) return capture(c);
  const p = findCode(c), camOpen = !$('#scanwin').hidden;
  if(!p){ beep(false); flash('bad', 'Tidak terdaftar', c); toast('Barcode belum terdaftar: ' + c); return; }
  if(view === 'stok'){
    const sel = $('#si'); if(sel){ sel.value = p.id; lastSi = p.id; }
    const q = $('#sq'); if(q && !camOpen) q.focus();
    beep(true); flash('ok', p.name, 'Isi jumlah masuk'); if(!camOpen) toast(p.name + ' dipilih'); return;
  }
  if(view !== 'kasir'){ toast('Buka tab Kasir atau Stok untuk scan'); return; }
  if(addCart(p.id)){ beep(true); flash('ok', p.name, rp(p.price) + ' x' + cart[p.id]); if(!camOpen) toast(p.name + ' ditambahkan'); }
  else{ beep(false); flash('bad', p.name, 'Stok habis'); }
}

function capture(c){
  const t = scanTarget, dup = products.find(p => p.code === c && (!t.id || String(p.id) !== String(t.id)));
  if(dup){ beep(false); flash('bad', 'Sudah dipakai', dup.name); toast('Barcode itu sudah dipakai ' + dup.name); return; }
  beep(true); scanTarget = null;
  if(t.input){ const i = $('#' + t.input); if(i) i.value = c; toast('Barcode terbaca: ' + c); }
  else{ const p = prod(t.id); if(p){ p.code = c; LS.set('kasir_products', products); toast(p.name + ': barcode ' + c); render(); } }
  camOff();
}

function bcFor(id){ const p = prod(id); if(!p) return; scanTarget = {id:p.id}; camOn(p.name); }

function bcManual(){
  const t = scanTarget; if(!t) return;
  const p = t.id ? prod(t.id) : null;
  const v = prompt('Ketik atau scan kode barcode' + (p ? ' untuk ' + p.name + ' (kosongkan = hapus barcode)' : ''));
  if(v === null){ camOff(); return; }
  const c = v.trim();
  if(c) return capture(c);
  if(p){ delete p.code; LS.set('kasir_products', products); toast('Barcode ' + p.name + ' dihapus'); camOff(); render(); }
  else camOff();
}

const loadZX = () => window.ZXing ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  s.onload = ok; s.onerror = () => no(new Error('zx')); document.head.appendChild(s);
});

function camOff(keep){
  camTok++;
  if(scanStop){ try{ scanStop(); }catch(e){} scanStop = null; }
  const w = $('#scanwin'); if(w){ w.hidden = true; w.innerHTML = ''; w.className = ''; }
  if(!keep) scanTarget = null;
}

async function camOn(label){
  camOff(true); const my = camTok, w = $('#scanwin');
  w.hidden = false;
  w.innerHTML = `<div class="vwrap"><video id="sv" playsinline muted></video></div>
    <div class="sinfo"><b id="sn">${scanTarget ? 'Scan barcode ' + esc(label || 'produk') : 'Arahkan ke barcode'}</b><small id="ss" class="mut"></small>
    <div class="acts2">${scanTarget ? '<button class="chip" data-act="bcman">Ketik manual</button>' : ''}<button class="chip" data-act="camoff">Tutup</button></div></div>`;
  const v = $('#sv');
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    if('BarcodeDetector' in window){
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code'];
      let ok = want; try{ const sup = await BarcodeDetector.getSupportedFormats(); ok = want.filter(f => sup.includes(f)); }catch(e){}
      const det = new BarcodeDetector({formats:ok});
      const st = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
      if(my !== camTok){ st.getTracks().forEach(t => t.stop()); return; }
      v.srcObject = st; await v.play();
      let busy = false;
      const tm = setInterval(async () => {
        if(busy || v.readyState < 2) return; busy = true;
        try{ const r = await det.detect(v); if(r.length) scanCode(r[0].rawValue, true); }catch(e){}
        busy = false;
      }, 200);
      scanStop = () => { clearInterval(tm); st.getTracks().forEach(t => t.stop()); };
    }else{
      await loadZX();
      if(my !== camTok) return;
      const rd = new ZXing.BrowserMultiFormatReader();
      rd.decodeFromVideoDevice(null, 'sv', r => { if(r) scanCode(r.getText(), true); });
      scanStop = () => rd.reset();
    }
  }catch(e){
    if(my !== camTok) return;
    const t = scanTarget; camOff(true);
    toast(e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini.' : 'Kamera tidak bisa dibuka. Pakai kolom ketik atau scanner USB.');
    if(t){ scanTarget = t; bcManual(); }
  }
}

document.addEventListener('keydown', e => {
  if(e.target.id === 'bc' && e.key === 'Enter'){ e.preventDefault(); const v = e.target.value; e.target.value = ''; scanCode(v); return; }
  if((view === 'kasir' || view === 'stok') && $('#modal').hidden && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)){
    const b = $('#bc'); if(b) b.focus();
  }
});

window.addEventListener('load', init); 
