/**
 * Marchanta · Core Logic Engine
 * Respaldada por IQPanda Tecnovador
 * Blindajes: Anti-Apagones, Auditoría Anti-Robo, Carrito Inmortal, Poda y Visión
 */
(function(root) {
  'use strict';

  const DAY = 864e5;
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const round3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sod = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const sum = (arr, fn) => (arr || []).reduce((acc, x) => acc + (fn ? fn(x) : x), 0);

  const money = n => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = n => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const num = (n, d = 1) => (Math.round((Number(n) || 0) * 10 ** d) / 10 ** d).toLocaleString('es-MX', { maximumFractionDigits: d });
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const REFRANES = [
    "«El que tiene tienda, que la atienda... y si no, que la venda.»",
    "«Hoy no se fía, mañana sí. ¡Con gusto le atendemos!»",
    "«Al cliente lo que pida y con una sonrisa en el mostrador.»",
    "«Cuentas claras y arqueo al centavo: negocio que prospera.»",
    "«Perecedero que no se mueve, dinero que se pudre: ¡ármale promo!»",
    "«Venta chica constante llena el cajón antes del corte.»"
  ];

  function getDailyQuote() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    return REFRANES[dayOfYear % REFRANES.length];
  }

  const MEX_DENOMINATIONS = [
    { v: 50000, name: '$500', type: 'bill', val: 500, bg: '#1E3A8A', fg: '#EFF6FF' },
    { v: 20000, name: '$200', type: 'bill', val: 200, bg: '#15803D', fg: '#F0FDF4' },
    { v: 10000, name: '$100', type: 'bill', val: 100, bg: '#DC2626', fg: '#FEF2F2' },
    { v: 5000,  name: '$50',  type: 'bill', val: 50,  bg: '#DB2777', fg: '#FDF2F8' },
    { v: 2000,  name: '$20',  type: 'bill', val: 20,  bg: '#0284C7', fg: '#F0F9FF' },
    { v: 1000,  name: '$10',  type: 'coin', val: 10,  bg: '#B45309', ring: '#94A3B8', fg: '#FEF3C7' },
    { v: 500,   name: '$5',   type: 'coin', val: 5,   bg: '#94A3B8', ring: '#B45309', fg: '#1E293B' },
    { v: 200,   name: '$2',   type: 'coin', val: 2,   bg: '#94A3B8', ring: '#B45309', fg: '#1E293B' },
    { v: 100,   name: '$1',   type: 'coin', val: 1,   bg: '#94A3B8', ring: '#B45309', fg: '#1E293B' },
    { v: 50,    name: '50¢',  type: 'coin', val: 0.5, bg: '#D97706', ring: '#D97706', fg: '#FFFBEB' }
  ];

  function calcMexicanChange(changeAmount) {
    let rem = Math.round((Number(changeAmount) || 0) * 100);
    if (rem <= 0) return [];
    const breakdown = [];
    for (const d of MEX_DENOMINATIONS) {
      if (rem >= d.v) {
        const count = Math.floor(rem / d.v);
        rem %= d.v;
        breakdown.push({ ...d, count });
      }
    }
    return breakdown;
  }

  function takeStock(product, qty) {
    let left = Number(qty) || 0;
    if (!product || !Array.isArray(product.lots)) return;
    const sortedLots = product.lots
      .filter(l => l.qty > 0)
      .sort((a, b) => (a.exp == null ? 1e15 : a.exp) - (b.exp == null ? 1e15 : b.exp));

    for (const l of sortedLots) {
      const take = Math.min(l.qty, left);
      l.qty = round3(l.qty - take);
      left = round3(left - take);
      if (left <= 0) break;
    }
    product.lots = product.lots.filter(l => l.qty > 0.0001);
  }

  function stockOf(p) {
    if (!p || !Array.isArray(p.lots)) return 0;
    return round3(sum(p.lots, l => l.qty));
  }

  function expectedCashForTerminal(storeData, terminalId) {
    const ts = storeData.cash.lastCorte || 0;
    const ef = sum(storeData.sales.filter(s => s.ts >= ts && s.method === 'efectivo' && (!terminalId || s.terminal === terminalId)), s => s.total);
    const m = storeData.cash.movs.filter(x => x.ts >= ts && (!terminalId || x.terminal === terminalId));
    const ent = sum(m.filter(x => x.type !== 'retiro'), x => x.amount);
    const ret = sum(m.filter(x => x.type === 'retiro'), x => x.amount);
    const ap = terminalId === 'caja-2' ? 500 : (storeData.cash.apertura || 800);
    return {
      apertura: ap,
      ef: round2(ef),
      ent: round2(ent),
      ret: round2(ret),
      total: round2(ap + ef + ent - ret)
    };
  }

  function classifyPerishableByColor(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    const hueDeg = h * 360;

    if (hueDeg <= 20 || hueDeg >= 340) return ['jit', 'fre', 'man'];
    if (hueDeg > 20 && hueDeg <= 75) return ['pla', 'lim', 'pay'];
    if (hueDeg > 75 && hueDeg <= 165) return ['agu', 'chi', 'cil'];
    return ['ceb', 'pap', 'hue'];
  }

  /**
   * Blindaje Anti-Robo Hormiga: Auditoría de Tickets Vaciados
   */
  function recordVoidAudit(storeData, { terminal, items, total, reason }) {
    if (!storeData.voids) storeData.voids = [];
    const entry = {
      id: uid(),
      ts: Date.now(),
      terminal: terminal || 'caja-1',
      items: (items || []).map(i => ({ name: i.name || i.p?.name, qty: i.qty, price: i.price, sub: i.sub })),
      total: round2(total || 0),
      reason: reason || 'Ticket vaciado antes de cobrar'
    };
    storeData.voids.push(entry);
    return entry;
  }

  /**
   * Blindaje de Memoria: Poda Histórica para no saturar LocalStorage
   */
  function pruneOldSales(storeData) {
    const thirtyDaysAgo = Date.now() - 30 * DAY;
    if (Array.isArray(storeData.sales) && storeData.sales.length > 500) {
      // Mantiene en memoria rápida únicamente las ventas del último mes
      storeData.sales = storeData.sales.filter(s => s.ts >= thirtyDaysAgo);
    }
  }

  const Core = {
    DAY,
    round2,
    round3,
    clamp,
    sod,
    uid,
    sum,
    money,
    money0,
    num,
    esc,
    stockOf,
    takeStock,
    calcMexicanChange,
    expectedCashForTerminal,
    classifyPerishableByColor,
    recordVoidAudit,
    pruneOldSales,
    MEX_DENOMINATIONS,
    REFRANES,
    getDailyQuote
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : this);