/* Pemesanan pelanggan (ala ShopeeFood), login pelanggan, dan kelola pesanan admin */
let orders = LS.get('kasir_orders', []), customers = LS.get('kasir_customers', []);
let loginMode = 'pel', pq = '', pcat = 'Semua', ccart = {}, pnote = '', pend = 'Tunai';
const ST = {baru:'Menunggu', proses:'Diproses', siap:'Siap diambil', selesai:'Sudah diambil', batal:'Dibatalkan'};
const NEXT = {baru:'proses', proses:'siap', siap:'selesai'};
const NXL = {baru:'Proses pesanan', proses:'Tandai siap diambil', siap:'Sudah diambil'};
const EMO = {Semua:'🍽️', Makanan:'🍛', Minuman:'🧋', 'Alat Tulis':'✏️'};
const saveO = () => LS.set('kasir_orders', orders);
const fdt = iso => new Date(iso).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
const live = o => o.status !== 'selesai' && o.status !== 'batal';

/* ---------- login pelanggan ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lm]'); if(!b) return;
  loginMode = b.dataset.lm;
  document.querySelectorAll('[data-lm]').forEach(x => x.classList.toggle('on', x === b));
  $('#kw').hidden = loginMode !== 'pel'; $('#pw').hidden = loginMode === 'pel'; $('#le').textContent = '';
});

document.addEventListener('submit', e => {
  if(e.target.id !== 'lf' || loginMode !== 'pel') return;
  e.preventDefault(); e.stopPropagation();
  const raw = $('#lu').value.trim(), u = raw.toLowerCase(), kelas = $('#lk').value.trim();
  if(!raw || !kelas){ $('#le').textContent = 'Isi username dan kelas.'; return; }
  if(users.some(x => x.u === u)){ $('#le').textContent = 'Username ini dipakai admin/karyawan, pilih yang lain.'; return; }
  const now = new Date().toISOString();
  let c = customers.find(x => x.u === u);
  if(!c){ c = {u, name:raw, kelas, created:now, n:0, logins:[]}; customers.push(c); }
  c.kelas = kelas; c.last = now; c.n = (c.n || 0) + 1; c.logins.unshift(now); c.logins = c.logins.slice(0, 50);
  LS.set('kasir_customers', customers);
  me = {u, name:c.name, role:'pelanggan', kelas}; LS.set('kasir_me', me);
  ccart = {}; $('#lf').reset(); $('#le').textContent = '';
  start();
}, true);

/* ---------- tampilan pelanggan ---------- */
const _render = render;
render = function(){ if(me.role === 'pelanggan') return renderPel(); _render(); };

