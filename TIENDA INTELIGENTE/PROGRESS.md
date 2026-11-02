# Progreso del Proyecto: Tienda Inteligente

## Estado General
- **Fase actual:** P0 y P1 Completados y Verificados (100% Funcionales).
- **Plataforma:** Aplicación Web Autónoma (Offline-First), arquitectura desacoplada (`core.js`, `db.js`, `app.js`, `index.html`), compatible con Chrome, Edge en Windows, Android e iOS.
- **Runtimes utilizados:** PowerShell 5.1 y Google Chrome Headless para ejecución de pruebas sin dependencias externas ni compiladores.

---

## Módulos Completados

### Bloque P0: Base Comercial y Operativa
1. **Copia de seguridad del prototipo:**
   - Respaldo original inmutable en `original_prototype/Tienda_Inteligente_Prototipo.html`.
2. **Motor de Persistencia Resiliente (`db.js`):**
   - Persistencia híbrida transaccional (IndexedDB para almacenamiento duradero + fallback síncrono ultra-rápido en `localStorage`).
   - Exportación de respaldos completos en archivo JSON (`respaldo_tienda_YYYYMMDD_HHMM.json`).
   - Importación y validación de esquemas de respaldo con recuperación en un clic.
3. **Gestión Completa de Catálogo CRUD (`core.js` + `app.js`):**
   - Alta de nuevos productos con nombre, emoji, categoría, unidad (kg/pz), costo, precio, mínimo de alerta, vida útil, código de barras y lote inicial.
   - Edición completa de productos y eliminación protegida (rechaza eliminación si hay existencias activas).
   - Detección y escaneo rápido de código de barras desde caja con tecla `Enter` y auto-creación guiada si no existe.
4. **Punto de Venta (POS) y Cobranza:**
   - Operaciones de ticket con control de existencias en tiempo real.
   - Báscula simulada con desglose por peso (kg) o importe en pesos ($).
   - Formas de pago múltiples: Efectivo (con desglose de cambio automático), Tarjeta, Transferencia y Cuenta Fiada.
   - Control estricto de límite de crédito para clientes fiados.
   - Deducción atómica de inventario con algoritmo **PEPS / FEFO** (Primeras Entradas / Primeras Caducidades, Primeras Salidas).
   - Generación de tickets impresos en formato estándar para impresoras térmicas POS (58mm / 80mm vía `window.print()`), texto para portapapeles y enlace directo a WhatsApp.
5. **Caja y Arqueo:**
   - Fondo de apertura, control de entradas y retiros de efectivo.
   - Desglose físico por 11 denominaciones (de $1,000 hasta 50¢) con cálculo automático de sobrante o faltante.
   - Cierre de turno y archivo histórico de cortes.

### Bloque P1: Inventario, Recepción y Gestión de Mercancía
6. **Pantalla Dedicada de Recepción de Mercancía con Lector (`app.js` + `core.js`):**
   - Pestaña dedicada "📥 Recepción" con campo autofocus para lector de código de barras.
   - Si el código existe en catálogo, se agrega o incrementa automáticamente en la lista de recepción.
   - Si el código no está registrado, precarga el modal de creación con el código capturado y lo inserta directo en la lista de recepción tras guardarlo.
   - Captura de proveedor, factura / remisión y fecha de compra.
   - Edición ágil en tabla de cantidades recibidas, costo unitario de compra, nuevo precio de venta al público y días de vida útil para caducidad.
   - Confirmación atómica e idempotente (`Core.processReception`): genera folio `REC-XXXXXX`, ingresa lotes FEFO, actualiza costos y precios del catálogo, registra movimientos en el Kardex y guarda en el historial de recepciones.
   - Opción de cancelar recepción en borrador sin alterar existencias de almacén.
7. **Familias y Categorías:**
   - Agrupación por familias de negocio (`Abarrotes y Despensa`, `Perecederos y Frescos`, `Lácteos y Refrigerados`, `Bebidas y Botanas`, `Papelería y Hogar`).
   - Mapeo automático inteligente por categoría (`familyForCategory`) y chips de filtrado en inventario y catálogo.
