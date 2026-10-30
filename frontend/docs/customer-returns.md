# Devoluciones de clientes — solicitudes locales

Ruta `/devoluciones`, accesible en Ventas → Devoluciones. No se inicializan datos de ejemplo. La interfaz informa que las solicitudes se guardan únicamente en este navegador.

## Fuentes revisadas y referencias reales

- `ventasService`: tabla `ventas`, con `cliente_id` y líneas `ventas_items.id`. Actualmente las líneas guardan descripción, cantidad, precio y subtotal, pero **no producto_id ni unidad**. El módulo conserva el ID real de línea; no busca un producto por descripción. Una orden guardada puede figurar como venta `Pendiente`; su presencia no prueba entrega física.
- `OrdenVentaPage`: conserva además `erp_ordenes_venta`. La escritura actual incluye `productoId`, descripción, cantidad y precio, pero no ID estable de línea ni cliente por ID. La posición sirve para seleccionar la línea dentro del documento, **nunca como relación fiable del acumulado**. Las órdenes históricas conservan su cliente/documento disponible; no se identifica al cliente por nombre. La moneda local omitida corresponde a PEN en el escritor actual.
- Una copia local con el mismo número de una venta remota no se ofrece como segundo origen. Esto evita seleccionar el espejo actual dos veces; no constituye una reconciliación histórica. Las solicitudes guardadas con otro origen conservan su referencia y no se reasignan automáticamente al aparecer una venta remota.
- `FacturacionPage` usa `erp_estado_cuenta` y `dbId` para relacionar un comprobante con una venta. Solo se ofrecen esas referencias explícitas. Un número F/B en la propia venta también puede mostrarse como referencia documental; **no se afirma emisión electrónica ni aceptación de SUNAT**. No se extraen líneas del texto agregado `productos` ni se relacionan por cliente/importe/notas.
- Se reutilizan los repositorios de clientes y productos para consultar maestros existentes, exclusivamente por IDs disponibles. No se crea otro catálogo. Los datos históricos de cada solicitud permanecen al cambiar o desaparecer el maestro.
- `IngresoKardexPage` ya permite registrar manualmente una entrada de tipo `DEVOLUCION`, con aumento de stock. Este flujo se conserva y no se invoca desde solicitudes. No existe una relación estable con las solicitudes nuevas; esos ingresos no se consideran confirmaciones comerciales ni se deducen del acumulado.

## Estructura

- `types.ts`: snapshots de origen/líneas y contratos `ReturnSources` / `ReturnRepository` (`list`, `get`, `save`), filtros y paginación.
- `sourceMapping.ts` y `sourceRepository.ts`: adaptación de documentos existentes y lectura de maestros. Una lectura estricta opcional de ventas propaga errores; los consumidores anteriores mantienen su comportamiento.
- `domain.ts`: validaciones, importe de referencia y disponibilidad por ID real de venta/línea.
- `service.ts`: lectura paginada del historial y revalidación del origen antes de guardar.
- `localRepository.ts`: única clave nueva `erp_customer_returns_v1`, sobre `{ version: 1, records: [...] }`. Valida todo el contenido antes de leer/escribir; formato desconocido, referencias inválidas y datos dañados producen un error visible y permanecen intactos. No hay migraciones ni reparación automática.
- `DevolucionesPage`, `ReturnLines` y `ReturnSummary`: listado, formulario, revisión y consulta. Tema y adaptación móvil conservados. No hay acciones de edición, eliminación, aceptación física, crédito o pago simuladas.

## Estados, cantidades e idempotencia

El único estado que se crea es `SOLICITADA` (Solicitud registrada). Se admite lectura de `CONFIRMADA` para datos históricos/futuro adaptador, con filtro de consulta, pero no se expone un botón ni una transición de confirmación. Las solicitudes **no reservan ni consumen cantidades**: dos solicitudes distintas pueden referirse a una venta y cada una debe revisarse antes de una futura aceptación.

