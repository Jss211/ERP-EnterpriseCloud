# Tesorería local — operación y límites

Rutas operativas:

- `/estado-cuenta`: se conserva la pantalla de cuentas por cobrar, su tabla, búsqueda, fechas, agrupación, impresión y exportación. Añade estado de pago, vencimiento independiente, detalle/historial y cobros con el adaptador de Tesorería.
- `/cuentas-por-pagar`: obligaciones de facturas reales de proveedores.
- `/pagos`: registro, revisión, consulta y anulación de pagos.
- `/caja-bancos`: mantenimiento de cuentas, aperturas, movimientos y transferencias internas.
- `/tesoreria`: accesos y resumen de obligaciones, vencimientos y cuentas, separados en PEN y USD.

Todas las operaciones nuevas son **registros locales**, no transferencias bancarias ni documentos fiscales. No se modifica stock, Kardex, órdenes, ventas, facturas o pagos remotos.

## Fuentes existentes y compatibilidad

Se revisaron `EstadoCuentaPage`, `FacturacionPage`, `OrdenVentaPage`, servicios de ventas, repositorio de facturas de proveedores, utilidad `roundMoney`, navegación y modales existentes. No se crearon catálogos alternativos de clientes, proveedores o documentos.

### Cuentas por cobrar

El estado de cuenta anterior combinaba **todas las ventas** con `erp_estado_cuenta`, no solo facturas tributarias. Una venta u orden podía originar un saldo antes de emitir comprobante. Se conserva esa regla de origen.

`sourceMapping.mapReceivables` adapta esas fuentes, sin reescribirlas:

1. Una cuenta local vinculada mediante `dbId` tiene prioridad sobre la misma venta. Su referencia puede cambiar de OV a factura sin originar otra obligación: la identidad permanece `ar:venta:{id}`.
2. Si no hay `dbId`, se utiliza una coincidencia única de número existente. Sin venta vinculable, se conserva la identidad local de documento: `ar:local:{id o número}`. No se vincula por cliente/importe.
3. Se conservan `pagado`, `saldo` y `total` anteriores como importes históricos, comprobando que cuadran en centavos. Si no cuadran o hay referencias contradictorias, se bloquea la lectura/aplicación para revisión, manteniendo los datos originales.
4. Antes, una venta remota `Completada` sin cuenta local se consideraba totalmente cobrada. Esa interpretación se mantiene como **evidencia histórica explícita**, sin inventar una operación, fecha de cobro o cuenta bancaria. No afirma una verificación bancaria. La cuenta local, cuando existe, conserva la prioridad de sus propios importes aunque la venta diga `Completada`.
5. Las cuentas locales históricas sin moneda conservan PEN, conforme al escritor anterior y su presentación en soles. Las ventas remotas usadas por Tesorería requieren total, moneda y estado disponibles; una lectura financiera opcional de `ventasService` evita sus antiguos valores por defecto para esos campos. Sus demás consumidores conservan el comportamiento anterior. La lectura financiera tampoco inventa una fecha de emisión si no existe.

La lectura financiera de ventas recorre todas sus páginas con orden estable, en lugar de limitar silenciosamente el saldo al primer lote del servicio. Si detecta IDs repetidos al cambiar el conjunto, falla para reintentar. Una lectura consistente frente a cambios simultáneos del servidor seguirá requiriendo un snapshot/transacción de backend. Las fechas históricas locales se toman de `rawFecha` o del formato numérico `dd/mm/aaaa` del escritor anterior; no se adivinan otras fechas.

Se corrigió la supresión anterior por cliente e importe: dos ventas diferentes con el mismo cliente/importe siguen siendo dos documentos. No se fusionan registros dudosos ni se sobrescriben cuentas previas.

**Los cobros históricos sin cuenta no generan ingresos retroactivos.** El detalle muestra su importe histórico y esta limitación. Por ello, sumar movimientos nuevos de caja no reconstruye todo el dinero cobrado antes de instalar Tesorería.

Los cobros nuevos se escriben exclusivamente en el registro canónico de Tesorería. No se duplican en `erp_estado_cuenta` ni actualizan `ventas.estado` en Supabase. El estado de pago se deriva del dinero aplicado y se mantiene separado del estado comercial. Los reportes ajenos a Tesorería que todavía lean directamente claves anteriores conservan sus fuentes previas; no se reescribieron en esta etapa.

### Cuentas por pagar

Se leen todas las páginas de `InvoiceRepository`, respetando sus sobres compatibles v1/v2 y validación de datos:

