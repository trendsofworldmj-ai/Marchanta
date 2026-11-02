/**
 * Tienda Inteligente - Sync adapter (local queue → Supabase RPC commit_sale)
 * Offline-first: the POS keeps writing to the local blob; this module only
 * enqueues and retries remote commits without blocking checkout.
 */
(function(root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./core.js'), require('./db.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./core.js', './db.js'], factory);
  } else {
    root.TiendaSync = factory(root.TiendaCore, root.TiendaDB);
  }
})(typeof self !== 'undefined' ? self : this, function(Core, DB) {
  'use strict';

  var QUEUE_DB = 'tienda_inteligente_sync_db';
  var QUEUE_STORE = 'sync_queue';
  var queueDbPromise = null;
  var flushing = false;

  function getQueueDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!queueDbPromise) {
      queueDbPromise = new Promise(function(resolve) {
        try {
          var req = indexedDB.open(QUEUE_DB, 1);
          req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
              var store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
              store.createIndex('status', 'status', { unique: false });
            }
          };
          req.onsuccess = function(e) { resolve(e.target.result); };
          req.onerror = function() { resolve(null); };
        } catch (err) {
          resolve(null);
        }
      });
    }
    return queueDbPromise;
  }

  function idbRequest(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  }

  function identity() {
    return DB && DB.loadIdentity ? DB.loadIdentity() : null;
  }

  function isConfigured(ident) {
    var cfg = ident || identity();
    return !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey && Core.isUuid(cfg.businessId));
  }

  function saleToRpcPayload(sale, ident) {
    var items = [];
    (sale.items || []).forEach(function(line) {
      var lots = Array.isArray(line.lots) && line.lots.length
        ? line.lots
        : [{ lotUuid: null, qty: line.qty }];
      lots.forEach(function(lot) {
        items.push({
          product_id: line.productUuid || null,
          lot_id: lot.lotUuid || null,
          qty: lot.qty,
          price: line.price
        });
      });
    });
    return {
      p_sale_uuid: sale.uuid || sale.id,
      p_business_id: sale.businessId || ident.businessId,
      p_terminal_id: sale.terminalId || ident.terminalId,
      p_cashier_id: sale.cashierId || sale.userId || null,
      p_total: sale.total,
      p_payment_method: sale.method,
      p_items: items
    };
  }

  function enqueueSale(sale, identOverride) {
    var ident = identOverride || identity();
    var payload = saleToRpcPayload(sale, ident || {});
    var row = {
      id: payload.p_sale_uuid || Core.uuid(),
      op: 'commit_sale',
      payload: payload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    return getQueueDb().then(function(db) {
      if (!db) return row;
      var tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).put(row);
      return row;
    }).catch(function(err) {
      console.warn('No se pudo encolar la venta para sync:', err);
      return row;
    });
  }

  function listPending() {
    return getQueueDb().then(function(db) {
      if (!db) return [];
      var tx = db.transaction(QUEUE_STORE, 'readonly');
      return idbRequest(tx.objectStore(QUEUE_STORE).getAll()).then(function(rows) {
        return (rows || []).filter(function(r) { return r.status === 'pending' || r.status === 'error'; });
      });
    });
  }

  function markRow(id, patch) {
    return getQueueDb().then(function(db) {
      if (!db) return;
      var tx = db.transaction(QUEUE_STORE, 'readwrite');
      var store = tx.objectStore(QUEUE_STORE);
      return idbRequest(store.get(id)).then(function(row) {
        if (!row) return;
        Object.keys(patch).forEach(function(k) { row[k] = patch[k]; });
        row.updatedAt = Date.now();
        store.put(row);
      });
    });
  }

  function callCommitSale(payload, ident) {
    var base = String(ident.supabaseUrl || '').replace(/\/$/, '');
    return fetch(base + '/rest/v1/rpc/commit_sale', {
      method: 'POST',
      headers: {
        'apikey': ident.supabaseAnonKey,
        'Authorization': 'Bearer ' + ident.supabaseAnonKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    }).then(function(res) {
      return res.text().then(function(text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) {
          var msg = (data && (data.message || data.error || data.hint)) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  function flush() {
    if (flushing) return Promise.resolve({ skipped: true });
    var ident = identity();
    if (!isConfigured(ident)) {
      return Promise.resolve({ skipped: true, reason: 'supabase_not_configured' });
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.resolve({ skipped: true, reason: 'offline' });
    }

    flushing = true;
    return listPending().then(function(rows) {
      var chain = Promise.resolve();
      var synced = 0;
      var failed = 0;
      rows.forEach(function(row) {
        chain = chain.then(function() {
          return callCommitSale(row.payload, ident).then(function() {
            synced++;
            return markRow(row.id, { status: 'synced', lastError: null, attempts: (row.attempts || 0) + 1 });
          }).catch(function(err) {
            failed++;
            return markRow(row.id, {
              status: 'error',
              lastError: err.message || String(err),
              attempts: (row.attempts || 0) + 1
            });
          });
        });
      });
      return chain.then(function() {
        return { skipped: false, synced: synced, failed: failed, pending: rows.length };
      });
    }).then(function(result) {
      flushing = false;
      return result;
    }, function(err) {
      flushing = false;
      throw err;
    });
  }

  function getQueueStatus() {
    return getQueueDb().then(function(db) {
      var isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      var ident = identity();
      var configured = isConfigured(ident);
      if (!db) {
        return {
          isOnline: isOnline,
          isConfigured: configured,
          pendingCount: 0,
          errorCount: 0,
          syncedCount: 0,
          totalCount: 0,
          rows: []
        };
      }
      var tx = db.transaction(QUEUE_STORE, 'readonly');
      return idbRequest(tx.objectStore(QUEUE_STORE).getAll()).then(function(rows) {
        rows = rows || [];
        var pending = rows.filter(function(r) { return r.status === 'pending'; }).length;
        var errors = rows.filter(function(r) { return r.status === 'error'; }).length;
        var synced = rows.filter(function(r) { return r.status === 'synced'; }).length;
        return {
          isOnline: isOnline,
          isConfigured: configured,
          pendingCount: pending,
          errorCount: errors,
          syncedCount: synced,
          totalCount: rows.length,
          rows: rows
        };
      });
    });
  }

  function clearSynced() {
    return getQueueDb().then(function(db) {
      if (!db) return 0;
      var tx = db.transaction(QUEUE_STORE, 'readwrite');
      var store = tx.objectStore(QUEUE_STORE);
      return idbRequest(store.getAll()).then(function(rows) {
        var removed = 0;
        (rows || []).forEach(function(r) {
          if (r.status === 'synced') {
            store.delete(r.id);
            removed++;
          }
        });
        return removed;
      });
    });
  }

  function pullRemoteStock(state, identOverride) {
    var ident = identOverride || identity();
    if (!isConfigured(ident)) {
      return Promise.resolve({ ok: false, reason: 'not_configured' });
    }
    var base = String(ident.supabaseUrl || '').replace(/\/$/, '');
    var url = base + '/rest/v1/products?select=id,code,name,price,cost,min_stock,lots(id,qty,exp)&business_id=eq.' + encodeURIComponent(ident.businessId);
    return fetch(url, {
      method: 'GET',
      headers: {
        'apikey': ident.supabaseAnonKey,
        'Authorization': 'Bearer ' + ident.supabaseAnonKey,
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(remoteProducts) {
      if (!Array.isArray(remoteProducts)) return { ok: true, updated: 0 };
      var updated = 0;
      remoteProducts.forEach(function(rp) {
        var local = (state.products || []).find(function(p) {
          return (p.uuid && p.uuid === rp.id) || (p.code && p.code === rp.code);
        });
        if (local) {
          local.uuid = rp.id;
          if (Array.isArray(rp.lots)) {
            local.lots = rp.lots.map(function(l) {
              return {
                id: l.id,
                lotUuid: l.id,
                qty: Number(l.qty) || 0,
                exp: l.exp ? new Date(l.exp).getTime() : null,
                cost: local.cost,
                shelf: local.shelf
              };
            });
            updated++;
          }
        }
      });
      return { ok: true, updated: updated };
    });
  }

  function fetchRemoteSalesSummary(identOverride) {
    var ident = identOverride || identity();
    if (!isConfigured(ident)) {
      return Promise.resolve({ ok: false, reason: 'not_configured' });
    }
    var base = String(ident.supabaseUrl || '').replace(/\/$/, '');
    var url = base + '/rest/v1/sales?select=id,terminal_id,cashier_id,total,payment_method,created_at&business_id=eq.' + encodeURIComponent(ident.businessId) + '&order=created_at.desc';
    return fetch(url, {
      method: 'GET',
      headers: {
        'apikey': ident.supabaseAnonKey,
        'Authorization': 'Bearer ' + ident.supabaseAnonKey,
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(sales) {
      sales = sales || [];
      var terminals = {
        'caja-1': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 },
        'caja-2': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 },
        'laptop': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 }
      };
      var grandTotal = 0;
      sales.forEach(function(s) {
        var t = terminals[s.terminal_id] || (terminals[s.terminal_id] = { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 });
        var tot = Number(s.total) || 0;
        t.count++;
        t.total = Core.round2(t.total + tot);
        grandTotal = Core.round2(grandTotal + tot);
        if (s.payment_method === 'efectivo') t.ef = Core.round2(t.ef + tot);
        else if (s.payment_method === 'tarjeta') t.tarj = Core.round2(t.tarj + tot);
        else if (s.payment_method === 'transf') t.transf = Core.round2(t.transf + tot);
        else if (s.payment_method === 'fiado') t.fiado = Core.round2(t.fiado + tot);
      });
      return {
        ok: true,
        count: sales.length,
        total: grandTotal,
        terminals: terminals,
        recent: sales.slice(0, 30)
      };
    });
  }

  return {
    isConfigured: isConfigured,
    enqueueSale: enqueueSale,
    flush: flush,
    listPending: listPending,
    getQueueStatus: getQueueStatus,
    clearSynced: clearSynced,
    pullRemoteStock: pullRemoteStock,
    fetchRemoteSalesSummary: fetchRemoteSalesSummary,
    saleToRpcPayload: saleToRpcPayload
  };
});
