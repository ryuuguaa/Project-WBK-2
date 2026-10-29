/* sync.js: sinkronisasi antar perangkat lewat Firebase Realtime Database (REST, tanpa library) */
const DB_URL = 'https://upsmkyadika13-38061-default-rtdb.asia-southeast1.firebasedatabase.app';

(function(){
  if(!DB_URL) return;
  const base = DB_URL.replace(/\/+$/, ''), rawSet = LS.set.bind(LS);
  const url = p => base + '/' + p + '.json';
  /* awalan "_" supaya Firebase tidak mengubah kumpulan data ber-id angka menjadi array */
  const K = s => '_' + String(s).replace(/[.$#\[\]\/]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const J = v => JSON.stringify(v, (k, x) => x === null ? undefined : (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, i) => (o[i] = x[i], o), {}) : x));
  const byT = (a, b) => a.t < b.t ? 1 : -1;
  const norm = r => {
    if(!r) return {};
    if(!Array.isArray(r)) return r;
    const o = {}; r.forEach((v, i) => { if(v != null) o[i] = v; }); return o;
  };
  const COL = {
    kasir_products:{n:'products', get:() => products, set:v => { products = v; }, key:x => x.id, sort:(a, b) => a.id - b.id},
    kasir_orders:{n:'orders', get:() => orders, set:v => { orders = v; }, key:x => x.id, sort:byT},
    kasir_customers:{n:'customers', get:() => customers, set:v => { customers = v; }, key:x => x.u},
    kasir_hist:{n:'hist', get:() => hist, set:v => { hist = v; }, key:x => x.id, sort:byT},
    kasir_stockin:{n:'stockin', get:() => stockLog, set:v => { stockLog = v; }, key:x => x.t.replace(/\D/g, ''), sort:byT}
  };

  /* indikator status kecil di pojok kiri bawah */
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:2px;z-index:5;font:10px system-ui,sans-serif;padding:1px 8px;border-radius:999px;background:var(--card,#fff);border:1px solid var(--line,#ccc);pointer-events:none;opacity:.9';
  const setSt = (t, bad) => { badge.textContent = t; badge.style.color = bad ? 'var(--bad,#c0262d)' : 'var(--ok,#0f7b4d)'; };
  document.body.appendChild(badge); setSt('Menghubungkan...', false);

  const snap = {}; let pending = 0, ready = false, warned = false, dirty = false;
  const fail = e => {
    console.error('Sync error:', e);
    setSt('Offline: ' + ((e && e.message) || e), true);
    if(!warned){ warned = true; toast('Tidak terhubung ke database (' + ((e && e.message) || e) + '), data belum tersinkron'); }
  };
  const req = (m, p, b) => {
    pending++;
    return fetch(url(p), {method:m, body:b === undefined ? undefined : JSON.stringify(b)})
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(() => { pending--; });
  };
  const strip = o => { const c = {...o}; delete c.stock; return J(c); };

  /* kirim hanya data yang berubah; stok memakai increment atomik supaya dua perangkat tidak saling menimpa */
  function push(k){
    const c = COL[k]; if(!c || !ready) return;
    const s = snap[c.n] = snap[c.n] || {}, cur = {};
    (c.get() || []).forEach(x => { cur[K(c.key(x))] = x; });
    Object.keys(cur).forEach(id => {
      const a = cur[id], b = s[id];
      if(b && J(a) === J(b)) return;
      if(c.n === 'products' && b && strip(a) === strip(b) && typeof a.stock === 'number' && typeof b.stock === 'number')
        req('PATCH', c.n + '/' + id, {stock:{'.sv':{increment:a.stock - b.stock}}}).catch(fail);
      else req('PUT', c.n + '/' + id, a).catch(fail);
      s[id] = JSON.parse(J(a));
    });
    Object.keys(s).forEach(id => { if(!cur[id]){ req('DELETE', c.n + '/' + id).catch(fail); delete s[id]; } });
  }
  LS.set = (k, v) => { rawSet(k, v); push(k); };

  async function poll(){
    if(pending || me === undefined || !products) return;
    let d; try{ d = await req('GET', ''); }catch(e){ return fail(e); }
    if(pending) return;
    warned = false; setSt('Tersinkron', false); d = d || {};
    const first = !ready, seed = []; let changed = false;
    Object.entries(COL).forEach(([k, c]) => {
      const remote = norm(d[c.n]);
      if(first && !Object.keys(remote).length && (c.get() || []).length){ snap[c.n] = {}; seed.push(k); return; }
      if(J(remote) === J(snap[c.n] || {})) return;
      snap[c.n] = JSON.parse(J(remote));
      const arr = Object.values(remote).filter(Boolean); if(c.sort) arr.sort(c.sort);
      c.set(arr); rawSet(k, arr); changed = true;
    });
    ready = true; seed.forEach(push);
    const busy = !$('#modal').hidden || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
    if((changed || dirty) && me){
      if(busy) dirty = true;
      else { dirty = false; if(me.role === 'pelanggan' && view === 'menu'){ mlist(); cbar(); } else render(); }
    }
  }
  setInterval(poll, 3000); poll();
})();