- Solo `REGISTRADA` origina una obligación, identificada por `ap:invoice:{invoice.id}`.
- `PENDIENTE` no origina deuda. Completar ese mismo registro hace aparecer una sola obligación, sin un segundo proceso de inserción que pueda duplicarla.
- Cada factura parcial registrada de una misma orden tiene su propio ID y saldo.
- Las condiciones al contado no prueban pago: el importe histórico pagado inicial es cero, salvo una integración previa explícita que pueda acreditarlo. No se ha inventado evidencia de pagos anteriores.
- Proveedor/ID/documento, moneda, total y fechas proceden de la factura registrada. No se crea deuda desde compras ni Kardex.

Las obligaciones se proyectan desde los documentos originales; no hay otra tabla local de deudas mantenida por separado. Los snapshots guardados al aplicar dinero son referencias de auditoría, no nuevas obligaciones duplicadas.

## Arquitectura

En `src/modules/tesoreria`:

- `types.ts`: modelos, `Query`/`Page`, `TreasuryRepository`, `ObligationSources` y comandos tipados.
- `money.ts`: importes nuevos en unidades menores enteras; PEN y USD tienen dos decimales. Rechaza más de dos decimales y números fuera del rango seguro. En el límite con documentos existentes reutiliza `roundMoney`, conservando su redondeo a centavos. No modifica cálculos originales de ventas/facturas.
- `sourceMapping.ts`, `sources.ts`, `receivableCompatibility.ts`: adaptadores de ventas/estado anterior y facturas. `toStatementItem` conserva la interfaz de la pantalla anterior; las sumas de esa presentación también se realizan en unidades menores y se agrupan por moneda.
- `domain.ts`: saldos, consultas paginadas, origen de movimientos, vencimientos y verificación de integridad del conjunto.
- `localRepository.ts`: lectura validada y unidad de trabajo con una sola clave nueva, `erp_treasury_v1`.
- `service.ts`, `runtime.ts`: registrar/aplicar/revertir dinero, mantenimiento de cuentas y resumen. `workspace` utiliza una lectura del registro financiero para cada vista compuesta.
- `OperationForm`, `AccountForm`, `FinancialDetail`, `TreasuryUI`: formularios, revisión, errores y modales accesibles compartidos. Los modales tienen cierre con Escape, ciclo de foco, desplazamiento interno y restauración de foco.
- `PayablesPage`, `PaymentsPage`, `CashBanksPage`, `TreasurySummaryPage`: vistas locales operativas.

## Unidad de trabajo e idempotencia

El sobre v1 contiene cuentas, operaciones, aplicaciones, movimientos y snapshots de origen. Cada cobro/pago nuevo tiene un UUID estable, una aplicación y un movimiento. Una transferencia tiene dos movimientos, con igual moneda/importe y cuentas distintas. Cada registro apunta a su operación de origen.

El servicio trabaja sobre una copia validada, vuelve a consultar el documento antes de aplicar dinero, recalcula el saldo y verifica el conjunto resultante. **Todos los elementos de una operación se guardan en un solo `localStorage.setItem`**; no hay secuencia de escrituras independientes entre claves financieras. Antes de escribir se comprueban importes, referencias, movimientos derivados y aplicaciones. No hay journal entre almacenes porque no se escriben los almacenes comerciales/anteriores.

Web Locks serializa las transacciones de esta clave entre pestañas compatibles. En navegadores sin Web Locks se serializan los comandos de la instancia actual; **no se garantiza exclusividad entre pestañas**. No hay garantías multiusuario, entre dispositivos ni entre orígenes.

Reintentar el mismo UUID y contenido devuelve el registro previo sin otro movimiento. Cambiar su contenido produce error. Si el navegador llega a guardar pero se pierde la confirmación, el mismo comando verifica el registro existente sin duplicarlo. El UUID permanece en el formulario ante errores. El historial permite comprobar el resultado. Un error de lectura, versión desconocida, almacenamiento lleno o contenido dañado se muestra; no se inicializa encima del contenido existente ni se repara silenciosamente.

La integración histórica es una migración de lectura no destructiva: las claves anteriores se conservan byte a byte y sus importes se incorporan como base compatible. La clave nueva está versionada desde su primer uso; no se inicializa con demostraciones. Un futuro cambio de esquema requerirá migración explícita y validada, sin pérdida de IDs/trazas.

El documento comercial y el registro financiero no forman una transacción distribuida. Los snapshots protegen los importes aplicados, pero no sustituyen el control de versión de servidor sobre documentos remotos.

## Reglas operativas

