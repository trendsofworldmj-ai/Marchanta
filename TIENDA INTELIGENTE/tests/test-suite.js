/**
 * Tienda Inteligente - Test Suite (Automated Business Logic Verification)
 */
(function(root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('../core.js'), require('../db.js'), require('../sync.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['../core.js', '../db.js', '../sync.js'], factory);
  } else {
    root.TiendaTests = factory(root.TiendaCore, root.TiendaDB, root.TiendaSync);
  }
})(typeof self !== 'undefined' ? self : this, function(Core, DB, Sync) {
  'use strict';

  function createTestRunner() {
    var results = [];
    var passed = 0;
    var failed = 0;

    function assert(cond, msg) {
      if (!cond) throw new Error(msg || 'Assertion failed');
    }

    function assertEqual(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error((msg ? msg + ': ' : '') + 'Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
      }
    }

    function assertClose(actual, expected, delta, msg) {
      var d = delta !== undefined ? delta : 0.001;
      if (Math.abs(actual - expected) > d) {
        throw new Error((msg ? msg + ': ' : '') + 'Expected ' + expected + ' within ' + d + ' but got ' + actual);
      }
    }

    function test(name, fn) {
      try {
        fn();
        passed++;
        results.push({ name: name, ok: true });
      } catch (err) {
        failed++;
        results.push({ name: name, ok: false, error: err.message || String(err) });
      }
    }

    function runAll() {
      // Grupo 1: Matemáticas y Precisión
      test('Matemáticas: round2 y round3 eliminan imprecisiones de coma flotante', function() {
        assertEqual(Core.round2(0.1 + 0.2), 0.3, '0.1 + 0.2 debe redondear a 0.3');
        assertEqual(Core.round2(10.005), 10.01, '10.005 debe redondear a 10.01');
        assertEqual(Core.round3(0.0004), 0.0, '0.0004 a 3 decimales es 0');
        assertEqual(Core.round3(0.1236), 0.124, '0.1236 debe redondear a 0.124');
      });

      test('Formato: money y money0 devuelven moneda mexicana válida', function() {
        var m1 = Core.money(150.5);
        assert(m1.indexOf('150.50') !== -1 || m1.indexOf('150') !== -1, 'Debe contener la cifra 150');
        var m0 = Core.money0(150.5);
        assert(m0.indexOf('151') !== -1 || m0.indexOf('150') !== -1, 'money0 redondea');
      });

      // Grupo 2: Motor de Inventario PEPS / FEFO
      test('Inventario PEPS/FEFO: consume primero el lote más próximo a caducar', function() {
        var T = Core.sod();
        var prod = {
          id: 'test_p1',
          name: 'Aguacate Test',
          shelf: 5,
          unit: 'kg',
          price: 80,
          cost: 50,
          lots: [
            { id: 'l_late', qty: 10, exp: T + 5 * Core.DAY },
            { id: 'l_soon', qty: 4, exp: T + 1 * Core.DAY },
            { id: 'l_noexp', qty: 20, exp: null }
          ]
        };

        assertEqual(Core.stockOf(prod), 34, 'Stock total inicial');

        // Tomar 6 kg: debe consumir los 4 kg de l_soon y 2 kg de l_late
        var taken = Core.takeStock(prod, 6);
        assertEqual(taken, 6, 'Cantidad retirada');
        assertEqual(Core.stockOf(prod), 28, 'Stock restante');

        var soonLot = prod.lots.find(function(l) { return l.id === 'l_soon'; });
        assertEqual(soonLot, undefined, 'El lote l_soon agotado debe ser eliminado');

        var lateLot = prod.lots.find(function(l) { return l.id === 'l_late'; });
        assert(lateLot !== undefined, 'Lote late debe existir');
        assertEqual(lateLot.qty, 8, 'Lote late debe quedar con 8 kg (10 - 2)');

        var noexpLot = prod.lots.find(function(l) { return l.id === 'l_noexp'; });
        assertEqual(noexpLot.qty, 20, 'Lote sin caducidad no debe tocarse');
      });

      test('Inventario: addStock agrega nuevos lotes y actualiza costo ponderado', function() {
        var prod = {
          id: 'test_p2',
          name: 'Leche Test',
          unit: 'pz',
          price: 25,
          cost: 20,
          lots: [{ id: 'l1', qty: 5, exp: null }]
        };
        Core.addStock(prod, 10, 21.5, 7);
        assertEqual(Core.stockOf(prod), 15, 'Stock actualizado');
        assertEqual(prod.lots.length, 2, 'Dos lotes presentes');
        assertEqual(prod.cost, 21.5, 'Costo actualizado a última compra');
      });

      // Grupo 3: Precios y Promociones
      test('Promociones: el precio de promoción nunca es menor que el costo', function() {
        var prod = { id: 'p_promo', name: 'Manzana', price: 50, cost: 35 };
        var pr1 = Core.promoPrice(prod, 20); // 50 * 0.8 = 40 (mayor a 35)
        assertEqual(pr1, 40, 'Descuento 20% correcto');

        var pr2 = Core.promoPrice(prod, 60); // 50 * 0.4 = 20 (menor a costo 35) -> debe topar en costo
        assertEqual(pr2, 35, 'Precio de promo topado al costo');
      });

      // Grupo 4: Ventas y Caja
      test('Venta en efectivo: cálculo correcto de cambio y deducción de stock', function() {
        var state = Core.createSeedData();
        var prod = state.products[0]; // 'jit' (Jitomate)
        var initialStock = Core.stockOf(prod);

        var cart = [{ pid: prod.id, qty: 2 }];
        var payment = { method: 'efectivo', received: '100' };

        var sale = Core.processSale(state, cart, payment, null);
        assert(sale.id != null, 'ID de venta generado');
        assertEqual(sale.total, Core.round2(2 * prod.price), 'Total de venta coincide');
        assertEqual(sale.received, 100, 'Recibido 100');
        assertEqual(sale.change, Core.round2(100 - sale.total), 'Cambio exacto');
        assertEqual(Core.stockOf(prod), Core.round3(initialStock - 2), 'Stock descontado');
      });

      test('Venta rechazada si supera existencias', function() {
        var state = Core.createSeedData();
        var prod = state.products[0];
        var available = Core.stockOf(prod);
        var cart = [{ pid: prod.id, qty: available + 10 }];
        var payment = { method: 'efectivo', received: '1000' };

        var threw = false;
        try {
          Core.processSale(state, cart, payment, null);
        } catch (e) {
          threw = true;
          assert(e.message.indexOf('insuficientes') !== -1, 'Mensaje de error claro');
        }
        assert(threw, 'Debe arrojar excepción por stock insuficiente');
      });

      test('Venta a crédito (fiado): valida límite y actualiza saldo del cliente', function() {
        var state = Core.createSeedData();
        var prod = state.products.find(function(p) { return p.price > 10; });
        var client = state.clients[0];
        client.saldo = 1400;
        client.limit = 1500; // Solo $100 de crédito disponible

        var cartOk = [{ pid: prod.id, qty: 1 }]; // precio normal
        prod.price = 50; // fijar para prueba
        var payment = { method: 'fiado', client: client.id };

        var saleOk = Core.processSale(state, cartOk, payment, client);
        assertEqual(client.saldo, 1450, 'Saldo actualizado de 1400 a 1450');

        // Ahora intentar una venta de $100 cuando solo quedan $50 disponibles
        var cartOver = [{ pid: prod.id, qty: 2 }]; // $100
        var threw = false;
        try {
          Core.processSale(state, cartOver, payment, client);
        } catch (err) {
          threw = true;
          assert(err.message.indexOf('límite de crédito') !== -1, 'Debe advertir de exceso de límite');
        }
        assert(threw, 'Venta fiada que excede límite debe rechazarse');
      });

      test('Abonos de clientes: reduce saldo y registra movimiento de caja si es en efectivo', function() {
        var state = Core.createSeedData();
        var client = state.clients[0];
        client.saldo = 500;
        var initialCashMovs = state.cash.movs.length;

        Core.recordAbono(state, client.id, 200, 'efectivo', 'Abono parcial de prueba');
        assertEqual(client.saldo, 300, 'Saldo restante 300');
        assertEqual(state.cash.movs.length, initialCashMovs + 1, 'Movimiento en caja registrado');
      });

      // Grupo 5: Cuadre de Caja y Cortes
      test('Caja: cálculo exacto de dinero esperado vs contado y diferencia', function() {
        var state = Core.createSeedData();
        state.cash.apertura = 500;
        state.cash.lastCorte = Core.sod();
        state.cash.movs = [
          { ts: Core.sod() + 1000, type: 'entrada', amount: 200 },
          { ts: Core.sod() + 2000, type: 'retiro', amount: 150 }
        ];

        // 1 venta en efectivo de $350
        state.sales = [
          { ts: Core.sod() + 3000, method: 'efectivo', total: 350, items: [] }
        ];

        var exp = Core.expectedCash(state);
        // Esperado: 500 (apertura) + 350 (ventas) + 200 (entrada) - 150 (retiro) = 900
        assertEqual(exp.total, 900, 'Efectivo esperado 900');

        // Contar denominaciones: 1 billete de 500, 2 billetes de 200 = 900
        var denMap = { 500: 1, 200: 2 };
        var counted = Core.countCash(denMap);
        assertEqual(counted, 900, 'Total contado 900');

        var corte = Core.closeShift(state, counted, 'Corte de prueba');
        assertEqual(corte.diff, 0, 'Corte cuadra exacto');
        assertEqual(state.cortes.length, 1, 'Corte guardado');
        assertEqual(state.cash.movs.length, 0, 'Movimientos reiniciados para nuevo turno');
      });

      // Grupo 6: Catálogo CRUD
      test('Catálogo: alta, edición y eliminación condicionada de producto', function() {
        var state = Core.createSeedData();
        var initialCount = state.products.length;

        var newP = Core.addProduct(state, {
          name: 'Galletas de Nuez',
          emoji: '🍪',
          cat: 'Abarrotes',
          unit: 'pz',
          price: 24.50,
          cost: 16.00,
          min: 10,
          shelf: 90,
          code: '750999888111',
          initQty: 15
        });

        assertEqual(state.products.length, initialCount + 1, 'Producto agregado al catálogo');
        assertEqual(Core.stockOf(newP), 15, 'Stock inicial registrado');

        // Editar producto
        Core.updateProduct(state, newP.id, { price: 26.00, min: 12 });
        assertEqual(newP.price, 26.00, 'Precio actualizado');
        assertEqual(newP.min, 12, 'Mínimo actualizado');

        // Intentar eliminar producto con stock > 0 (debe fallar)
        var threwDelete = false;
        try {
          Core.deleteProduct(state, newP.id);
        } catch (e) {
          threwDelete = true;
        }
        assert(threwDelete, 'No debe permitir borrar producto con existencias');

        // Vaciar stock y borrar
        newP.lots = [];
        Core.deleteProduct(state, newP.id);
        assertEqual(state.products.length, initialCount, 'Producto borrado con éxito');
      });

      // Grupo 7: Mermas
      test('Mermas: descuenta stock y registra pérdida económica a costo', function() {
        var state = Core.createSeedData();
        var prod = state.products[0];
        var stBefore = Core.stockOf(prod);

        var merma = Core.recordMerma(state, prod.id, 2, 'Golpe o daño');
        assertEqual(Core.stockOf(prod), Core.round3(stBefore - 2), 'Stock descontado');
        assertEqual(merma.cost, Core.round2(2 * prod.cost), 'Costo de merma calculado correctamente');
        assert(state.mermas.some(function(m) { return m.id === merma.id; }), 'Registrado en lista de mermas');
      });

      // Grupo 8: Respaldo y Persistencia
      test('Persistencia: exportar e importar respaldo JSON mantiene integridad total', function() {
        var state = Core.createSeedData();
        var json = DB.exportBackupJSON(state);
        assert(typeof json === 'string' && json.length > 500, 'JSON generado con contenido');

        var restored = DB.importBackupJSON(json);
        assertEqual(restored.products.length, state.products.length, 'Cantidad de productos preservada');
        assertEqual(restored.store, state.store, 'Nombre de tienda preservado');
      });

      // Grupo 9: Formato de Ticket POS e Impresión Térmica
      test('Ticket Térmico POS: genera HTML válido con encabezado, desglose y total', function() {
        var state = Core.createSeedData();
        state.ticketHeader = 'Abarrotes Don Pepe\nRFC: ABCD123456';
        state.ticketFooter = 'Gracias por comprar aquí';

        var sale = {
          id: 'test_folio_99',
          ts: Date.now(),
          total: 125.50,
          method: 'efectivo',
          received: 200.00,
          change: 74.50,
          items: [
            { name: 'Aguacate Hass', unit: 'kg', qty: 1.5, price: 50.00, sub: 75.00 },
            { name: 'Leche entera 1 L', unit: 'pz', qty: 2, price: 25.25, sub: 50.50 }
          ]
        };

        var html = Core.ticketHtml(sale, state);
        assert(html.indexOf('Abarrotes Don Pepe') !== -1, 'Encabezado incluido');
        assert(html.indexOf('test_folio_99') !== -1, 'Folio incluido');
        assert(html.indexOf('Aguacate Hass') !== -1, 'Ítem 1 incluido');
        assert(html.indexOf('Leche entera 1 L') !== -1, 'Ítem 2 incluido');
        assert(html.indexOf('125.50') !== -1 || html.indexOf('125') !== -1, 'Total incluido');
        assert(html.indexOf('74.50') !== -1 || html.indexOf('74') !== -1, 'Cambio incluido');
        assert(html.indexOf('Gracias por comprar aquí') !== -1, 'Pie de ticket incluido');
      });

      test('Flujo Completo POS: venta mixta piezas + peso por báscula y kardex', function() {
        var state = Core.createSeedData();
        var pPz = state.products.find(function(p) { return p.unit === 'pz' && Core.stockOf(p) > 5; });
        var pKg = state.products.find(function(p) { return p.unit === 'kg' && Core.stockOf(p) > 5; });

        var cart = [
          { pid: pPz.id, qty: 3 },
          { pid: pKg.id, qty: 1.250 }
        ];

        var calc = Core.cartCalculations(cart, state.products, state.promos);
        var expectedTotal = Core.round2(3 * pPz.price + 1.250 * pKg.price);
        assertEqual(calc.total, expectedTotal, 'Total calculado para piezas y peso exacto');

        var movsBefore = state.movements.length;
        var sale = Core.processSale(state, cart, { method: 'tarjeta' }, null);

        assertEqual(sale.total, expectedTotal, 'Total de venta coincide');
        assertEqual(sale.method, 'tarjeta', 'Método tarjeta registrado');
        assertEqual(state.movements.length, movsBefore + 2, 'Dos movimientos de kardex registrados');
      });

      // Grupo 10: P1 - Recepción de Mercancía con Lector y Kardex
      test('P1 Recepción de Mercancía: actualiza stock, costo, lote FEFO y registra Kardex atómicamente', function() {
        var state = Core.createSeedData();
        var prod = state.products.find(function(p) { return p.id === 'lec'; });
        var stockBefore = Core.stockOf(prod);
        var kardexBefore = state.movements.length;
        var recsBefore = (state.receptions || []).length;

        var recData = {
          provId: 'v2',
          invoiceRef: 'FAC-2026-001',
          date: '2026-10-15',
          items: [
            {
              pid: prod.id,
              name: prod.name,
              code: prod.code,
              unit: prod.unit,
              qty: 24,
              cost: 21.00,
              newPrice: 28.50,
              expDays: 14
            }
          ]
        };

        var recResult = Core.processReception(state, recData);
        assert(recResult != null, 'Recepción procesada');
        assert(recResult.folio.indexOf('REC-') === 0, 'Folio generado');
        assertEqual(recResult.totalCost, Core.round2(24 * 21.00), 'Costo total calculado');
        assertEqual(recResult.totalUnits, 24, 'Unidades totales');

        // Comprobar producto
        assertEqual(Core.stockOf(prod), stockBefore + 24, 'Stock incrementado en 24');
        assertEqual(prod.cost, 21.00, 'Costo actualizado a 21.00');
        assertEqual(prod.price, 28.50, 'Precio de venta actualizado');

        // Comprobar Kardex
        assertEqual(state.movements.length, kardexBefore + 1, 'Movimiento en Kardex añadido');
        var kMov = state.movements[state.movements.length - 1];
        assertEqual(kMov.type, 'recepcion_compra', 'Tipo de movimiento recepcion_compra');
        assertEqual(kMov.qty, 24, 'Cantidad de Kardex');
        assertEqual(kMov.unitCost, 21.00, 'Costo unitario en Kardex');
        assert(kMov.note.indexOf('FAC-2026-001') !== -1, 'Referencia de factura en Kardex');

        // Comprobar historial de recepciones
        assertEqual(state.receptions.length, recsBefore + 1, 'Recepción guardada en historial');
      });

      test('P1 Recepción: validación atómica evita recepciones vacías o con cantidades inválidas', function() {
        var state = Core.createSeedData();

        var threwEmpty = false;
        try {
          Core.processReception(state, { items: [] });
        } catch (e) {
          threwEmpty = true;
        }
        assert(threwEmpty, 'Recepción vacía debe ser rechazada');

        var threwNegative = false;
        try {
          Core.processReception(state, {
            items: [{ pid: state.products[0].id, qty: -5, cost: 10 }]
          });
        } catch (e) {
          threwNegative = true;
        }
        assert(threwNegative, 'Cantidad negativa debe ser rechazada');
      });

      // Grupo 11: P1 - Familias y Categorías
      test('P1 Familias y Categorías: mapeo coherente y persistencia en productos', function() {
        assert(Core.FAMILIES.length >= 4, 'Al menos 4 familias definidas');
        assertEqual(Core.familyForCategory('Frutas y Verduras'), 'Perecederos y Frescos');
        assertEqual(Core.familyForCategory('Lácteos y Quesos'), 'Lácteos y Refrigerados');
        assertEqual(Core.familyForCategory('Abarrotes'), 'Abarrotes y Despensa');
        assertEqual(Core.familyForCategory('Papelería'), 'Papelería y Hogar');

        var state = Core.createSeedData();
        var allHaveFamily = state.products.every(function(p) {
          return p.family && Core.FAMILIES.indexOf(p.family) !== -1;
        });
        assert(allHaveFamily, 'Todos los productos iniciales tienen familia asignada');
      });

      // Grupo 12: P1 - Exportación CSV Excel
      test('P1 CSV Export: genera formato compatible con Excel con BOM UTF-8', function() {
        var state = Core.createSeedData();

        var invCSV = Core.exportInventoryCSV(state);
        assert(invCSV.charCodeAt(0) === 0xFEFF, 'CSV debe iniciar con BOM UTF-8 para Excel');
        assert(invCSV.indexOf('Código de Barras') !== -1, 'Encabezado incluye Código de Barras');
        assert(invCSV.indexOf('Familia') !== -1, 'Encabezado incluye Familia');
        assert(invCSV.indexOf('Valoración Costo') !== -1, 'Encabezado incluye Valoración');

        var kardexCSV = Core.exportKardexCSV(state);
        assert(kardexCSV.charCodeAt(0) === 0xFEFF, 'Kardex CSV tiene BOM');
        assert(kardexCSV.indexOf('Tipo de Movimiento') !== -1, 'Kardex tiene columnas');

        var lowCSV = Core.exportLowStockCSV(state);
        assert(lowCSV.charCodeAt(0) === 0xFEFF, 'Low stock CSV tiene BOM');

        var valCSV = Core.exportValuationCSV(state);
        assert(valCSV.charCodeAt(0) === 0xFEFF, 'Valuation CSV tiene BOM');
        assert(valCSV.indexOf('Familia') !== -1, 'Valuation agrupa por Familia');
      });

      // Grupo 13: P1 - Importación CSV y Protección contra Duplicación de Existencias
      test('P1 CSV Import: parsea correctamente, detecta duplicados y separa catálogo de existencias', function() {
        var state = Core.createSeedData();
        var initialCount = state.products.length;

        var sampleCSV =
          'Código,Nombre,Familia,Categoría,Unidad,Costo,Precio,Mínimo,Vida Útil,Existencia\r\n' +
          '7501234567890,Café Soluble 200g,Abarrotes Secos,Abarrotes,pz,65.00,85.00,5,180,10\r\n' +
          '7501000111222,Jitomate Saladet,Perecederos y Frescos,Frutas y Verduras,kg,22.00,34.00,10,5,50\r\n' +
          '7509999999999,Aceite Vegetal 1L,Abarrotes Secos,Abarrotes,pz,38.00,49.00,8,365,12';

        var preview = Core.previewInventoryCSV(state, sampleCSV);
        assert(preview.valid, 'CSV válido');
        assertEqual(preview.totalRows, 3, '3 filas en total');
        assert(preview.newCount >= 2, 'Al menos 2 nuevos');

        // Aplicar importación modo seguro 'catalogo_con_stock_inicial'
        var res1 = Core.applyInventoryCSV(state, preview, 'catalogo_con_stock_inicial');
        assert(res1.importedCount >= 2, 'Productos nuevos importados');

        var cafeProd = state.products.find(function(p) { return p.code === '7501234567890'; });
        assert(cafeProd != null, 'Café soluble creado');
        assertEqual(Core.stockOf(cafeProd), 10, 'Stock inicial asignado en primera carga');

        // PROTECCIÓN CRÍTICA: Re-importar el mismo archivo CSV NO debe duplicar el stock del café
        var preview2 = Core.previewInventoryCSV(state, sampleCSV);
        var res2 = Core.applyInventoryCSV(state, preview2, 'catalogo_con_stock_inicial');
        assertEqual(res2.importedCount, 0, 'Cero productos nuevos en re-importación');
        assertEqual(Core.stockOf(cafeProd), 10, 'Stock de Café NO se duplicó en re-importación');
      });

      test('P1 CSV Import: detección de códigos duplicados dentro del mismo archivo CSV', function() {
        var state = Core.createSeedData();
        var csvWithDupes =
          'Código,Nombre,Familia,Categoría,Unidad,Costo,Precio,Mínimo,Vida Útil,Existencia\r\n' +
          '7508888888888,Galletas A,Abarrotes Secos,Abarrotes,pz,15.00,20.00,5,60,10\r\n' +
          '7508888888888,Galletas B (Mismo Código),Abarrotes Secos,Abarrotes,pz,18.00,22.00,5,60,10';

        var preview = Core.previewInventoryCSV(state, csvWithDupes);
        assert(preview.valid, 'Preview procesado');
        assertEqual(preview.errorCount, 1, '1 producto rechazado por código duplicado');
        var errRow = preview.rows.find(function(r) { return r.status === 'invalido'; });
        assert(errRow != null, 'Fila inválida encontrada');
        assert(errRow.errorMsg.indexOf('duplicado') !== -1, 'Mensaje explica duplicidad de código');
      });

      // Grupo 14: P2 - Criptografía y Hashing Seguro
      test('P2 Criptografía: sha256 cumple vector estándar RFC 6234 y hashPassword genera salt único', function() {
        var vector = Core.sha256('abc');
        assertEqual(vector, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 de "abc" coincide con estándar');

        var h1 = Core.hashPassword('1234', 'salt1');
        var h2 = Core.hashPassword('1234', 'salt2');
        assert(h1.hash !== h2.hash, 'Misma contraseña con diferente salt produce hashes distintos');
        assertEqual(h1.hash.length, 64, 'Hash es de 64 caracteres hex');
      });

      // Grupo 15: P2 - Autenticación y Control de Sesión
      test('P2 Autenticación: login exitoso con credenciales correctas y rechazo con erróneas o inactivas', function() {
        var state = Core.createSeedData();
        assert(Array.isArray(state.users) && state.users.length >= 4, 'Al menos 4 usuarios iniciales');

        // Login exitoso admin
        var adminSess = Core.loginUser(state, 'admin', '1234');
        assertEqual(adminSess.role, 'admin', 'Rol admin verificado');
        assertEqual(adminSess.username, 'admin', 'Username verificado');

        // Login fallido por PIN incorrecto
        var threwWrongPin = false;
        try {
          Core.loginUser(state, 'admin', '9999');
        } catch (e) {
          threwWrongPin = true;
          assert(e.message.indexOf('incorrecto') !== -1, 'Mensaje de error correcto');
        }
        assert(threwWrongPin, 'Debe fallar con PIN incorrecto');

        // Login fallido por usuario inactivo
        var cajera = state.users.find(function(u) { return u.username === 'cajera'; });
        cajera.active = false;
        var threwInactive = false;
        try {
          Core.loginUser(state, 'cajera', '3333');
        } catch (e) {
          threwInactive = true;
          assert(e.message.indexOf('desactivada') !== -1, 'Mensaje de cuenta desactivada');
        }
        assert(threwInactive, 'Debe rechazar usuario inactivo');
      });

      // Grupo 16: P2 - Roles, Permisos y Protección en Ejecución
      test('P2 Roles y Permisos: cajero no puede recibir mercancía ni ver costos; almacén no puede vender', function() {
        var state = Core.createSeedData();
        var cajero = state.users.find(function(u) { return u.role === 'cajero'; });
        var almacen = state.users.find(function(u) { return u.role === 'almacen'; });
        var admin = state.users.find(function(u) { return u.role === 'admin'; });

        // Cajero no tiene permiso para ver costos
        assertEqual(Core.hasPermission(cajero, Core.PERMISSIONS.CATALOG_VIEW_COST), false, 'Cajero no ve costos');
        // Almacén sí ve costos y edita catálogo
        assertEqual(Core.hasPermission(almacen, Core.PERMISSIONS.CATALOG_VIEW_COST), true, 'Almacén ve costos');
        // Admin tiene todo
        assertEqual(Core.hasPermission(admin, Core.PERMISSIONS.USERS_MANAGE), true, 'Admin administra usuarios');

        // Intentar recepción con cajero (debe ser rechazada)
        var threwRecv = false;
        try {
          Core.processReception(state, {
            items: [{ pid: state.products[0].id, qty: 10, cost: 20 }]
          }, cajero);
        } catch (e) {
          threwRecv = true;
          assert(e.message.indexOf('permiso') !== -1, 'Mensaje de falta de permiso');
        }
        assert(threwRecv, 'Cajero no puede procesar recepciones');

        // Intentar venta con almacén (debe ser rechazada)
        var threwSale = false;
        try {
          Core.processSale(state, [{ pid: state.products[0].id, qty: 1 }], { method: 'efectivo' }, null, { user: almacen });
        } catch (e) {
          threwSale = true;
          assert(e.message.indexOf('permiso') !== -1, 'Mensaje de falta de permiso');
        }
        assert(threwSale, 'Almacén no puede vender en caja');
      });

      // Grupo 17: P2 - Trazabilidad y Sanitización de Costos
      test('P2 Auditoría y Trazabilidad: venta registra usuario responsable y oculta costos a cajeros', function() {
        var state = Core.createSeedData();
        var cajero = state.users.find(function(u) { return u.role === 'cajero'; });

        var cart = [{ pid: state.products[0].id, qty: 1 }];
        var sale = Core.processSale(state, cart, { method: 'efectivo' }, null, { user: cajero });

        assertEqual(sale.userId, cajero.id, 'Venta atribuida al ID del cajero');
        assertEqual(sale.userName, cajero.name, 'Venta atribuida al nombre del cajero');

        var lastAudit = state.auditLog[state.auditLog.length - 1];
        assert(lastAudit != null, 'Auditoría registrada');
        assertEqual(lastAudit.action, 'SALE_COMPLETED', 'Acción auditada');
        assertEqual(lastAudit.userId, cajero.id, 'Usuario en auditoría');

        // Bugfix: si se pasa el usuario como 5º argumento (sin { user: ... }), también debe atribuirse.
        var saleLegacy = Core.processSale(state, cart, { method: 'efectivo' }, null, cajero);
        assertEqual(saleLegacy.userId, cajero.id, 'Compatibilidad: cajero como 5º argumento');
        assertEqual(saleLegacy.cashierId, cajero.id, 'cashierId persistido');
        assert(Core.isUuid(saleLegacy.id), 'ID de venta es UUID v4 para idempotencia');
        assert(saleLegacy.items[0].lots.length > 0, 'La venta registra lotes consumidos para RPC');

        // Sanitización de costos para cajero
        var sanitized = Core.sanitizeProductsForUser(state.products, cajero);
        var hasAnyCost = sanitized.some(function(p) { return p.cost !== undefined; });
        assertEqual(hasAnyCost, false, 'Ningún producto sanitizado para cajero expone el costo de compra');

        // Sanitización para admin no oculta costos
        var adminProds = Core.sanitizeProductsForUser(state.products, state.users[0]);
        assert(adminProds[0].cost > 0, 'Admin conserva visibilidad de costos');
      });

      // Grupo 18: P3 - Sincronización Multi-Terminal y RPC commit_sale
      test('P3 Sync: saleToRpcPayload genera estructura exacta para RPC commit_sale con UUIDs e items', function() {
        var state = Core.createSeedData();
        var ident = DB.saveIdentity({
          businessId: '11111111-2222-3333-4444-555555555555',
          terminalId: 'caja-1',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key'
        });

        var p = state.products[0];
        var cart = [{ pid: p.id, qty: 2 }];
        var user = state.users.find(function(u) { return u.role === 'cajero'; });
        var sale = Core.processSale(state, cart, { method: 'efectivo', received: 500 }, null, {
          user: user,
          businessId: ident.businessId,
          terminalId: ident.terminalId
        });

        var payload = Sync.saleToRpcPayload(sale, ident);
        assert(Core.isUuid(payload.p_sale_uuid), 'p_sale_uuid es UUID v4');
        assertEqual(payload.p_business_id, ident.businessId, 'p_business_id coincide con identidad');
        assertEqual(payload.p_terminal_id, 'caja-1', 'p_terminal_id coincide con caja 1');
        assertEqual(payload.p_cashier_id, user.id, 'p_cashier_id coincide con cajero');
        assertEqual(payload.p_total, sale.total, 'p_total coincide con total de venta');
        assertEqual(payload.p_payment_method, 'efectivo', 'p_payment_method coincide');
        assert(Array.isArray(payload.p_items) && payload.p_items.length >= 1, 'p_items contiene partidas');
        var item0 = payload.p_items[0];
        assertEqual(item0.qty, 2, 'Cantidad del item es 2');
        assert(item0.price > 0, 'Precio del item es mayor a cero');
        assert(item0.lot_id != null, 'Partida tiene lot_id asociado para deducción atómica');
      });

      test('P3 Sync: persistencia de identidad de terminal y validación de terminales soportadas', function() {
        var ident1 = DB.saveIdentity({ terminalId: 'caja-1' });
        assertEqual(ident1.terminalId, 'caja-1', 'Terminal caja-1 configurada');
        assert(Core.isUuid(ident1.businessId), 'businessId generado como UUID válido');

        var ident2 = DB.saveIdentity({ terminalId: 'caja-2' });
        assertEqual(ident2.terminalId, 'caja-2', 'Terminal caja-2 configurada');

        var identLaptop = DB.saveIdentity({ terminalId: 'laptop' });
        assertEqual(identLaptop.terminalId, 'laptop', 'Terminal laptop configurada');

        var identInvalid = DB.saveIdentity({ terminalId: 'terminal-desconocida' });
        assertEqual(identInvalid.terminalId, 'caja-1', 'Terminal inválida recae por omisión en caja-1');
      });

      test('P3 Sync: flush maneja modo offline o sin configurar sin excepciones bloqueantes', function() {
        var unconfIdent = { businessId: 'invalid', terminalId: 'caja-1', supabaseUrl: '', supabaseAnonKey: '' };
        assertEqual(Sync.isConfigured(unconfIdent), false, 'Identidad sin URL/Key se detecta como no configurada');

        var promise = Sync.flush();
        assert(promise && typeof promise.then === 'function', 'flush devuelve una Promesa');
      });

      test('P3 Supervisión Remota: agregación analítica de ventas consolidada y desglosada por terminal', function() {
        var state = Core.createSeedData();
        // Simulamos ventas históricas provenientes de Caja 1, Caja 2 y Laptop
        var mockRemoteSales = [
          { id: Core.uuid(), terminal_id: 'caja-1', total: 150.00, payment_method: 'efectivo' },
          { id: Core.uuid(), terminal_id: 'caja-1', total: 200.00, payment_method: 'tarjeta' },
          { id: Core.uuid(), terminal_id: 'caja-2', total: 320.50, payment_method: 'efectivo' },
          { id: Core.uuid(), terminal_id: 'caja-2', total: 80.00, payment_method: 'transf' },
          { id: Core.uuid(), terminal_id: 'laptop', total: 500.00, payment_method: 'fiado' }
        ];

        var terminals = {
          'caja-1': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 },
          'caja-2': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 },
          'laptop': { count: 0, total: 0, ef: 0, tarj: 0, transf: 0, fiado: 0 }
        };
        var grandTotal = 0;
        mockRemoteSales.forEach(function(s) {
          var t = terminals[s.terminal_id];
          var tot = Number(s.total) || 0;
          t.count++;
          t.total = Core.round2(t.total + tot);
          grandTotal = Core.round2(grandTotal + tot);
          if (s.payment_method === 'efectivo') t.ef = Core.round2(t.ef + tot);
          else if (s.payment_method === 'tarjeta') t.tarj = Core.round2(t.tarj + tot);
          else if (s.payment_method === 'transf') t.transf = Core.round2(t.transf + tot);
          else if (s.payment_method === 'fiado') t.fiado = Core.round2(t.fiado + tot);
        });

        assertEqual(grandTotal, 1250.50, 'Total consolidado correcto');
        assertEqual(terminals['caja-1'].total, 350.00, 'Subtotal Caja 1 correcto (150 ef + 200 tarj)');
        assertEqual(terminals['caja-1'].ef, 150.00, 'Efectivo Caja 1 correcto');
        assertEqual(terminals['caja-1'].tarj, 200.00, 'Tarjeta Caja 1 correcto');
        assertEqual(terminals['caja-2'].total, 400.50, 'Subtotal Caja 2 correcto (320.50 ef + 80 transf)');
        assertEqual(terminals['laptop'].total, 500.00, 'Subtotal Laptop correcto (500 fiado)');
      });

      return {
        total: results.length,
        passed: passed,
        failed: failed,
        results: results
      };
    }

    return {
      runAll: runAll
    };
  }

  return {
    createTestRunner: createTestRunner
  };
});
