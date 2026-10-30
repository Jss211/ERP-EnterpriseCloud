# Tesoreria: comparacion visual

Capturas generadas con `node tests/treasury-browser.mjs`, usando el build local, un perfil aislado y peticiones externas interceptadas. Los datos simulados se guardan solo en ese perfil de prueba, nunca en el navegador habitual ni en Supabase.

| Pantalla | Vacia | Con datos |
| --- | --- | --- |
| Cuentas por pagar | [Ver captura](obligaciones-empty-desktop-light.png) | [Ver captura](obligaciones-data-desktop-light.png) |
| Pagos a proveedores | [Ver captura](pagos-empty-desktop-light.png) | [Ver captura](pagos-data-desktop-light.png) |
| Caja/Bancos | [Ver captura](cuentas-empty-desktop-light.png) | [Ver captura](cuentas-data-desktop-light.png) |

Hay 24 capturas: las tres pantallas vacias y con datos, en escritorio (1440 px), movil (390 px), claro y oscuro. Los nombres siguen el formato `pantalla-empty/data-desktop/mobile-light/dark.png`.

[Abrir galeria comparativa con selector de tema y dispositivo](index.html).

[Ver pagina independiente de movimientos](cuentas-movimientos.png).

## Verificacion

- TypeScript y build: `npm.cmd run build`.
- Lint: `npm.cmd run lint` (advertencias existentes en otros archivos).
- Dominio: `node tests/treasury-unit.mjs`.
- Compatibilidad: `node tests/treasury-sales-compatibility.mjs`.
- Navegador: `node tests/treasury-browser.mjs`.

El navegador comprueba carga con respuestas demoradas, estados vacios, sin coincidencias, errores y recuperacion; formularios de cuentas y pagos; detalles, anulaciones, transferencias, filtros desplegables, seleccion de factura, pago preseleccionado, movimientos en `/caja-bancos/movimientos`, cuenta y paginacion en URL, recarga y navegacion Atras/Adelante y navegacion entre paginas; adaptacion movil y temas. Tambien verifica que no se intentan escrituras remotas y que las operaciones no alteran facturas, ventas, stock ni Kardex.

No se agregan indicadores agregados: las consultas de estas pantallas no entregan indicadores por moneda. Se conserva el calculo existente de saldo de cada cuenta.
