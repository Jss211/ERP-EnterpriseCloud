# Arquitectura funcional AlvaPlast · primera etapa

Cambios exclusivamente locales del frontend. No se modifican backend, SQL, RLS, esquema remoto, ramas ni remotos. No se ejecutan migraciones, reinicios de datos ni operaciones de GitHub.

## Referencia y revisión previa

No se encontró AGENTS.md aplicable en el repositorio ni en sus ancestros inspeccionados. Se revisaron App.tsx, MainLayout.tsx, páginas, servicios y usos de localStorage antes de editar. El único adjunto disponible fue Pasted text.txt: no se recibió el PDF. Esta implementación aplica las reglas funcionales transcritas; el contraste completo con el PDF queda pendiente.

## Inventario funcional y ubicación

| Pantalla o función existente | Módulo y URL conservada | Estado real |
| --- | --- | --- |
| Dashboard inicial | Reportes y BI · `/` | Existente: agregados Supabase y datos locales |
| Clientes e historial | Maestros · `/clientes` | CRUD y consultas DNI/RUC existentes |
| Proveedores e historial | Maestros · `/proveedores` | CRUD y consultas DNI/RUC existentes |
| Maestros | Maestros · `/maestros` | Entrada con fuentes y disponibilidad explícitas |
| Mantenimientos | Maestros · `/mantenimientos` | Productos comparte editor; catálogos base en consulta |
| Productos | Maestros · `/maestros/productos` | Misma pantalla, formulario y servicio de Inventario |
| Stock | Inventario y Kardex · `/stock-productos` | Existencias, filtros, exportación y creación existentes |
| Ingreso Kardex / recepción OC | Inventario; acceso desde Compras · `/ingreso-kardex` y `?oc=...` | Conserva recepción y actualización de OC |
| Movimientos Kardex | Inventario y Kardex · `/movimiento-kardex` | Consulta, ajustes y salidas existentes |
| Órdenes de compra | Compras · `/orden-compra` | Compras nacionales; importaciones, contratos marco y evaluación futuros y opcionales |
| Cotizaciones | Ventas · `/cotizaciones` | CRUD existente, selección de cliente y producto maestro |
| Órdenes de venta | Ventas · `/orden-venta` | Conserva descuento de stock al guardar |
| Facturación | Ventas · `/facturacion` | Flujo existente; no acredita emisión fiscal electrónica certificada |
| Estado de cuenta / cobros | Tesorería · `/estado-cuenta` | Flujo de cobros existente; pagos pendientes |
| Reportes | Reportes y BI · `/reportes` | Reportes existentes |
| Inicio y registro de sesión | Seguridad · `/login`, `/registro` | Autenticación existente; no es autorización completa ni auditoría global |
| Vendedores, transportistas, condiciones, monedas y listas locales anteriores | Maestros · `/maestros/locales` | Consulta explícita del almacenamiento previo, separado de operaciones |
| VentasPage.tsx | Componente no enrutado antes de esta etapa | Conservado; no se crea una segunda pantalla de ventas |

Las doce agrupaciones, enlaces, alcance y disponibilidad están en `src/config/modules.ts`. Las páginas existentes se cargan de forma diferida. Las entradas `/logistica`, `/comisiones`, `/metas`, `/notificaciones` describen funciones pendientes sin controles operativos ficticios. Seguridad y Configuración tienen integraciones parciales existentes, pero auditoría global, roles y administración de integraciones siguen pendientes. No se incorpora ningún módulo AWS.

## Fuentes compartidas