Se exige origen, fecha válida, motivo general, al menos una línea, motivo por línea y cantidades finitas mayores que cero, sin superar lo vendido. Se descuentan solo confirmadas del mismo origen e ID de documento cuando las líneas reales se pueden relacionar. Si faltan IDs, hay duplicados o el histórico es incompatible, la pantalla avisa que el acumulado no es verificable; no inventa relaciones por descripción, producto, índice o nombre. Los IDs de línea remotos permiten un cálculo local, aunque no acreditan un producto de inventario. Los importes son referencias al precio original, sin recalcular impuestos ni crear un abono.

El historial local no representa devoluciones registradas en otros equipos, navegadores o fuentes. Tampoco garantiza conciliación de órdenes locales que posteriormente aparezcan en ventas. Estas limitaciones se muestran en el formulario y deben resolverse antes de aceptar físicamente una devolución.

Un UUID se asigna al abrir cada formulario y se conserva durante errores/reintentos. Doble clic se bloquea en la interfaz. Guardar el mismo UUID y contenido devuelve el registro previo; otro contenido con ese UUID produce error. Dos formularios independientes pueden crear dos solicitudes legítimas; no se deduplican por cliente, importe o productos. Web Locks serializa las escrituras locales entre pestañas cuando está disponible; sin ese soporte no se garantiza exclusividad entre pestañas. La comprobación local se repite dentro de la escritura, pero no sustituye una transacción de servidor.

Si falla el guardado se conserva el formulario/resumen. Recargar o cerrar descarta borradores en memoria con aviso del navegador; las solicitudes guardadas permanecen. Guardar solo escribe la clave de devoluciones: no modifica stock, Kardex, ventas, comprobantes, saldos ni pagos.

## Integración futura

Para operar entre usuarios se necesita un adaptador Supabase con aislamiento de empresa, autorización, validaciones y transacciones de servidor. Debe garantizar UUID/idempotencia, referencias inmutables de venta y línea, producto/unidad e historial consistente. La aceptación debe bloquear cantidades de la línea original y comprobar el acumulado de todas las devoluciones confirmadas en una transacción, evitando duplicados y excesos concurrentes. La lectura paginada remota requerirá snapshot consistente o agregado de servidor.

Definir un flujo explícito de solicitud, revisión y aceptación física, y su relación con el ingreso de Kardex existente. Coordinar inventario, notas de crédito, cuentas por cobrar y reembolsos con referencias e idempotencia por devolución; no generar movimientos duplicados al reintentar. La emisión/validación fiscal requiere su integración específica. Importar o reconciliar datos locales será una operación explícita posterior; no hay sincronización automática ni cambios de backend, SQL o RLS en esta etapa.

## Verificación local

La presentación mantiene las mismas consultas y reglas: filtros en un panel compacto, “Por página” junto a la paginación y confirmación de “Limpiar filtros” solo tras una lectura correcta. El filtro de estado se oculta si los registros tienen un único estado efectivo; reaparece si hay estados distintos, sin eliminar su lógica. Se distingue el listado vacío de la búsqueda sin coincidencias. “Nueva solicitud” y “Registrar primera solicitud” abren el mismo formulario.

`ReturnList`, `ReturnEditor` y `ReturnUI` separan la presentación del controlador de pantalla. El formulario se organiza en venta, productos/motivo y revisión; se conservan cantidades, referencias y validaciones. El alcance pendiente se consulta en “Más información” y el aviso breve se mantiene visible antes de guardar. Las referencias técnicas se consultan en secciones desplegables. No se incorporan estadísticas ni transiciones de estado.

Desde `frontend`:

```text
npx.cmd tsc -b --pretty false
npm.cmd run build
npm.cmd run lint
node tests/customer-returns-unit.mjs
node tests/customer-returns-browser.mjs
npm.cmd run test:smoke
```

Las pruebas unitarias cubren solicitudes parciales/múltiples, cantidades y confirmadas verificables, documentos antiguos, revalidación del origen, reintentos idempotentes, escritura/lectura fallida, integridad de datos dañados, filtros y paginación. Las pruebas de navegador usan Edge/Chromium (`EDGE_PATH` opcional), perfil desechable y documentos sintéticos. Interceptan las solicitudes remotas, verifican cero escrituras y comparan las claves originales antes/después de guardar. Incluyen doble clic, error de almacenamiento, consulta tras recargar, revisión móvil/oscura y límites de confirmadas. Captura: `node_modules/.tmp/customer-returns-browser/customer-return-mobile-dark.png`.
