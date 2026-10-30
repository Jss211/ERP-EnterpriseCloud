# Facturas de proveedores — etapa local

Ruta: `/facturas-proveedores`, accesible desde Compras. No se inicializan registros de ejemplo.

## Archivos y responsabilidades

- `src/modules/compras/facturas/types.ts`: dominio, snapshots y contrato `InvoiceRepository` con filtros y paginación.
- `domain.ts`: normalización, validaciones y cálculo por línea (descuento porcentual antes de impuestos, redondeo a dos decimales por línea, suma de importes redondeados). No hay una utilidad monetaria compartida compatible en los módulos actuales; sus cálculos están embebidos en las páginas. Se mantiene el criterio de base antes de IGV sin refactorizar esos módulos.
- `localRepository.ts`: adaptador independiente; única clave conservada `erp_supplier_invoices_v1`. Lee sobres de versiones 1 y 2 y escribe versión 2. Lectura validada antes de escribir, errores visibles y datos dañados intactos. Inserción/actualización exclusiva mediante Web Locks cuando el navegador lo soporta. Sin Web Locks, no se garantiza exclusividad entre pestañas concurrentes.
- `service.ts`: validación contra los repositorios existentes de proveedores/productos y consulta de órdenes existente. Solo usa métodos de lectura de esos maestros. No genera otro catálogo ni escribe en Supabase.
- `FacturasProveedoresPage.tsx` y `InvoiceLines.tsx`: listado, filtros, paginación, formulario y detalle adaptable al tema y al móvil.
- `orderRules.ts`: carga de datos disponibles de una orden y cálculo conservador del acumulado por ID de línea.
- `OrderInvoiceReview.tsx`: revisión de diferencias, acumulado local y pendiente de facturar, sin estados de pago.
- `src/App.tsx` y `src/config/modules.ts`: ruta lazy y acceso desde acordeón/resumen Compras.

El documento conserva proveedor por ID con nombre/documento histórico, productos por ID con código/descripción/unidad, orden por ID/código y referencias de sus líneas cuando existen. Las órdenes históricas sin proveedor por ID no se vinculan por nombre/RUC; las líneas sin producto por ID disponible no se importan automáticamente y se avisa para completarlas manualmente.

## Registro desde orden y facturas parciales

El listado ofrece **Registrar desde una orden** y **Registrar sin orden**. Ambos accesos usan el mismo formulario. Desde una orden se elige primero entre las órdenes existentes; se completan proveedor, moneda, condición y líneas disponibles. Las cantidades pedidas y precios se proponen para revisión y pueden editarse para reflejar la factura real. No se precargan serie, número ni fechas del comprobante. Cambiar de orden o proveedor con líneas existentes pide confirmación y conserva los datos si se cancela.

Una orden admite varias facturas distintas, cada una con UUID y documento propios. El acumulado suma solo facturas registradas en este navegador, consultando todas las páginas mediante el filtro `orderId` del contrato. Solo calcula por ID único de línea de orden, ID de producto, proveedor y unidad compatibles. Si hay líneas históricas o manuales sin correspondencia suficiente, no infiere por código, descripción o coincidencia de producto: avisa que no es calculable y permite registrar. Si la orden ya no está disponible, se conservan las referencias históricas sin mostrar cantidades deducidas.

El pendiente es **cantidad pedida actual menos cantidad facturada local**. Puede ser negativo (exceso) y no representa recepciones, deuda ni dinero pendiente. El borrador no se incluye en el acumulado hasta guardarse. Cantidades diferentes, precios distintos y excesos generan avisos de revisión, sin bloquear automáticamente el registro. La cantidad propuesta al cargar otra factura sigue siendo la pedida, no el pendiente ni la recibida.

Se mantiene la clave. La migración del sobre de **versión 1 a versión 2** ocurre en la primera escritura correcta y en una sola operación, tras validar el contenido completo. Leer no escribe ni rellena registros históricos. Los registros anteriores mantienen su ID, datos y referencias; su identificador visible se deriva como `FP-{id}` sin reescribirlos. `orderedPrice` continúa siendo una copia histórica opcional. Reintentar el mismo identificador y contenido registrado devuelve el registro original sin cambiar su fecha de creación.

Guardar o completar una factura no modifica stock, Kardex, órdenes, recepción, pagos ni deudas. `REGISTRADA` es un estado documental local; no expresa aceptación tributaria ni estado de pago. Los borradores permanecen en memoria ante errores; cerrar o recargar la página descarta los cambios sin guardar con aviso del navegador. Las facturas registradas son de consulta; los pendientes admiten guardar avances y completar el documento.

## Referencias automáticas desde compras

Después de que `createOrdenCompra` devuelve una orden guardada, la pantalla llama al servicio separado `pendingInvoiceService.ensureFromOrder`, que utiliza `InvoiceRepository.ensurePending`. La referencia usa el ID estable devuelto por la orden, `auto-invoice:{orderId}`, con identificador visible `FP-OC-{orderId}` y marca única `automaticOrderId`. Los reintentos y la recuperación devuelven la referencia existente, incluso si fue editada o ya se completó; no refrescan su snapshot ni crean otra fila automática. Esto es independiente de las varias facturas manuales/partes que puede tener una orden.