- Cobros/pagos: importe positivo, no superior al saldo, misma moneda, documento disponible y no anulado, cuenta activa y fecha desde su apertura. Revisión antes de guardar y formulario conservado ante errores. Las validaciones se repiten en la unidad de trabajo.
- Una única fuente canónica de operaciones: el saldo documental es importe original menos evidencia histórica y aplicaciones activas. `PENDIENTE`, `PARCIAL` y `PAGADA` se derivan de esos importes. Vencido significa fecha conocida anterior a hoy y saldo mayor que cero; no es un estado de pago adicional.
- Cuenta: apertura explícita definida por la empresa. Saldo = apertura + ingresos − egresos, incluyendo reversiones. No se mezclan monedas. El saldo calculado no se edita. Con movimientos, tipo, moneda y apertura quedan bloqueados. Las cuentas no se eliminan; pueden inactivarse conservando su historial. Los números bancarios se enmascaran en la consulta y se ocultan en el formulario.
- La cuenta puede reflejar un saldo negativo si así resultan sus registros; esta etapa no verifica disponibilidad bancaria ni define líneas de sobregiro. No equivale a fondos confirmados por un banco.
- Transferencia interna: un egreso y un ingreso vinculados, misma moneda/importe y cuentas activas diferentes. No crea venta, compra o deuda.
- Anulación: requiere motivo, fecha y confirmación. Conserva la operación original y su aplicación, añade el dato de anulación y una reversión por movimiento original, una sola vez. El saldo documental deja de considerar la aplicación anulada; el saldo de caja suma original y reversión. No se elimina dinero del historial ni se aplica una segunda deducción.
- Facturas de proveedores registradas ya son inmutables en su repositorio. Además, cuando un origen con aplicaciones cambia de proveedor/cliente, identificación disponible, moneda, total o evidencia histórica, o deja de estar disponible, Tesorería conserva el snapshot e historial y bloquea nuevas aplicaciones. El resumen no presenta un total aparentemente válido ante ese conflicto. Resolver alteraciones externas requiere revisar/restaurar el documento o una futura reconciliación explícita; no hay un botón que reescriba saldos para ocultarlas. Se permite revertir operaciones propias por error conservando su traza.

## Alcance no implementado

No se ejecutan operaciones financieras reales ni se generan notas de crédito, documentos SUNAT, ajustes manuales, conversiones monetarias o conciliaciones bancarias. No se conectan cuentas bancarias externas. No hay sincronización automática de datos locales ni reparación/importación automática de registros históricos ambiguos.

Para Supabase se necesitarán: aislamiento de empresa y permisos/RLS, transacciones de servidor, restricciones únicas por IDs de obligación/operación/aplicación/movimiento/reversión, idempotencia, bloqueo de saldo documental y de cuenta o control de versión, referencias inmutables a documentos y restricciones que impidan cambiar su contraparte/moneda/total con aplicaciones. Las vistas y el resumen necesitan snapshots consistentes del servidor y consultas/agregados paginados. También debe definirse una importación/reconciliación de evidencia histórica supervisada y un tratamiento explícito de estados comerciales antiguos interpretados como cobro.

## Verificación reproducible

Desde `frontend`:

```text
npx.cmd tsc -b --pretty false
npm.cmd run build
npm.cmd run lint
node tests/treasury-unit.mjs
node tests/treasury-sales-compatibility.mjs
node tests/treasury-browser.mjs
node tests/supplier-invoices-unit.mjs
node tests/supplier-invoices-browser.mjs
node tests/pending-invoices-browser.mjs
node tests/purchase-order-pending-source-unit.mjs
node tests/customer-returns-unit.mjs
node tests/customer-return-detail-unit.mjs
node tests/customer-returns-browser.mjs
npm.cmd run test:smoke
```

Las pruebas unitarias comprueban las reglas anteriores, compatibilidad, centavos, obligaciones únicas, cambios de origen bloqueados, transacciones completas, sobrepagos concurrentes, moneda, transferencias/reversiones, reintentos y fallos de persistencia. Las pruebas de navegador usan un perfil desechable, datos sintéticos y Edge/Chromium (`EDGE_PATH` opcional). Interceptan todas las solicitudes externas y comparan las claves de documentos/ventas/stock/Kardex antes/después. Incluyen cobros/pagos parciales/totales, doble clic, cuota, resumen por moneda, recarga, móvil/oscuro y recuperación de almacenamiento dañado sin sobrescribirlo.

No se hicieron escrituras de prueba en Supabase ni se insertaron registros de demostración en el navegador del usuario. Captura local de verificación: `node_modules/.tmp/treasury-browser/treasury-mobile-dark.png`.