- Clientes y proveedores: `QuickPartyCreateModal` ahora atiende alta y edición en los maestros y alta rápida en órdenes, usando los mismos servicios e integración Migo. Se advierte y detiene un posible documento duplicado antes de escribir; no se limpia información existente. Es una comprobación de interfaz, no una garantía de unicidad concurrente.
- Productos: `ProductMasterModal` se usa desde Maestros, Stock, Mantenimientos y recepción cuando falta un producto. Se revisan datos explícitamente antes de crear. Recepción resuelve todas las referencias antes de registrar movimientos; un código ambiguo no se enlaza por nombre.
- `ProductSearchResults` comparte la selección de productos de compras y ventas; se eliminan líneas genéricas sin maestro. Los detalles usan ID de producto en memoria y conservan códigos, descripción y precios históricos.
- `MasterSelect` comparte selectores de registros. `CatalogValueSelect` consulta los catálogos existentes y conserva los valores históricos no presentes en la respuesta. El esquema actual guarda nombres/símbolos para campos de catálogo; no se agregaron columnas remotas para cambiarlos a FK.
- Cotizaciones selecciona producto por ID y guarda la descripción/precio históricos mediante el contrato actual. El ID del selector no se persiste porque el servicio actual de ítems no tiene ese campo confirmado. La persistencia de referencias completas requiere backend posterior.
- `masterRepositories` adapta los servicios actuales para listar, crear y actualizar productos, clientes y proveedores; los formularios compartidos consumen estos contratos.
- `ReadRepository`, `EntityRepository`, `DataSource` y `findDuplicates` definen contratos de consulta y detección no destructiva. `legacyCatalogRepository` es un adaptador de solo lectura. Las pantallas nuevas de alcance no necesitan datos transaccionales simulados, por lo que no se inventan registros ni conexiones. Los fixtures de las pruebas están aislados del código de producción.
- `maestrosService.ts` anterior queda sin consumidores en las rutas activas. Su catálogo demostrativo no se inicializa al navegar y no se mezcla con productos/almacenes de Supabase. Los datos previos se consultan con el adaptador de lectura.

## Almacenamiento local

Se conservan las claves existentes: `erp_maestros_tech_data_v2`, `erp_ordenes_compra`, `erp_ordenes_venta`, `erp_ordenes_facturadas`, `erp_estado_cuenta`, `erp_dashboard_data`, `erp_dashboard_movements`, además de la sesión gestionada por Supabase. Se añade `erp_theme` para la preferencia de modo oscuro.

Se retiró la sobrescritura de `erp_ordenes_venta` durante la lectura de Facturación. Órdenes distintas con el mismo cliente e importe ya no se fusionan automáticamente: se muestra una advertencia de posible duplicado. Las escrituras explícitas del flujo existente de facturación/cobro se conservan. Los datos locales de maestros no se borran, migran ni fusionan. Los agregados anteriores combinan documentos remotos y caché local como antes; no se añade una mezcla con datos simulados.

## Diferencia de stock conservada y requisitos de backend

Guardar una orden de venta sigue registrando SALIDA/VENTA y descontando stock antes de la facturación. El modelo descrito requiere separar reserva y salida física al despachar; no se implementó ese cambio en esta etapa. Las operaciones actuales de múltiples escrituras no se vuelven atómicas desde el frontend.

Se requieren servicios/transacciones para reservas, despachos, recepciones parciales robustas, pagos, comisiones, objetivos, notificaciones y aprobaciones; autorización por empresa, auditoría central y unicidad concurrente. El frontend no garantiza aislamiento empresarial, concurrencia ni seguridad real. También siguen pendientes el catálogo de plásticos/conversiones de unidades y cualquier campo nuevo no confirmado por el esquema actual. No se sustituyeron datos operativos de tecnología por ejemplos de plásticos.

## Validación

- `npm.cmd run build --prefix frontend`: compilación TypeScript y Vite.
- `npm.cmd run lint --prefix frontend`: oxlint; reporta advertencias del código existente y patrones de efectos, sin exigir una reescritura fuera de alcance.
- `npm.cmd run test:smoke --prefix frontend`: prueba local de navegador sobre `dist`. Requiere Node 24 y Edge/Chromium (`EDGE_PATH` configurable). Cada solicitud externa se intercepta y responde con fixtures; cualquier intento de escritura se bloquea y hace fallar la prueba. No consulta ni modifica la base remota. Usa un perfil temporal aislado bajo `frontend/node_modules/.tmp/frontend-smoke`.
- No había suites de pruebas existentes ni script `test` en el frontend. El smoke verifica rutas anteriores, las doce entradas, submenús, formularios compartidos, modo oscuro persistente, menú móvil y conservación del historial local. No prueba integraciones reales, emisión fiscal ni guardados operativos remotos.
- Evidencia visual local y perfiles de prueba se generan bajo `node_modules/.tmp/frontend-smoke`; no forman parte del código fuente.

### Resultado de la ejecución local

Build y lint finalizaron con código 0; Vite advierte sobre algunos bundles mayores de 500 kB y oxlint mantiene advertencias (variables sin uso, efectos y dependencias de hooks). El smoke del navegador pasó con 14 rutas anteriores, 12 entradas, submenús, formularios, vista móvil y modo oscuro, sin excepciones de ejecución ni intentos de escritura remota. Se inspeccionó la captura móvil en modo oscuro. El PDF y las integraciones reales no pudieron validarse con los archivos disponibles y el alcance de solo frontend.