8. **Centro de Exportación CSV compatible con Excel:**
   - Descarga con prefijo UTF-8 BOM (`\uFEFF`) y escape correcto de comas/comillas para apertura transparente en Microsoft Excel.
   - 5 reportes CSV disponibles:
     1. Inventario actual con costos, precios, márgenes y valoración económica.
     2. Kardex general de movimientos de almacén (entradas, ventas, mermas, ajustes).
     3. Historial de recepciones de compra por proveedor y factura.
     4. Alertas de productos bajo mínimo de existencias.
     5. Valoración de inventario agrupado por Familia y Categoría.
9. **Importación Masiva de Inventario desde CSV:**
   - Detección automática de delimitadores (coma o punto y coma) y mapeo inteligente de columnas.
   - Vista previa interactiva con desglose de filas válidas, productos nuevos, productos existentes y filas rechazadas.
   - Detección y bloqueo de códigos duplicados dentro del mismo archivo.
   - **Protección contra duplicación de existencias:** el modo predeterminado "Catálogo + Stock inicial solo para productos nuevos" permite re-importar el mismo archivo tantas veces como sea necesario para actualizar precios y catálogo sin alterar ni duplicar el inventario existente.
   - Modo de ajuste físico total disponible cuando se requiere cuadre manual de existencias.

### Bloque P2: Seguridad, Control de Acceso y Trazabilidad
10. **Autenticación Criptográfica:**
    - Algoritmo SHA-256 nativo (RFC 6234) sin dependencias externas.
    - Hashing de PIN de 4 dígitos con generación de salt aleatorio único por usuario.
11. **Matriz de Roles y Permisos (RBAC):**
    - 4 roles preconfigurados: `admin` (propietario), `supervisor` (encargado), `cajero` y `almacen`.
    - Validación granular de permisos en el núcleo de ejecución (`core.js`) para evitar evasiones por interfaz.
    - Sanitización de catálogo: los cajeros nunca reciben los costos de adquisición de los productos.
12. **Bitácora de Auditoría Inmutable:**
    - Registro de cada venta, cancelación, ingreso de mercancía, merma y cierre de turno con ID y nombre de usuario responsable.

### Bloque P3: Dos Terminales y Supervisión Remota
13. **Identidad Persistente de Terminal:**
    - Identificación única por terminal (`caja-1`, `caja-2`, `laptop`) vinculada a un `businessId` (UUID).
    - Selector en Ajustes y persistencia híbrida en `localStorage` e `IndexedDB`.
14. **Motor de Sincronización Transaccional (`sync.js`):**
    - Cola local resiliente en IndexedDB (`sync_queue`) con reintentos y estados (`pending`, `synced`, `error`).
    - Conversión atómica a payload RPC `commit_sale` para Supabase/PostgreSQL.
    - Idempotencia garantizada por UUID único de venta: reintentos de red no duplican ventas ni descuentan inventario dos veces.
    - Bloqueo `FOR UPDATE` en PostgreSQL para prevenir ventas simultáneas sobre el mismo lote.
    - Refresco remoto de existencias (`pullRemoteStock`) y resumen analítico consolidado (`fetchRemoteSalesSummary`).
15. **Semáforo y Centro de Sincronización en Interfaz:**
    - Indicador visual reactivo en cabecera: modo local offline, ventas pendientes en cola, errores y estado sincronizado.
    - Modal de Centro de Sincronización con reintento manual inmediato, forzado de actualización de stock y limpieza de transacciones confirmadas.
16. **Panel de Supervisión Multi-Terminal para Propietario (Laptop):**
    - Pestaña "Hoy" con desglose analítico en tiempo real por terminal (`Consolidado`, `Caja 1`, `Caja 2`, `Laptop`).
    - Métricas comparativas de tickets emitidos, facturación y métodos de pago por caja.

---