`PENDIENTE` se presenta como **Pendiente de completar**. No es una factura emitida ni validada ante SUNAT. Serie, número y fechas vacíos se muestran como **Pendiente**. Se copian proveedor, moneda y líneas disponibles, sin inventar IDs de producto o de línea ausentes. El descuento porcentual por línea se conserva si está disponible. El descuento global monetario que ya admite la orden se conserva en `orderDiscountAmount`, como referencia separada y visible: no se reparte proporcionalmente ni se aplica automáticamente a cantidades parciales. El usuario registra los descuentos reales en las líneas de la factura. Las referencias con IDs históricos incompletos requieren revisión; solo se completa una factura si satisface las validaciones de maestros/orden existentes.

“Guardar pendiente” conserva avances sin exigir los datos todavía desconocidos; “Guardar factura” exige todas las validaciones y cambia el mismo registro a `REGISTRADA`. La revisión del registro permite detectar cambios simultáneos y evita sobrescribir un pendiente editado desde otra ventana. Una factura registrada no puede editarse. El acumulado facturado descuenta exclusivamente registros `REGISTRADA`, nunca las referencias pendientes.

Si falla la creación del pendiente, la pantalla informa que la orden sí está guardada y permite **Generar pendiente sin volver a guardar la orden**. El historial también ofrece **Generar pendiente** para recuperar después de recargar, sin invocar el guardado de compra. Un fallo del respaldo local tras guardar una orden remota ya no se trata como un fallo del guardado remoto: devuelve el ID real y avisa del respaldo fallido, sin intentar otra compra. Se conserva el respaldo local existente para fallos remotos, añadiendo las referencias disponibles de proveedor/producto/moneda/descuento; no se infieren relaciones históricas por nombres.

El guardado de compra y la creación local del pendiente no forman una transacción distribuida. Cerrar la pestaña entre ambas operaciones también exige recuperación desde la orden. Los pendientes y facturas son propios del navegador/origen. No hay garantías entre usuarios, equipos o navegadores; tampoco hay exclusividad entre pestañas sin Web Locks. El adaptador futuro de Supabase necesitará una clave única por empresa y orden para la referencia automática, idempotencia del guardado de compra, control de versión/transacciones para completar y la unicidad del comprobante real. Tesorería debe integrarse explícitamente con idempotencia por factura; no se generan deudas ni pagos ahora.

## Integraciones pendientes

- **Supabase:** implementar el contrato remoto, incluyendo paginación/filtros del servidor (también `orderId`), validación de referencias, aislamiento de empresa y transacciones. El acumulado remoto requerirá una consulta consistente o agregado del servidor para evitar cambios entre páginas; el acumulado local no representa facturas registradas por otros usuarios. Crear en una etapa autorizada una restricción única por `(empresa_id, proveedor_id, tipo_documental, serie_normalizada, numero_normalizado)` e idempotencia por UUID. Normalización actual: NFKC, sin espacios, mayúsculas; número sin ceros iniciales para unicidad. La prevención local NO garantiza exclusividad entre usuarios, dispositivos u orígenes. No se crearon SQL, RLS, permisos ni endpoints. Antes de migrar debe definirse importación/reconciliación explícita de datos locales, sin sincronización automática.
- **Tesorería/cuentas por pagar:** definir contrato, idempotencia por ID de factura y reglas de reconocimiento, moneda, vencimientos y anulaciones. Las referencias actuales permiten enlazar el documento sin crear una segunda deuda. No se muestran saldos ni pagos.
- **Adjuntos:** definir almacenamiento y permisos duraderos; no se guardan archivos ni URLs temporales en localStorage.
- No se incluye emisión electrónica ni validación SUNAT.

## Verificación reproducible

Desde `frontend`:

```
npm.cmd run build
npm.cmd run lint
node tests/supplier-invoices-unit.mjs
node tests/supplier-invoices-browser.mjs
node tests/pending-invoices-browser.mjs
node tests/purchase-order-pending-source-unit.mjs
npm.cmd run test:smoke
```

Las pruebas de navegador requieren Edge/Chromium (`EDGE_PATH` opcional), usan un perfil desechable y datos sintéticos aislados. Interceptan todas las solicitudes remotas y comprueban cero escrituras; no insertan datos de prueba en Supabase. Captura móvil en `frontend/node_modules/.tmp/invoice-browser/invoice-mobile-dark.png`.

## Filtros y actualización del listado

El filtro de proveedor usa el maestro existente con lectura estricta (los errores no se convierten en ausencia de coincidencias), busca por nombre/razón social disponible y documento, y aplica la selección por ID. Admite flechas, Enter, Escape y Tab. El selector del formulario conserva su comportamiento.

Limpiar / actualizar conserva el tamaño de página, limpia todos los filtros y consulta de nuevo el repositorio local desde la primera página. La confirmación solo aparece tras una lectura correcta, incluso con listado vacío. Un error ofrece reintento y nunca escribe en almacenamiento. Los rangos invertidos muestran una indicación; el listado vacío se distingue de la ausencia de coincidencias y del error de lectura.

El catálogo `INVOICE_STATUSES` contiene los estados reales `PENDIENTE` y `REGISTRADA`, y el filtro documental está disponible. La búsqueda incluye identificador interno, ID/código de orden, proveedor/documento y serie/número del comprobante real. El identificador interno figura en una columna distinta del comprobante. Los filtros de emisión no incluyen referencias cuya fecha aún es desconocida.
