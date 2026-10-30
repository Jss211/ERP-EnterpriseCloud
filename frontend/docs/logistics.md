# Logística y Transporte · Alcance local

## Revisión previa

Se revisaron los cambios locales sin revertirlos. No se encontró un `AGENTS.md` en el proyecto ni en sus carpetas superiores. No existían implementaciones parciales de despachos, entregas o rutas: el módulo tenía accesos pendientes. Se reutiliza el maestro anterior de transportistas, sin inicializar sus ejemplos.

**El descuento de stock existente se conserva.** `OrdenVentaPage.handleSaveOrder` llama a `inventarioService.registrarMovimiento` con `SALIDA / VENTA / ORDEN DE VENTA` antes de guardar la venta pendiente. Ese servicio inserta en `kardex_movimientos` y actualiza `productos.stock`. La facturación actualiza el documento de venta; Logística no llama a ninguno de esos métodos de escritura. Una orden guardada no se usa como evidencia de salida física.

## Flujos implementados

| Pantalla | Acceso | Funciones |
| --- | --- | --- |
| Resumen | `/logistica` | Accesos e indicadores del registro local: despachos registrados, preparados, despachos enviados con entregas pendientes y rutas activas. Sin datos inventados. |
| Despachos | `/despachos` | Búsqueda, estado, fechas programadas, paginación, selección de venta, cantidades por línea, destino, contacto, almacén de referencia, transportista, revisión, registro, edición de borrador y detalle. |
| Entregas | `/entregas` | Seguimiento por despacho enviado, cantidades en detalle, intentos totales, parciales, fallidos o rechazados, receptor, fecha, incidencias e historial. |
| Rutas | `/rutas` | Código, nombre, fecha, responsable, asignación de despachos, orden manual accesible de paradas, detalle y seguimiento. Sin mapas ni optimización. |
| Transportistas | `/transportistas` | Búsqueda y paginación del maestro anterior, documento, contacto, estado y consulta estructurada del vehículo y conductor informados. Edición pendiente, claramente indicada. |

Todos los accesos están dentro del menú y encabezado del ERP, con modo oscuro, adaptación móvil, estados de carga, vacío, ausencia de coincidencias y error. Los formularios revisan el resumen antes de guardar y conservan sus campos ante un rechazo. Los modales reutilizan el control de foco y teclado existente.

### Despachos

`Borrador → Preparado → Despachado`. Borradores y preparados pueden cancelarse con motivo y confirmación, conservando registros e historial. No se permite cancelar una salida ya registrada. Todos los estados no cancelados reservan cantidades por ID de venta y línea; la cancelación anterior a la salida libera la reserva. Son posibles varios despachos parciales de la misma venta.

El transportista puede quedar sin asignar en borrador, con aviso. Preparar y registrar la salida exigen que siga activo y que sus datos coincidan con la asignación revisada. Si cambian después de preparar, se debe revisar el maestro y cancelar/recrear el despacho antes de salir; no se fuerza una transición hacia atrás.

No se editan ni cancelan despachos asignados a una ruta activa: primero se retiran de una planificación editable, o se cancela esa planificación. Prepararlos y registrar su salida sí está permitido, para poder iniciar el seguimiento de la ruta.

### Entregas

Solo parten de despachos con estado `DESPACHADO`. Cada intento tiene ID propio y referencia líneas del despacho. Se suman las cantidades ya registradas y se rechaza cualquier exceso. Los intentos fallidos o rechazados requieren incidencias y cantidades cero. Una entrega con cantidades positivas requiere receptor.

El estado `ENTREGADO` se deriva únicamente de completar todas las líneas; no existe un botón que lo fuerce. Los intentos anteriores se conservan. Las fechas de intento no pueden preceder a la salida logística y usan el día de negocio de Lima. Un intento fallido no cancela la reserva original ni crea devoluciones, abonos o entradas de stock.

### Rutas

`Planificada → En curso → Finalizada`; una planificación aún no iniciada puede cancelarse con motivo. Las paradas pueden agregarse, quitarse y reordenarse mientras la ruta está planificada. No se asignan despachos cancelados, completamente entregados ni ya ocupados por otra ruta activa.

Para iniciar deben haber salido todos sus despachos. Para finalizar deben estar completas todas sus entregas. Ningún cambio de ruta modifica automáticamente el estado de un despacho o una entrega. Se guardan IDs estables de parada y fotografías históricas del cliente y destino.

## Fuentes reutilizadas y limitaciones históricas

- Ventas: `ventasService.getVentas(true, false, true)`, una lectura estricta de todas las páginas con los IDs de `ventas_items`. El nuevo tercer argumento permite lectura completa sin exigir metadatos financieros irrelevantes para Logística; los modos anteriores conservan su comportamiento.
- Referencias de comprobantes y documentos antiguos: `mapSaleSources` de Devoluciones, `erp_ordenes_venta` y `erp_estado_cuenta`, siempre en lectura. Un número de comprobante se muestra como referencia, sin afirmar emisión o validación SUNAT.
- Clientes: `clientesService.getClientes(true)` para datos disponibles por ID. La dirección y el teléfono del maestro son referencias que el usuario revisa antes de guardar el destino histórico. El modo estricto opcional informa errores en lugar de aparentar un maestro vacío; el modo anterior no cambia.
- Productos: las descripciones y cantidades proceden de las líneas comerciales. Los IDs de producto explícitos de documentos anteriores se conservan, pero nunca se relacionan productos o líneas por nombre. El servicio actual de ventas no expone un ID de producto en cada línea; no se inventa ese vínculo ni se deduce de la descripción.
- Almacenes: `inventarioService.getCatalogosBase(true)` entrega el catálogo operativo. El usuario puede seleccionar su ID como referencia manual. No se deduce un almacén por el nombre del producto ni se crea un movimiento de inventario. El modo estricto adicional no cambia los lectores anteriores.
- Transportistas: `legacyCatalogRepository.listStrict()` lee `erp_maestros_tech_data_v2` sin inicializarlo ni escribirlo. Los registros inválidos se informan; el lector anterior sigue disponible con su comportamiento previo. No se utiliza `maestrosService.getData()`, que inicializa ejemplos y oculta errores de guardado.