function renderPel(){
  if(view !== 'menu' && view !== 'pesanan') view = 'menu';
  $('#nav').innerHTML = [['menu','Menu'], ['pesanan','Pesanan saya']].map(t => `<button class="tab ${view === t[0] ? 'on' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('');
  $('#who').textContent = me.name + ', ' + me.kelas;
  $('#view').classList.remove('pos-on'); $('#bar').hidden = true;
  if(view === 'menu') viewMenu(); else viewMine();
}

function viewMenu(){
  $('#view').innerHTML = `<div class="page" style="padding-bottom:90px"><input class="search" id="pq" placeholder="Mau pesan apa hari ini?" value="${esc(pq)}">
    <div class="chips">${['Semua', ...CATS].map(c => `<button class="chip ${c === pcat ? 'on' : ''}" data-pc="${c}">${EMO[c] || ''} ${c}</button>`).join('')}</div>
    <div id="mlist"></div></div><button class="cbar" id="cbar" data-pa="co" hidden></button>`;
  mlist(); cbar();
}

function mlist(){
  const l = products.filter(p => (pcat === 'Semua' || p.cat === pcat) && p.name.toLowerCase().includes(pq.toLowerCase()));
  $('#mlist').innerHTML = l.map(p => {
    const out = tracked(p) && p.stock <= 0, q = ccart[p.id] || 0;
    return `<div class="mi ${out ? 'off' : ''}"><span class="ph">${p.img ? `<img src="${p.img}" alt="">` : (p.emoji || '📦')}</span>
      <div class="mt2"><b>${esc(p.name)}</b><span class="pr">${rp(p.price)}</span>${stkLabel(p)}</div>
      ${out ? '<span class="stk out">Habis</span>' : q ? `<div class="qty"><button data-pm="${p.id}">−</button><span>${q}</span><button data-pp="${p.id}">+</button></div>` : `<button class="addb" data-pp="${p.id}">Tambah</button>`}</div>`;
  }).join('') || '<p class="mut">Menu tidak ditemukan.</p>';
}

function cinfo(){
  const ids = Object.keys(ccart).filter(id => prod(id));
  return {ids, n: ids.reduce((s, id) => s + ccart[id], 0), t: ids.reduce((s, id) => s + prod(id).price * ccart[id], 0)};
}

function cbar(){
  const b = $('#cbar'); if(!b) return;
  const c = cinfo(); b.hidden = !c.n; b.innerHTML = `<span>🛒 ${c.n} item</span><span>${rp(c.t)}</span>`;
}

function padd(id, d){
  const p = prod(id); if(!p) return;
  const n = (ccart[id] || 0) + d;
  if(n <= 0) delete ccart[id];
  else if(tracked(p) && n > p.stock) return toast(`Stok ${p.name} hanya ${p.stock}`);
  else ccart[id] = n;
  mlist(); cbar();
  if(!$('#modal').hidden) checkout();
}

function checkout(){
  const c = cinfo(); if(!c.n){ mclose(); return; }
  modal(`<h3>Pesanan kamu</h3><small>Diambil di UP, bayar saat ambil</small>
    <div class="rcp">${c.ids.map(id => `<div><span>${esc(prod(id).name)}</span><span class="qty"><button data-pm="${id}">−</button><span>${ccart[id]}</span><button data-pp="${id}">+</button></span></div>`).join('')}</div>
    <label class="fld">Catatan (opsional)<input id="pn2" maxlength="80" placeholder="mis. tanpa es" value="${esc(pnote)}"></label>
    <div class="meth" style="margin-top:10px">${['Tunai', 'QRIS'].map(m => `<button class="chip ${m === pend ? 'on' : ''}" data-pay="${m}">${m}</button>`).join('')}</div>
    <div class="tot"><span>Total</span><strong>${rp(c.t)}</strong></div>
    <button class="btn" data-pa="order">Pesan sekarang</button><button class="btn sec" data-act="mclose">Tutup</button>`);
}

function placeOrder(){
  const c = cinfo(); if(!c.n) return;
  for(const id of c.ids){ const p = prod(id); if(tracked(p) && ccart[id] > p.stock) return toast(`Stok ${p.name} hanya ${p.stock}`); }
  const seq = LS.get('kasir_seq', 0) + 1; LS.set('kasir_seq', seq);
  const now = new Date().toISOString();
  const o = {id:'UP-' + String(seq).padStart(4, '0'), t:now, user:me.u, name:me.name, kelas:me.kelas, note:pnote.trim(), pay:pend, total:c.t, status:'baru', log:[{s:'baru', t:now}],
    items:c.ids.map(id => { const p = prod(id); return {id:p.id, nama:p.name, kat:p.cat, harga:p.price, qty:ccart[id]}; })};
  c.ids.forEach(id => { const p = prod(id); if(tracked(p)) p.stock -= ccart[id]; });
  LS.set('kasir_products', products); orders.unshift(o); saveO();
  ccart = {}; pnote = ''; view = 'pesanan'; mclose(); render(); proof(o.id);
}

function proof(id){
  const o = orders.find(x => x.id === id); if(!o) return;
  modal(`<h3 style="text-align:center">Bukti pesanan</h3><p class="mut" style="text-align:center;margin:0">UP SMK Yadika</p>
    <div class="code">${o.id}</div><div style="text-align:center"><span class="mt">${ST[o.status]}</span></div>
    <div class="rcp"><div><span>Nama</span><b>${esc(o.name)}</b></div><div><span>Kelas</span><b>${esc(o.kelas)}</b></div><div><span>Waktu</span><span>${fdt(o.t)}</span></div>
    ${o.items.map(i => `<div><span>${esc(i.nama)} x${i.qty}</span><span>${rp(i.harga * i.qty)}</span></div>`).join('')}
    <div><b>Total</b><b>${rp(o.total)}</b></div><div><span>Bayar</span><span>${o.pay}, saat ambil</span></div>${o.note ? `<div><span>Catatan</span><span>${esc(o.note)}</span></div>` : ''}</div>
    <p class="mut" style="text-align:center;margin:0 0 8px">Tunjukkan bukti ini ke petugas UP saat mengambil pesanan.</p><button class="btn" data-act="mclose">Tutup</button>`);
}

function viewMine(){
  const l = orders.filter(o => o.user === me.u);
  $('#view').innerHTML = `<div class="page"><h2>Pesanan saya</h2>${l.map(o => `<div class="box2" data-po="${o.id}" style="cursor:pointer">
    <div style="display:flex;justify-content:space-between;gap:8px"><b>${o.id}</b><span class="mt">${ST[o.status]}</span></div><small>${fdt(o.t)}</small>
    <div>${o.items.map(i => esc(i.nama) + ' x' + i.qty).join(', ')}</div><strong>${rp(o.total)}</strong></div>`).join('') || '<p class="mut">Belum ada pesanan. Pilih menu di tab Menu.</p>'}</div>`;
}

/* ---------- admin / karyawan ---------- */
function viewPesanan(){
  const l = [...orders.filter(live), ...orders.filter(o => !live(o))];
  $('#view').innerHTML = `<div class="page"><h2>Pesanan online</h2>${l.map(o => `<div class="box2">
    <div style="display:flex;justify-content:space-between;gap:8px"><b>${o.id}</b><span class="mt">${ST[o.status]}</span></div>
    <small>${esc(o.name)}, kelas ${esc(o.kelas)}, ${fdt(o.t)}</small>
    <div>${o.items.map(i => esc(i.nama) + ' x' + i.qty).join(', ')}</div>${o.note ? `<small>Catatan: ${esc(o.note)}</small>` : ''}
    <div><strong>${rp(o.total)}</strong> <small>(${o.pay}, saat ambil)</small></div>
    ${live(o) ? `<button class="btn" data-os="${o.id}" data-to="${NEXT[o.status]}">${NXL[o.status]}</button><button class="btn sec" data-ox="${o.id}">Batalkan</button>` : ''}</div>`).join('') || '<p class="mut">Belum ada pesanan masuk.</p>'}</div>`;
}

function viewPelanggan(){
  const l = [...customers].sort((a, b) => a.last < b.last ? 1 : -1);
  $('#view').innerHTML = `<div class="page"><h2>Pelanggan (${l.length})</h2>${l.map(c => `<div class="row"><span><b>${esc(c.name)}</b><br><small>Kelas ${esc(c.kelas)}, login ${c.n || c.logins.length}x, terakhir ${fdt(c.last)}</small></span><span class="mt">${orders.filter(o => o.user === c.u).length} pesanan</span></div>`).join('') || '<p class="mut">Belum ada pelanggan yang login.</p>'}</div>`;
}

function ostat(id, to){
  const o = orders.find(x => x.id === id); if(!o || !live(o)) return;
  if(to === 'batal'){
    if(!confirm('Batalkan pesanan ini? Stok dikembalikan.')) return;
    o.items.forEach(i => { const p = prod(i.id); if(p && tracked(p)) p.stock += i.qty; });
    LS.set('kasir_products', products);
  }
  const now = new Date().toISOString();
  o.status = to; o.log.push({s:to, t:now});
  if(to === 'selesai'){
    hist.unshift({id:o.id, t:now, kasir:'Pesanan online', method:o.pay, items:o.items.map(i => ({nama:i.nama, kat:i.kat, harga:i.harga, qty:i.qty})), total:o.total, paid:o.total, change:0});
    LS.set('kasir_hist', hist);
  }
  saveO(); render();
}

/* ---------- event ---------- */
document.addEventListener('input', e => {
  if(e.target.id === 'pq'){ pq = e.target.value; mlist(); }
  else if(e.target.id === 'pn2') pnote = e.target.value;
});

document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-po]'); if(!b) return;
  const d = b.dataset;
  if(d.pc){ pcat = d.pc; viewMenu(); }
  else if(d.pp) padd(d.pp, 1);
  else if(d.pm) padd(d.pm, -1);
  else if(d.pa === 'co') checkout();
  else if(d.pa === 'order') placeOrder();
  else if(d.po) proof(d.po);
  else if(d.pay){ pend = d.pay; checkout(); }
  else if(d.os) ostat(d.os, d.to);
  else if(d.ox) ostat(d.ox, 'batal');
});