/**
 * Marchanta · App Interactive Controller
 * Desarrollada y nutrida con orgullo por IQPanda Tecnovador
 * Características Mágicas: La Voz de Marchanta, Confeti, El Pilón de Barrio y Carrito Inmortal
 */
(()=>{
'use strict';

const KEY = 'tiendaInteligente.proto.v1';
const AUDIO_KEY = 'tiendaInteligente.audio.enabled';
const TERM_KEY = 'tiendaInteligente.terminal.id';
const ROLE_KEY = 'tiendaInteligente.user.role';

const { DAY, round2, round3, clamp, sod, uid, sum, money, money0, num, esc, stockOf, takeStock, calcMexicanChange, expectedCashForTerminal, classifyPerishableByColor, recordVoidAudit, pruneOldSales, getDailyQuote } = window.Core;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

let currentTerminal = localStorage.getItem(TERM_KEY) || 'caja-1';
let currentRole = localStorage.getItem(ROLE_KEY) || (currentTerminal === 'laptop' ? 'admin' : 'cajero');

/* ============ Sincronización Multi-Terminal ============ */
const liveSync = new BroadcastChannel('tienda_live_sync');

liveSync.onmessage = (event) => {
  const { type, payload, sender } = event.data || {};
  if (sender === currentTerminal) return;

  if (type === 'STOCK_DEDUCT') {
    payload.items.forEach(item => {
      const p = prodById(item.pid);
      if (p) takeStock(p, item.qty);
    });
    if (currentRole === 'admin') S.sales.push(payload.sale);
    save();
    renderLiveStockOnly();
    toast(`⚡ Existencias sincronizadas con ${payload.sale.terminal.toUpperCase()}`);
  } else if (type === 'VOID_ALERT' && currentRole === 'admin') {
    // Alerta roja en la Laptop del Dueño si alguien vació un ticket
    AudioFX.alert();
    toast(`⚠️ ALERTA: ${payload.terminal.toUpperCase()} vació un ticket con ${money(payload.total)}`);
    render();
  }
};

/* ============ Síntesis de Sonido y Voz de Marchanta ============ */
const AudioFX = {
  ctx: null,
  enabled: localStorage.getItem(AUDIO_KEY) !== 'false',
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem(AUDIO_KEY, String(this.enabled));
    if (this.enabled) this.clack();
    return this.enabled;
  },
  clack() {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.045);
    gain.gain.setValueAtTime(0.28, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.045);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.045);
  },
  chaChing() {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const o1 = this.ctx.createOscillator(), g1 = this.ctx.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(1046.5, now);
    g1.gain.setValueAtTime(0.25, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    o1.connect(g1); g1.connect(this.ctx.destination);
    o1.start(now); o1.stop(now + 0.32);

    const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
    o2.type = 'sine'; o2.frequency.setValueAtTime(1567.98, now + 0.07);
    g2.gain.setValueAtTime(0.3, now + 0.07); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o2.connect(g2); g2.connect(this.ctx.destination);
    o2.start(now + 0.07); o2.stop(now + 0.5);
  },
  bell() {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(1318.5, now);
    gain.gain.setValueAtTime(0.26, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.6);
  },
  alert() {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now); osc.frequency.setValueAtTime(260, now + 0.1);
    gain.gain.setValueAtTime(0.22, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.24);
  }
};

/* ============ Rasgo Mágico: Voz Nativa de Marchanta ============ */
const VoiceFX = {
  speak(text) {
    if (!AudioFX.enabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-MX';
    u.rate = 1.05;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  }
};

/* ============ Rasgo Mágico: Lluvia de Confeti ============ */
function triggerMagicConfetti() {
  const canvas = $('#magicCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#C6E91A', '#E4007C', '#FFB703', '#185336', '#FFFFFF'];
  const particles = Array.from({ length: 65 }, () => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.7) * 14,
    size: Math.random() * 8 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 1
  }));

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // Gravedad
      p.alpha -= 0.016;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;
    frame++;
    if (frame < 75) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

