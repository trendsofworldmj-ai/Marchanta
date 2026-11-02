/**
 * Tienda Inteligente - Persistence Engine (IndexedDB + localStorage + Backup)
 * Resilient offline-first storage with automatic synchronization.
 */
(function(root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./core.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./core.js'], factory);
  } else {
    root.TiendaDB = factory(root.TiendaCore);
  }
})(typeof self !== 'undefined' ? self : this, function(Core) {
  'use strict';

  var STORAGE_KEY = 'tiendaInteligente.state.v2';
  var IDENTITY_KEY = 'tiendaInteligente.identity.v1';
  var DB_NAME = 'tienda_inteligente_db';
  var STORE_NAME = 'app_state';
  var DB_VERSION = 1;
  var TERMINALS = [
    { id: 'caja-1', name: 'Caja 1' },
    { id: 'caja-2', name: 'Caja 2' },
    { id: 'laptop', name: 'Panel propietario' }
  ];

  var idbPromise = null;

  function getIDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!idbPromise) {
      idbPromise = new Promise(function(resolve) {
        try {
          var req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = function(e) {
            resolve(e.target.result);
          };
          req.onerror = function() {
            resolve(null);
          };
        } catch (err) {
          resolve(null);
        }
      });
    }
    return idbPromise;
  }

  function loadSync() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return Core.validateState(parsed);
        }
      }
    } catch (e) {
      console.warn('Error reading localStorage state, initializing seed data:', e);
    }
    var seed = Core.createSeedData();
    saveSync(seed);
    return seed;
  }

  function saveSync(state) {
    try {
      var json = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
      console.warn('localStorage save warning (quota or restricted):', e);
    }

    // Guardado asíncrono en IndexedDB como respaldo duradero
    getIDB().then(function(db) {
      if (!db) return;
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put(state, 'current');
      } catch (err) {
        console.warn('IndexedDB save error:', err);
      }
    });
  }

  function loadAsync() {
    return getIDB().then(function(db) {
      if (!db) return loadSync();
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var store = tx.objectStore(STORE_NAME);
          var req = store.get('current');
          req.onsuccess = function() {
            if (req.result && typeof req.result === 'object') {
              resolve(Core.validateState(req.result));
            } else {
              resolve(loadSync());
            }
          };
          req.onerror = function() {
            resolve(loadSync());
          };
        } catch (e) {
          resolve(loadSync());
        }
      });
    });
  }

  function exportBackupJSON(state) {
    var cleanState = Core.validateState(state);
    return JSON.stringify(cleanState, null, 2);
  }

  function downloadBackupFile(state) {
    var json = exportBackupJSON(state);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    var dateStr = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
    var filename = 'respaldo_tienda_' + dateStr + '.json';

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function importBackupJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      throw new Error('Archivo de respaldo vacío o inválido');
    }
    var data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('Estructura de respaldo no reconocida');
    }
    if (!Array.isArray(data.products)) {
      throw new Error('El respaldo no contiene un catálogo de productos válido');
    }
    var validated = Core.validateState(data);
    saveSync(validated);
    return validated;
  }

  function normalizeIdentity(raw) {
    var ident = raw && typeof raw === 'object' ? raw : {};
    var terminalIds = TERMINALS.map(function(t) { return t.id; });
    var terminalId = String(ident.terminalId || ident.terminal_id || 'caja-1');
    if (terminalIds.indexOf(terminalId) === -1) terminalId = 'caja-1';
    var businessId = String(ident.businessId || ident.business_id || '');
    if (!Core.isUuid(businessId)) businessId = Core.uuid();
    return {
      businessId: businessId,
      terminalId: terminalId,
      supabaseUrl: String(ident.supabaseUrl || ident.supabase_url || '').trim(),
      supabaseAnonKey: String(ident.supabaseAnonKey || ident.supabase_anon_key || '').trim()
    };
  }

  function saveIdentity(ident) {
    var normalized = normalizeIdentity(ident);
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.warn('No se pudo guardar identidad de terminal:', e);
    }
    getIDB().then(function(db) {
      if (!db) return;
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(normalized, 'identity');
      } catch (err) {
        console.warn('IndexedDB identity save error:', err);
      }
    });
    return normalized;
  }

  function loadIdentity() {
    try {
      var raw = localStorage.getItem(IDENTITY_KEY);
      if (raw) {
        return saveIdentity(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Error leyendo identidad de terminal:', e);
    }
    return saveIdentity(normalizeIdentity({}));
  }

  function downloadCSVFile(csvContent, filename) {
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'reporte.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    IDENTITY_KEY: IDENTITY_KEY,
    TERMINALS: TERMINALS,
    loadSync: loadSync,
    saveSync: saveSync,
    loadAsync: loadAsync,
    loadIdentity: loadIdentity,
    saveIdentity: saveIdentity,
    exportBackupJSON: exportBackupJSON,
    downloadBackupFile: downloadBackupFile,
    importBackupJSON: importBackupJSON,
    downloadCSVFile: downloadCSVFile
  };
});