El maestro actual solo contiene un vehículo y un conductor por transportista. Se guardan fotografías estructuradas de esos campos al asignar el transporte, sin convertirlos en textos reutilizables ni crear otro catálogo. La edición segura, los vehículos y conductores como entidades relacionadas y la consolidación supervisada del maestro quedan pendientes. No se inventan documentos, placas ni licencias.

Una venta sin IDs de línea únicos o cantidades fiables se muestra con una limitación y no permite programar despachos. Cambios de IDs o cantidades en una venta con despachos activos bloquean nuevas reservas y salidas pendientes, sin intentar reconstruir relaciones por nombre. La regeneración de líneas por una edición comercial requiere revisión explícita.

Los espejos locales con referencia explícita a una venta no se ofrecen dos veces. Si una orden local que ya tenía despachos aparece después como venta registrada, se detecta la referencia de orden y se bloquea la nueva asignación de cantidades hasta revisar los IDs; no se concede otra cantidad completa bajo un nuevo origen.

## Arquitectura y persistencia

- `types.ts`: modelos, entradas y contratos de fuentes y repositorio, con búsqueda, filtros y paginación.
- `domain.ts`: cantidades en enteros de millonésimas (hasta seis decimales), reservas, entregas, estados, consultas locales e integridad del libro.
- `service.ts`: casos de uso, relectura de documentos, límites de cantidades, estados y comandos idempotentes.
- `localRepository.ts`: adaptador versionado, guardado consistente y protección de datos dañados.
- `sourceRepository.ts`: adaptador de lectura de las fuentes existentes, separado de los nuevos datos logísticos.
- Editores, detalles y páginas: presentación, sin acceso directo a `localStorage`. Se reutilizan estilos, paginación, modal y carga asíncrona existentes.

La clave canónica nueva es `erp_logistics_v1`, formato `version: 1`. No había registros logísticos previos que migrar; las fuentes anteriores se conservan sin copiarlas a catálogos nuevos. El estado contiene despachos, intentos, rutas e identificadores de comandos. No existe borrado físico de operaciones.

Una transacción relee el estado, ejecuta la validación, registra el comando y valida referencias e historiales antes de una sola escritura del conjunto. Un error previo al guardado no persiste reservas, intentos o rutas parciales. Si falla la cuota, el formulario permite reintentar. Si se pierde la confirmación después de guardar, el mismo comando devuelve la operación existente; reutilizarlo con otro contenido se rechaza.

Las lecturas no inicializan ni reparan datos. JSON dañado, versiones desconocidas, IDs duplicados, referencias huérfanas e inconsistencias se rechazan sin sobrescribir el valor almacenado.

Se usa Web Locks entre pestañas cooperantes del mismo origen cuando está disponible, una cola por instancia y una comprobación adicional de instantánea antes de escribir. La comprobación final por sí sola no es atómica. El alcance es este navegador, no otros equipos ni usuarios; tampoco puede detectar despachos de sistemas externos que no estén registrados aquí.

## Pendiente para Supabase e Inventario

No se modificaron backend, SQL, RLS ni datos remotos. Una versión multiusuario necesita endpoints de aplicación y transacciones en servidor: reservas por línea de venta, cantidades entregadas, unicidad de asignación a rutas activas, revisión de entidades, idempotencia y permisos. Sustituir `localStorage` por escrituras independientes a Supabase no garantiza esas reglas.

La futura integración física debe conciliar el descuento que hoy ocurre al guardar la orden de venta y establecer una única salida canónica. No se puede añadir otro descuento al marcar un despacho sin rediseñar ese flujo. Guías oficiales, SUNAT, mapas, geolocalización y optimización no forman parte de esta etapa.

## Verificación

```text
npm.cmd run build
npm.cmd run lint
node tests/logistics-unit.mjs
node tests/logistics-source-compatibility.mjs
node tests/logistics-browser.mjs
node tests/frontend-smoke.mjs
```

El build incluye TypeScript. Las pruebas de negocio cubren parcial/total, reservas de varios despachos, exceso por línea, liberación al cancelar preparados, fechas de Lima, intentos múltiples, reintentos, doble clic, fallos de cuota y confirmación, cambios concurrentes, fuentes antiguas, cancelación y estados de rutas, asignación única y orden de paradas.

Las pruebas de navegador recorren registros, revisión, cambios de estado, cancelación, intentos fallidos y parciales, entrega completa, asignación y reordenamiento, filtros, paginación, recarga, errores y recuperación. Verifican escritorio, móvil, claro y oscuro, y comparan el almacenamiento de fuentes comerciales y Tesorería antes/después. Todas las peticiones externas se interceptan, las escrituras remotas se bloquean y se exige que no se intente ninguna. Los perfiles y datos simulados quedan exclusivamente en `frontend/node_modules/.tmp/logistics-browser`, separados del navegador habitual del usuario.

También se ejecutan las pruebas existentes pertinentes de Tesorería, Devoluciones y compatibilidad de lectura de ventas. Lint conserva advertencias previas ajenas al módulo.