## Pruebas Automatizadas Ejecutadas
- **Suite automatizada:** `tests/test-suite.js` ejecutada mediante `tests/runner.html` en Microsoft Edge / Chromium Headless.
- **Resultado:** **29 de 29 pruebas pasadas (0 fallos) — STATUS: SUCCESS**.
  1. `[PASS]` Matemáticas: round2 y round3 eliminan imprecisiones de coma flotante
  2. `[PASS]` Formato: money y money0 devuelven moneda mexicana válida
  3. `[PASS]` Inventario PEPS/FEFO: consume primero el lote más próximo a caducar
  4. `[PASS]` Inventario: addStock agrega nuevos lotes y actualiza costo ponderado
  5. `[PASS]` Promociones: el precio de promoción nunca es menor que el costo
  6. `[PASS]` Venta en efectivo: cálculo correcto de cambio y deducción de stock
  7. `[PASS]` Venta rechazada si supera existencias
  8. `[PASS]` Venta a crédito (fiado): valida límite y actualiza saldo del cliente
  9. `[PASS]` Abonos de clientes: reduce saldo y registra movimiento de caja si es en efectivo
  10. `[PASS]` Caja: cálculo exacto de dinero esperado vs contado y diferencia
  11. `[PASS]` Catálogo: alta, edición y eliminación condicionada de producto
  12. `[PASS]` Mermas: descuenta stock y registra pérdida económica a costo
  13. `[PASS]` Persistencia: exportar e importar respaldo JSON mantiene integridad total
  14. `[PASS]` Ticket Térmico POS: genera HTML válido con encabezado, desglose y total
  15. `[PASS]` Flujo Completo POS: venta mixta piezas + peso por báscula y kardex
  16. `[PASS]` P1 Recepción de Mercancía: actualiza stock, costo, lote FEFO y registra Kardex atómicamente
  17. `[PASS]` P1 Recepción: validación atómica evita recepciones vacías o con cantidades inválidas
  18. `[PASS]` P1 Familias y Categorías: mapeo coherente y persistencia en productos
  19. `[PASS]` P1 CSV Export: genera formato compatible con Excel con BOM UTF-8
  20. `[PASS]` P1 CSV Import: parsea correctamente, detecta duplicados y separa catálogo de existencias
  21. `[PASS]` P1 CSV Import: detección de códigos duplicados dentro del mismo archivo CSV
  22. `[PASS]` P2 Criptografía: sha256 cumple vector estándar RFC 6234 y hashPassword genera salt único
  23. `[PASS]` P2 Autenticación: login exitoso con credenciales correctas y rechazo con erróneas o inactivas
  24. `[PASS]` P2 Roles y Permisos: cajero no puede recibir mercancía ni ver costos; almacén no puede vender
  25. `[PASS]` P2 Auditoría y Trazabilidad: venta registra usuario responsable y oculta costos a cajeros
  26. `[PASS]` P3 Sync: saleToRpcPayload genera estructura exacta para RPC commit_sale con UUIDs e items
  27. `[PASS]` P3 Sync: persistencia de identidad de terminal y validación de terminales soportadas
  28. `[PASS]` P3 Sync: flush maneja modo offline o sin configurar sin excepciones bloqueantes
  29. `[PASS]` P3 Supervisión Remota: agregación analítica de ventas consolidada y desglosada por terminal

---

## Instrucciones de Ejecución

1. **Abrir la aplicación:**
   Doble clic en `index.html` o abrirlo en cualquier navegador (Google Chrome, Microsoft Edge, Safari, Firefox). 100% autónomo y offline.

2. **Ejecutar la suite de pruebas automatizadas en cualquier momento:**
   ```powershell
   cmd.exe /c '"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --allow-file-access-from-files --dump-dom "file:///c:/Users/Panda/Desktop/TIENDA INTELIGENTE/tests/runner.html"'
   ```

---

## Estado Actual y Próximos Pasos
- **Fases Completadas:** P0, P1, P2 y P3 (Base comercial, Inventario/Recepción, Control de Acceso/Seguridad y Sincronización Multi-Terminal / Panel Propietario).
- **Siguiente avance recomendado:**
  - Despliegue de la migración SQL en el proyecto real de Supabase del comercio (`supabase/migrations/20261016_001_identity_catalog_sales.sql`).
  - Configuración de credenciales Supabase en Caja 1, Caja 2 y Laptop mediante el modal de Ajustes.
  - Sincronización en tiempo real vía WebSockets / Supabase Realtime para actualización instantánea de stock entre cajas sin esperar polling.