/* ============ Datos y Catálogo ============ */
const CATS = ['Frutas y verduras', 'Lácteos y perecederos', 'Abarrotes', 'Granel', 'Papelería'];
const METHOD = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transf: 'Transferencia', fiado: 'Cuenta (fiado)' };
const CATALOG = [
  ['jit','Jitomate saladet','🍅',0,'kg',28,19,15,6,'v1',14,null,3],
  ['agu','Aguacate Hass','🥑',0,'kg',85,62,10,5,'v1',9,6,2],
  ['lim','Limón con semilla','🍋',0,'kg',38,26,12,10,'v1',11,7,null],
  ['ceb','Cebolla blanca','🧅',0,'kg',26,17,15,14,'v1',10,null,null],
  ['pap','Papa blanca','🥔',0,'kg',30,21,20,20,'v1',12,null,null],
  ['pla','Plátano tabasco','🍌',0,'kg',24,15,15,5,'v1',10,44,2],
  ['man','Manzana roja','🍎',0,'kg',55,40,8,12,'v1',5,null,null],
  ['pay','Papaya maradol','🍈',0,'kg',32,20,8,4,'v1',4,18,1],
  ['zan','Zanahoria','🥕',0,'kg',22,14,10,12,'v1',6,null,null],
  ['chi','Chile serrano','🌶️',0,'kg',48,32,3,7,'v1',3,null,null],
  ['cil','Cilantro (manojo)','🌿',0,'pz',8,4.5,20,3,'v1',25,80,1],
  ['fre','Fresa (charola)','🍓',0,'pz',45,32,8,3,'v1',10,36,1],
  ['lec','Leche entera 1 L','🥛',1,'pz',29,24,24,8,'v2',30,null,5],
  ['hue','Huevo blanco','🥚',1,'kg',48,38,10,18,'v2',12,null,null],
  ['que','Queso fresco','🧀',1,'kg',150,110,3,7,'v2',4,14,2],
  ['cre','Crema 450 ml','🥣',1,'pz',38,29,6,10,'v2',8,null,null],
  ['jam','Jamón de pavo','🍖',1,'kg',160,118,3,6,'v2',3,9,2],
  ['pan','Pan blanco grande','🍞',1,'pz',46,36,10,4,'v5',14,44,1],
  ['tor','Tortilla de maíz','🫓',1,'kg',24,18,15,2,'v5',20,null,null],
  ['arr','Arroz a granel','🍚',3,'kg',28,20,15,180,'v3',6,null,null],
  ['fri','Frijol negro a granel','🫘',3,'kg',38,27,12,180,'v3',5,null,null],
  ['len','Lenteja a granel','🫘',3,'kg',42,30,5,180,'v3',2,80,null],
  ['ave','Avena a granel','🌾',3,'kg',36,25,5,180,'v3',2,null,null],
  ['azu','Azúcar a granel','🍬',3,'kg',32,25,15,180,'v3',6,null,null],
  ['ace','Aceite 1 L','🛢️',2,'pz',48,38,12,365,'v3',8,null,null],
  ['sal','Sal 1 kg','🧂',2,'pz',14,9,8,365,'v3',5,null,null],
  ['atu','Atún en lata','🐟',2,'pz',22,16,20,365,'v3',9,null,null],
  ['ref','Refresco 600 ml','🥤',2,'pz',20,15,36,365,'v3',40,null,null],
  ['gal','Galletas surtidas','🍪',2,'pz',18,12,20,120,'v3',15,null,null],
  ['cua','Cuaderno profesional','📓',4,'pz',38,26,10,0,'v4',4,null,null],
  ['lap','Lápiz #2','✏️',4,'pz',6,3.5,30,0,'v4',12,null,null],
  ['plu','Pluma azul','🖊️',4,'pz',9,5,30,0,'v4',10,null,null],
  ['hoj','Hojas blancas (100)','📄',4,'pz',45,32,6,0,'v4',5,null,null],
  ['peg','Pegamento en barra','🧴',4,'pz',22,14,8,0,'v4',3,null,null],
  ['col','Colores (caja de 12)','🖍️',4,'pz',55,38,6,0,'v4',2,90,null],
  ['car','Cartulina blanca','🗒️',4,'pz',8,5,20,0,'v4',5,null,null]
];

function seed() {
  const T = sod();
  const products = CATALOG.map((c, i) => {
    const [id, name, emoji, ci, unit, price, cost, min, shelf, prov, d, fixed] = c;
    const per = shelf > 0 && shelf < 60;
    const total = fixed || (d * 5);
    const lots = per 
      ? [{ id: uid(), qty: round3(total * 0.4), exp: T + 2 * DAY }, { id: uid(), qty: round3(total * 0.6), exp: T + 5 * DAY }]
      : [{ id: uid(), qty: total, exp: shelf >= 60 ? T + 60 * DAY : null }];
    return { id, name, emoji, cat: CATS[ci], unit, price, cost, min, shelf, prov, code: '7501' + String(1001 + i), lots };
  });

  const clients = [
    { id: 'c1', name: 'Doña Rosa Martínez', phone: '3290000011', limit: 1500, saldo: 640, mov: [] },
    { id: 'c2', name: 'Taquería El Güero', phone: '3290000012', limit: 3000, saldo: 2180, mov: [] }
  ];

  return { v: 1, store: 'Abarrotes La Esquina', products, sales: [], mermas: [], clients, voids: [], promos: {}, cash: { apertura: 800, movs: [], lastCorte: T } };
}

let S;
function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const o = JSON.parse(r);
      if (o && o.v === 1 && o.products) return o;
    }
  } catch (e) {}
  return seed();
}
function save() {
  try {
    pruneOldSales(S);
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {}
}

const prodById = id => S.products.find(p => p.id === id);
const isPer = p => p && p.shelf > 0 && p.shelf < 60;
const dl = l => Math.round((l.exp - sod()) / DAY);
const priceOf = p => S.promos[p.id] ? S.promos[p.id].price : p.price;
const fmtQty = (p, q) => p.unit === 'kg' ? `${num(q, 2)} kg` : `${Math.round(q)} pz`;

function pStat(p) {
  if (!isPer(p)) return 'na';
  let r = 'ok';
  for (const l of p.lots) {
    if (l.qty <= 0) continue;
    const d = dl(l);
    if (d <= 1) return 'crit';
    if (d <= Math.max(2, Math.round(p.shelf * .25))) r = 'soon';
  }
  return r;
}

/* ============ Estado de UI & Carrito Inmortal ============ */
const TABS = [
  ['hoy', '🏠', 'Hoy'],
  ['caja', '🛒', 'Caja'],
  ['inv', '📦', 'Inventario'],
  ['merma', '🥀', 'Merma'],
  ['clientes', '👥', 'Clientes'],
  ['corte', '💵', 'Corte'],
  ['asistente', '💬', 'Asistente']
];

// Blindaje 1: Recupera el carrito guardado por si se fue la luz o dieron F5
let savedCart = [];
try {
  savedCart = JSON.parse(localStorage.getItem(`marchanta_cart_${currentTerminal}`)) || [];
} catch (e) {}

const ui = {
  tab: 'hoy',
  cart: savedCart,
  cat: 'Todo',
  q: '',
  ticketOpen: false,
  wz: null,
  pay: null,
  camStream: null
};

function persistCart() {
  try {
    localStorage.setItem(`marchanta_cart_${currentTerminal}`, JSON.stringify(ui.cart));
  } catch (e) {}
}

function toast(t) {
  const e = $('#toast'); e.textContent = t; e.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 2600);
}
function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><button class="x" data-act="close" aria-label="Cerrar">✕</button>${html}</div>`;
  m.hidden = false; document.body.classList.add('lock');
}
function closeModal() {
  if (ui.camStream) {
    ui.camStream.getTracks().forEach(tr => tr.stop());
    ui.camStream = null;
  }
  const m = $('#modal'); m.hidden = true; m.innerHTML = '';
  document.body.classList.remove('lock');
}

function renderChangeTrayHtml(changeAmount) {
  const breakdown = calcMexicanChange(changeAmount);
  if (!breakdown.length) return '';
  return `<div class="change-tray">
    <div style="width:100%;font-size:.78rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Entrega en efectivo sugerida:</div>
    ${breakdown.map(d => d.type === 'bill' 
      ? `<div class="money-bill" style="background:${d.bg};color:${d.fg}"><span>${d.name}</span><span style="align-self:flex-end;font-size:.68rem">MXN</span>${d.count > 1 ? `<span class="cnt">×${d.count}</span>` : ''}</div>`
      : `<div class="money-coin" style="background:${d.bg};border-color:${d.ring};color:${d.fg}"><span>${d.name}</span>${d.count > 1 ? `<span class="cnt">×${d.count}</span>` : ''}</div>`
    ).join('')}
  </div>`;
}

function renderLiveStockOnly() {
  const g = $('#grid');
  if (g && ui.tab === 'caja') g.innerHTML = gridHtml();
}

function render() {
  const curTab = TABS.find(x => x[0] === ui.tab) || TABS[0];
  $('#title').textContent = curTab[2];
  $('#date').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#btnAudio').textContent = AudioFX.enabled ? '🔔' : '🔕';
  $('#termBadge').textContent = currentRole === 'admin' ? '👑 Laptop Admin' : (currentTerminal === 'caja-1' ? '📍 Caja 1' : '📍 Caja 2');
  $('#refranText').textContent = getDailyQuote();

  $('#nav').innerHTML = TABS.map(([id, ic, n]) => `
    <button class="${ui.tab === id ? 'on' : ''}" data-act="nav" data-v="${id}">
      <span class="ic">${ic}</span>${n}
    </button>
  `).join('');

  const views = { hoy: viewHoy, caja: viewCaja, inv: viewInv, merma: viewMerma, clientes: viewClientes, corte: viewCorte, asistente: viewAsistente };
  $('#view').innerHTML = (views[ui.tab] || viewHoy)();
}

/* ---- Vista Hoy: Modo Administrador vs Modo Cajero ---- */
function viewHoy() {
  const T = sod();
  const sales = S.sales.filter(s => s.ts >= T);

  if (currentRole === 'admin') {
    const c1Sales = sales.filter(s => s.terminal === 'caja-1');
    const c2Sales = sales.filter(s => s.terminal === 'caja-2');
    const rev1 = sum(c1Sales, s => s.total), rev2 = sum(c2Sales, s => s.total);
    const ef1 = sum(c1Sales.filter(s => s.method === 'efectivo'), s => s.total);
    const ef2 = sum(c2Sales.filter(s => s.method === 'efectivo'), s => s.total);
    const totalRev = rev1 + rev2;

    return `
    <div class="stack">
      <div class="hero">
        <div>
          <p class="muted" style="font-weight:700">👑 Panel del Propietario · Monitoreo en Vivo</p>
          <p class="big num" style="color:var(--green)">${money0(totalRev)}</p>
          <p class="muted" style="margin:8px 0 16px;font-weight:600">Ventas totales acumuladas entre Caja 1 y Caja 2 hoy.</p>
          <div class="quick" style="margin:0">
            <button class="btn ghost sm" data-act="supplierPayoutModal">🚚 Pago a Repartidor</button>
          </div>
        </div>
        <div>
          <div class="legend" style="margin-top:0">
            <span><i class="dot ok"></i>Caja 1: <b>${money0(rev1)}</b> (${c1Sales.length} tickets)</span>
            <span><i class="dot soon"></i>Caja 2: <b>${money0(rev2)}</b> (${c2Sales.length} tickets)</span>
          </div>
        </div>
      </div>

      <div class="cols">
        <section class="panel">
          <h2>📍 Caja 1 <small>En mostrador</small></h2>
          <table>
            <tbody>
              <tr><td>Ventas totales</td><td class="right num"><b>${money(rev1)}</b></td></tr>
              <tr><td>Efectivo en cajón</td><td class="right num ${ef1 > 3000 ? 'down' : ''}"><b>${money(ef1 + 800)}</b></td></tr>
              <tr><td>Tickets cobrados</td><td class="right num">${c1Sales.length}</td></tr>
            </tbody>
          </table>
          ${ef1 > 2500 ? `<div style="margin-top:10px"><span class="tag crit">⚠️ Retirar efectivo (Cajón lleno)</span></div>` : ''}
        </section>

        <section class="panel">
          <h2>📍 Caja 2 <small>En mostrador</small></h2>
          <table>
            <tbody>
              <tr><td>Ventas totales</td><td class="right num"><b>${money(rev2)}</b></td></tr>
              <tr><td>Efectivo en cajón</td><td class="right num ${ef2 > 3000 ? 'down' : ''}"><b>${money(ef2 + 500)}</b></td></tr>
              <tr><td>Tickets cobrados</td><td class="right num">${c2Sales.length}</td></tr>
            </tbody>
          </table>
          ${ef2 > 2500 ? `<div style="margin-top:10px"><span class="tag crit">⚠️ Retirar efectivo (Cajón lleno)</span></div>` : ''}
        </section>
      </div>

      ${S.voids && S.voids.length ? `
        <section class="panel">
          <h2>🚨 Auditoría Anti-Robo: Tickets Vaciados</h2>
          <ul class="list">
            ${S.voids.slice(-5).reverse().map(v => `
              <li>
                <span class="em">⚠️</span>
                <div class="grow">
                  <div class="ttl">${v.terminal.toUpperCase()} · ${money(v.total)} vaciados</div>
                  <div class="small muted">${v.items.length} productos · ${new Date(v.ts).toLocaleTimeString('es-MX')}</div>
                </div>
                <span class="tag crit">Cancelado</span>
              </li>
            `).join('')}
          </ul>
        </section>
      ` : ''}
    </div>`;
  }

  const mySales = sales.filter(s => s.terminal === currentTerminal);
  const myRev = sum(mySales, s => s.total);
  return `
  <section class="hero">
    <div>
      <p class="muted" style="font-weight:700">Turno de ${currentTerminal === 'caja-1' ? 'Caja 1' : 'Caja 2'}</p>
      <p class="big num" style="color:var(--green)">${money0(myRev)}</p>
      <p class="muted" style="margin:8px 0 16px;font-weight:600">Llevas ${mySales.length} tickets cobrados en tu turno.</p>
      <button class="btn block lime" data-act="nav" data-v="caja">🛒 Ir a Cobrar al Mostrador</button>
    </div>
  </section>`;
}

/* ---- Vista Caja (POS) ---- */
function gridHtml() {
  const q = norm(ui.q.trim());
  const list = S.products.filter(p => (ui.cat === 'Todo' || p.cat === ui.cat) && (!q || norm(p.name).includes(q) || p.code.includes(q)));
  if (!list.length) return '<div class="empty" style="grid-column:1/-1">No se encontró el producto.</div>';
  return list.map(p => {
    const st = stockOf(p), ps = pStat(p);
    return `
    <button class="pcard ${st <= 0 ? 'out' : ''}" data-act="addp" data-id="${p.id}">
      <span class="e">${p.emoji}</span>
      <span class="n">${esc(p.name)}</span>
      <span class="p num">${money(priceOf(p))}<small class="muted">/${p.unit}</small></span>
      <span class="s">${st <= 0 ? 'Agotado' : `<i class="dot ${ps === 'na' ? 'na' : ps}"></i> ${fmtQty(p, st)}`}</span>
    </button>`;
  }).join('');
}

function cartLines() {
  return ui.cart.map(c => {
    if (c.custom) return { p: { id: c.pid, name: c.name, emoji: '⚡', unit: 'pz', cost: 0 }, qty: c.qty, price: c.price, sub: round2(c.qty * c.price) };
    if (c.pilon) return { p: { id: 'pilon', name: c.name, emoji: '⭐', unit: 'pz', cost: 0 }, qty: 1, price: 0, sub: 0 };
    const p = prodById(c.pid), pr = priceOf(p);
    return { p, qty: c.qty, price: pr, sub: round2(c.qty * pr) };
  });
}

function ticketHtml() {
  const L = cartLines(), tot = round2(sum(L, l => l.sub));
  return `
  <h2 class="disp" style="font-size:1.25rem;display:flex;justify-content:space-between;align-items:center">
    <span>Ticket (${currentTerminal.toUpperCase()})</span>
    <button class="btn sm ghost" data-act="toggleTicket" style="display:${innerWidth <= 900 ? 'inline-flex' : 'none'}">Cerrar</button>
  </h2>
  <div class="lines">
    ${L.length ? L.map(l => `
      <div class="tline">
        <span class="em">${l.p.emoji}</span>
        <div class="grow">
          <div class="ttl" style="font-size:.95rem">${esc(l.p.name)}</div>
          <div class="small muted num">${l.p.unit === 'kg' ? num(l.qty, 3) + ' kg' : l.qty + ' pz'} × ${money(l.price)}</div>
        </div>
        ${l.p.unit === 'pz' && !l.pilon ? `<div class="qty"><button data-act="dec" data-id="${l.p.id}">−</button><button data-act="inc" data-id="${l.p.id}">+</button></div>` : ''}
        <b class="num">${money(l.sub)}</b>
        <button data-act="del" data-id="${l.p.id}" class="muted" style="font-weight:800;padding:4px">✕</button>
      </div>
    `).join('') : '<div class="empty">Listo para cobrar.</div>'}
  </div>
  <div class="total"><span class="muted">TOTAL</span><b class="num">${money(tot)}</b></div>
  <button class="btn block lime" data-act="cobrar" ${L.length ? '' : 'disabled'} style="font-size:1.15rem;padding:14px">💵 Cobrar</button>
  ${L.length ? `
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn sm pink" style="flex:1" data-act="addPilon">🎁 Dar Pilón</button>
      <button class="btn sm ghost" style="flex:1" data-act="clearcart">Vaciar ticket</button>
    </div>
  ` : ''}`;
}

function viewCaja() {
  return `
  <div class="pos">
    <section class="pos-left">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input style="flex:1;min-width:180px" id="q" data-in="q" type="search" placeholder="🔍 Buscar o escanear..." autocomplete="off" value="${esc(ui.q)}">
        <button class="btn lime sm" data-act="openQuickItemModal" title="Cobro rápido de producto sin código">⚡ Varios</button>
        <button class="btn ghost sm" data-act="openCameraModal" title="Cámara Web / Visión de Báscula">📷 Cámara</button>
        <button class="btn ghost sm" data-act="supplierPayoutModal">🚚 Repartidor</button>
      </div>
      <div class="chips">${['Todo', ...CATS].map(c => `<button class="chip ${ui.cat === c ? 'on' : ''}" data-act="cat" data-v="${esc(c)}">${c}</button>`).join('')}</div>
      <div class="grid" id="grid">${gridHtml()}</div>
    </section>
    <aside class="ticket ${ui.ticketOpen ? 'open' : ''}" id="ticket">${ticketHtml()}</aside>
    <button class="cartbar" id="cartbar" data-act="toggleTicket">
      <span>🛒 ${ui.cart.length} productos</span>
      <span class="num">${money(sum(cartLines(), l => l.sub))}</span>
    </button>
  </div>`;
}

function refreshTicket() {
  persistCart();
  const t = $('#ticket'); if (t) t.innerHTML = ticketHtml();
  const c = $('#cartbar'); if (c) c.innerHTML = `<span>🛒 ${ui.cart.length} productos</span><span class="num">${money(sum(cartLines(), l => l.sub))}</span>`;
}

function addToCart(pid, qty) {
  const p = prodById(pid);
  if (!p) return false;
  const have = stockOf(p), cur = (ui.cart.find(c => c.pid === pid) || { qty: 0 }).qty;
  if (cur + qty > have + 1e-9) {
    AudioFX.alert();
    toast(`Solo quedan ${fmtQty(p, have)} de ${p.name}`);
    return false;
  }
  const c = ui.cart.find(c => c.pid === pid);
  if (c) c.qty = round3(c.qty + qty);
  else ui.cart.push({ pid, qty: round3(qty) });
  AudioFX.clack();
  refreshTicket();
  return true;
}

/* ---- Blindaje 3: Botón Varios / Sin Código ---- */
function openQuickItemModal() {
  modal(`
    <h3>⚡ Venta Exprés / Sin Código</h3>
    <div class="field">
      <label for="q_name">Nombre o Concepto</label>
      <input id="q_name" placeholder="Ej. Dulce suelto, Clavos, Bolsa..." value="Varios">
    </div>
    <div class="field">
      <label for="q_price">Precio a Cobrar ($)</label>
      <input id="q_price" type="number" inputmode="decimal" step="0.5" placeholder="0.00" autofocus>
    </div>
    <button class="btn block lime" style="margin-top:14px" data-act="addQuickItem">Agregar al Ticket</button>
  `);
}

function addQuickItem() {
  const name = ($('#q_name').value || 'Varios').trim();
  const price = parseFloat($('#q_price').value) || 0;
  if (price <= 0) return toast('Indica un precio válido');
  ui.cart.push({ pid: 'custom_' + uid(), custom: true, name, price, qty: 1 });
  AudioFX.clack();
  closeModal();
  refreshTicket();
  toast(`${name} agregado`);
}

/* ---- Cámara Web Inteligente & Visión Colorimétrica ---- */
async function openCameraModal() {
  modal(`
    <h3>📷 Cámara Web de Mostrador</h3>
    <div class="cam-container">
      <video id="camVideo" autoplay playsinline muted></video>
      <div class="cam-target"></div>
    </div>
    <div style="margin-top:12px;font-weight:700;font-size:.88rem" class="muted">Sugerencias por color de fruta/verdura en báscula:</div>
    <div class="cam-sugg" id="camSugg">
      <button data-act="addp" data-id="jit">🍅 Jitomate</button>
      <button data-act="addp" data-id="agu">🥑 Aguacate</button>
      <button data-act="addp" data-id="lim">🍋 Limón</button>
    </div>
    <div class="btnrow" style="margin-top:14px">
      <button class="btn lime" data-act="analyzeCameraFrame">🔍 Analizar lo que está en Báscula</button>
      <button class="btn ghost" data-act="close">Cerrar</button>
    </div>
  `);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    ui.camStream = stream;
    const vid = $('#camVideo');
    if (vid) vid.srcObject = stream;

    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code'] });
      const interval = setInterval(async () => {
        if (!ui.camStream || !$('#camVideo')) { clearInterval(interval); return; }
        try {
          const barcodes = await detector.detect($('#camVideo'));
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            AudioFX.clack();
            closeModal();
            handleGlobalBarcodeScan(raw);
            clearInterval(interval);
          }
        } catch (e) {}
      }, 250);
    }
  } catch (err) {
    toast('No se pudo acceder a la cámara web');
  }
}

function analyzeCameraFrame() {
  const vid = $('#camVideo');
  if (!vid) return;
  const canvas = document.createElement('canvas');
  canvas.width = 100; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(vid, vid.videoWidth * 0.35, vid.videoHeight * 0.35, vid.videoWidth * 0.3, vid.videoHeight * 0.3, 0, 0, 100, 100);
  const data = ctx.getImageData(0, 0, 100, 100).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);

  const matchedIds = classifyPerishableByColor(r, g, b);
  const suggBox = $('#camSugg');
  if (suggBox) {
    suggBox.innerHTML = matchedIds.map(id => {
      const p = prodById(id);
      return `<button class="btn sm lime" data-act="camPick" data-id="${p.id}">${p.emoji} ${p.name.split(' ')[0]}</button>`;
    }).join('');
    AudioFX.clack();
    toast('¡Fruta o verdura identificada!');
  }
}

/* ---- Cobro, Confeti y Voz de Marchanta ---- */
function payModal() {
  const L = cartLines(), tot = round2(sum(L, l => l.sub)), pay = ui.pay;
  let body = '';
  if (pay.method === 'efectivo') {
    const opts = [50, 100, 200, 500, 1000].filter(x => x >= tot).slice(0, 3);
    const recv = parseFloat(pay.received) || tot;
    const cambio = Math.max(0, recv - tot);
    body = `
      <div class="field">
        <label for="recv">Efectivo recibido</label>
        <input id="recv" data-in="recv" type="number" inputmode="decimal" min="0" step="0.5" placeholder="Exacto: ${money(tot)}" value="${esc(pay.received)}">
      </div>
      <div class="chips">
        <button class="chip" data-act="recvq" data-v="${tot}">Exacto</button>
        ${opts.map(o => `<button class="chip" data-act="recvq" data-v="${o}">${money0(o)}</button>`).join('')}
      </div>
      <div class="disp-box" style="margin-top:12px">
        <span class="muted" style="font-weight:700">Cambio a entregar</span>
        <div class="v num" id="cambio">${money(cambio)}</div>
      </div>
      <div id="change-preview">${renderChangeTrayHtml(cambio)}</div>
    `;
  } else if (pay.method === 'fiado') {
    body = `<div class="field"><label for="cli">Vecino de confianza</label><select id="cli" data-ch="cli"><option value="">Selecciona...</option>${S.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>`;
  } else {
    body = `<p class="muted" style="font-weight:700">Cobra en terminal bancaria por <b>${money(tot)}</b>.</p>`;
  }

  modal(`
    <h3>Cobrar ${money(tot)} · <span class="tag ok">${currentTerminal.toUpperCase()}</span></h3>
    <div class="pm">
      ${Object.entries(METHOD).map(([k, n]) => `<button class="${pay.method === k ? 'on' : ''}" data-act="paym" data-v="${k}">${n}</button>`).join('')}
    </div>
    <div style="margin-top:14px">${body}</div>
    <button class="btn block lime" style="margin-top:16px" data-act="confirmpay">✅ Confirmar Venta</button>
  `);
}

function finishSale() {
  const L = cartLines(), total = round2(sum(L, l => l.sub)), pay = ui.pay;
  for (const l of L) {
    if (!l.custom && !l.pilon && l.qty > stockOf(l.p) + 1e-9) {
      AudioFX.alert();
      return toast(`Existencias insuficientes de ${l.p.name}`);
    }
  }

  const items = L.map(l => ({ pid: l.p.id, name: l.p.name, unit: l.p.unit, qty: l.qty, price: l.price, cost: l.p.cost, sub: l.sub }));
  L.forEach(l => {
    if (!l.custom && !l.pilon) takeStock(l.p, l.qty);
  });

  const sale = { id: uid(), ts: Date.now(), terminal: currentTerminal, items, total, method: pay.method, client: null };
  S.sales.push(sale);
  save();

  liveSync.postMessage({
    type: 'STOCK_DEDUCT',
    sender: currentTerminal,
    payload: { items, sale }
  });

  AudioFX.chaChing();
  triggerMagicConfetti();
  VoiceFX.speak('¡Cobro exitoso marchante! Que rinda el gasto y Dios bendiga el negocio.');

  const recv = pay.method === 'efectivo' && pay.received !== '' ? parseFloat(pay.received) : total;
  const change = Math.max(0, recv - total);

  ui.cart = [];
  persistCart();
  ui.ticketOpen = false;
  ui.pay = null;

  modal(`
    <h3>✅ Venta Registrada (${currentTerminal.toUpperCase()})</h3>
    ${pay.method === 'efectivo' ? `<div class="disp-box"><span class="muted font-bold">Cambio a entregar</span><div class="v num">${money(change)}</div></div>${renderChangeTrayHtml(change)}` : ''}
    <p class="muted small" style="text-align:center;margin-top:10px">⭐ Marchanta te agradece por hacer barrio · Respaldada por IQPanda Tecnovador</p>
    <button class="btn block lime" style="margin-top:14px" data-act="close">Nueva Venta</button>
  `);
  render();
}

/* ---- Ajustes & Conmutador de Terminal ---- */
function settingsModal() {
  modal(`
    <h3>⚙️ Configuración de Terminal</h3>
    <div class="field">
      <label for="set_term">Esta computadora/pantalla es:</label>
      <select id="set_term">
        <option value="caja-1" ${currentTerminal === 'caja-1' ? 'selected' : ''}>Caja 1 (Mostrador)</option>
        <option value="caja-2" ${currentTerminal === 'caja-2' ? 'selected' : ''}>Caja 2 (Mostrador)</option>
        <option value="laptop" ${currentTerminal === 'laptop' ? 'selected' : ''}>Laptop (Administrador / Dueño)</option>
      </select>
    </div>
    <div class="field" style="margin-top:10px">
      <label for="set_store">Nombre de la Tienda</label>
      <input id="set_store" value="${esc(S.store)}">
    </div>
    <p class="muted small" style="margin-top:12px;line-height:1.4"><b>Marchanta OS</b> · Desarrollada con orgullo por la familia <b>IQPanda Tecnovador</b> para blindar el mostrador y dignificar el comercio de barrio.</p>
    <button class="btn block lime" style="margin-top:14px" data-act="saveTerminalConfig">Guardar y Aplicar</button>
  `);
}

function saveTerminalConfig() {
  currentTerminal = $('#set_term').value;
  currentRole = currentTerminal === 'laptop' ? 'admin' : 'cajero';
  S.store = ($('#set_store').value || S.store).trim();
  localStorage.setItem(TERM_KEY, currentTerminal);
  localStorage.setItem(ROLE_KEY, currentRole);
  save();
  closeModal();
  render();
  toast(`Marchanta configurada en ${currentTerminal.toUpperCase()}`);
}

/* ---- Liquidación de Repartidores ---- */
function supplierPayoutModal() {
  const exp = expectedCashForTerminal(S, currentTerminal);
  modal(`
    <h3>🚚 Pago a Repartidor desde ${currentTerminal.toUpperCase()}</h3>
    <p class="muted" style="margin-bottom:12px">Efectivo en esta caja: <b style="color:var(--green)">${money(exp.total)}</b></p>
    <div class="field"><label>Proveedor</label><input id="p_prov" placeholder="Ej. Sabritas, Coca-Cola..."></div>
    <div class="field"><label>Monto ($)</label><input id="p_amt" type="number" step="0.5" placeholder="0.00"></div>
    <button class="btn block warn" data-act="saveSupplierPayout">Registrar Salida de Efectivo</button>
  `);
}

function saveSupplierPayout() {
  const prov = ($('#p_prov').value || '').trim(), amt = parseFloat($('#p_amt').value) || 0;
  if (!prov || amt <= 0) return toast('Completa los campos');
  const mov = { id: uid(), ts: Date.now(), terminal: currentTerminal, type: 'retiro', amount: amt, note: `Pago a ${prov}` };
  S.cash.movs.push(mov);
  save();
  liveSync.postMessage({ type: 'SUPPLIER_PAYOUT', sender: currentTerminal, payload: { mov } });
  AudioFX.clack();
  closeModal();
  render();
  toast(`Pago registrado en ${currentTerminal.toUpperCase()}`);
}

/* ---- Vistas Restantes ---- */
function viewInv() {
  return `<div class="stack"><section class="panel"><h2>📦 Existencias en Almacén (Sincronizado)</h2>${gridHtml()}</section></div>`;
}
function viewMerma() {
  return `<div class="stack"><section class="panel"><h2>🥀 Merma de Tienda</h2><p class="muted">Registros de producto dañado o vencido.</p></section></div>`;
}
function viewClientes() {
  return `<div class="stack"><section class="panel"><h2>👥 Libreta de Fiado</h2><p class="muted">Cuentas pendientes de vecinos de confianza.</p></section></div>`;
}
function viewCorte() {
  const e = expectedCashForTerminal(S, currentTerminal);
  return `
  <div class="cols">
    <section class="panel">
      <h2>💵 Arqueo de ${currentTerminal.toUpperCase()}</h2>
      <table>
        <tbody>
          <tr><td>Fondo de apertura</td><td class="right num">${money(e.apertura)}</td></tr>
          <tr><td>Ventas en efectivo</td><td class="right num">${money(e.ef)}</td></tr>
          <tr><td>Retiros / Repartidores</td><td class="right num down">−${money(e.ret)}</td></tr>
          <tr><td><b>Efectivo esperado</b></td><td class="right num"><b>${money(e.total)}</b></td></tr>
        </tbody>
      </table>
      <button class="btn block lime" style="margin-top:14px" data-act="closeTurn">Cerrar Turno de esta Caja</button>
    </section>
  </div>`;
}
function viewAsistente() {
  return `<section class="panel"><h2>💬 Asistente Marchanta</h2><p class="muted">Pregúntame sobre ventas de Caja 1, Caja 2 y sugerencias de surtido.</p></section>`;
}

/* ---- Escáner HID Global Buffer ---- */
let scanBuffer = '', lastKeyTime = Date.now();
function handleGlobalBarcodeScan(code) {
  const cleanCode = code.trim();
  const p = S.products.find(x => x.code === cleanCode);
  if (p) {
    if (ui.tab !== 'caja') { ui.tab = 'caja'; render(); }
    if (p.unit === 'kg') {
      ui.wz = { pid: p.id, mode: 'kg', buf: '' };
      weighModal();
    } else {
      addToCart(p.id, 1);
      toast(`Escaneado: ${p.name}`);
    }
  } else {
    AudioFX.alert();
    toast(`Código no registrado: ${cleanCode}`);
  }
}

document.addEventListener('keydown', e => {
  const now = Date.now(), diff = now - lastKeyTime;
  lastKeyTime = now;
  if (e.key === 'Enter') {
    if (scanBuffer.length >= 4) {
      e.preventDefault();
      const c = scanBuffer; scanBuffer = '';
      handleGlobalBarcodeScan(c);
      return;
    }
    scanBuffer = ''; return;
  }
  if (e.key.length === 1) {
    if (diff > 55) scanBuffer = e.key;
    else scanBuffer += e.key;
  }
});

/* ---- Delegación de Eventos ---- */
const Actions = {
  nav(el) { ui.tab = el.dataset.v; ui.ticketOpen = false; closeModal(); render(); },
  close() { closeModal(); },
  toggleAudio() { const on = AudioFX.toggle(); $('#btnAudio').textContent = on ? '🔔' : '🔕'; },
  toggleTicket() { ui.ticketOpen = !ui.ticketOpen; refreshTicket(); },
  cat(el) { ui.cat = el.dataset.v; render(); },
  speakGreeting() {
    VoiceFX.speak('¡Marchanta a su servicio! Cuidando el mostrador y respaldada con orgullo por IQPanda Tecnovador.');
  },
  addp(el) {
    const p = prodById(el.dataset.id);
    if (!p) return;
    if (p.unit === 'kg') { ui.wz = { pid: p.id, mode: 'kg', buf: '' }; weighModal(); }
    else addToCart(p.id, 1);
  },
  camPick(el) {
    closeModal();
    Actions.addp(el);
  },
  addPilon() {
    ui.cart.push({ pid: 'pilon_' + uid(), pilon: true, name: 'Pilón de la Casa (Cortesía)', price: 0, qty: 1 });
    triggerMagicConfetti();
    AudioFX.bell();
    VoiceFX.speak('¡Con cariño su pilón marchante!');
    refreshTicket();
    toast('⭐ ¡Pilón agregado con cariño!');
  },
  openCameraModal() { openCameraModal(); },
  analyzeCameraFrame() { analyzeCameraFrame(); },
  openQuickItemModal() { openQuickItemModal(); },
  addQuickItem() { addQuickItem(); },
  wmode(el) { ui.wz.mode = el.dataset.v; ui.wz.buf = ''; weighModal(); },
  wkey(el) {
    const k = el.dataset.v, w = ui.wz;
    if (k === '⌫') w.buf = w.buf.slice(0, -1);
    else if (k === '.') { if (!w.buf.includes('.')) w.buf = (w.buf || '0') + '.'; }
    else { if (w.buf.length < 8) w.buf += k; }
    weighModal();
  },
  wadd() {
    const w = ui.wz, p = prodById(w.pid), price = priceOf(p), v = parseFloat(w.buf) || 0;
    const qty = round3(w.mode === 'kg' ? v : v / price);
    if (qty > 0 && addToCart(p.id, qty)) { closeModal(); toast(`${p.emoji} ${num(qty, 3)} kg agregados`); }
  },
  inc(el) {
    const item = ui.cart.find(c => c.pid === el.dataset.id);
    if (item && item.custom) { item.qty += 1; refreshTicket(); return; }
    addToCart(el.dataset.id, 1);
  },
  dec(el) {
    const c = ui.cart.find(x => x.pid === el.dataset.id);
    if (!c) return;
    c.qty -= 1;
    if (c.qty <= 0) ui.cart = ui.cart.filter(x => x !== c);
    AudioFX.clack(); refreshTicket();
  },
  del(el) { ui.cart = ui.cart.filter(c => c.pid !== el.dataset.id); AudioFX.clack(); refreshTicket(); },
  clearcart() {
    // Blindaje 2: Auditoría Anti-Robo si vacían ticket con productos
    if (ui.cart.length > 0) {
      const L = cartLines(), total = round2(sum(L, l => l.sub));
      const voidEntry = recordVoidAudit(S, { terminal: currentTerminal, items: L, total });
      save();
      liveSync.postMessage({ type: 'VOID_ALERT', sender: currentTerminal, payload: voidEntry });
      AudioFX.alert();
      toast('Ticket vaciado (Registrado en auditoría)');
    }
    ui.cart = [];
    refreshTicket();
  },
  cobrar() { if (ui.cart.length) { ui.pay = { method: 'efectivo', received: '' }; payModal(); } },
  paym(el) { ui.pay.method = el.dataset.v; payModal(); },
  recvq(el) { ui.pay.received = el.dataset.v; payModal(); },
  confirmpay() { finishSale(); },
  settings() { settingsModal(); },
  saveTerminalConfig() { saveTerminalConfig(); },
  supplierPayoutModal() { supplierPayoutModal(); },
  saveSupplierPayout() { saveSupplierPayout(); },
  closeTurn() {
    if (!confirm(`¿Cerrar turno de ${currentTerminal.toUpperCase()}?`)) return;
    toast(`Turno cerrado para ${currentTerminal.toUpperCase()}`);
    render();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = Actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.q = t.value; $('#grid').innerHTML = gridHtml(); }
  else if (t.id === 'recv') {
    ui.pay.received = t.value;
    const tot = round2(sum(cartLines(), l => l.sub));
    const cambio = Math.max(0, (parseFloat(t.value) || tot) - tot);
    const cEl = $('#cambio'); if (cEl) cEl.textContent = money(cambio);
    const tray = $('#change-preview'); if (tray) tray.innerHTML = renderChangeTrayHtml(cambio);
  }
});

function weighModal() {
  const w = ui.wz, p = prodById(w.pid), price = priceOf(p), v = parseFloat(w.buf) || 0;
  const qty = w.mode === 'kg' ? v : (price > 0 ? v / price : 0);
  const amt = w.mode === 'kg' ? v * price : v;
  modal(`
    <h3>${p.emoji} ${esc(p.name)}</h3>
    <div class="seg">
      <button class="${w.mode === 'kg' ? 'on' : ''}" data-act="wmode" data-v="kg">Por peso (kg)</button>
      <button class="${w.mode === 'mto' ? 'on' : ''}" data-act="wmode" data-v="mto">Por monto ($)</button>
    </div>
    <div class="disp-box" style="margin:10px 0">
      <div class="v num">${w.mode === 'kg' ? (w.buf || '0') + ' kg' : '$' + (w.buf || '0')}</div>
      <div class="muted num font-bold">${w.mode === 'kg' ? '= ' + money(amt) : '= ' + num(qty, 3) + ' kg'}</div>
    </div>
    <div class="keypad">${['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k => `<button data-act="wkey" data-v="${k}">${k}</button>`).join('')}</div>
    <button class="btn block lime" style="margin-top:12px" data-act="wadd" ${qty > 0 ? '' : 'disabled'}>Agregar al ticket</button>
  `);
}

S = load();
render();
window.__app = { S: () => S, ui, Actions, render, AudioFX, VoiceFX };
})();