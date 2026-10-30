# Fondos e identificación de cuentas de Tesorería

## Diagnóstico

El fallo reproducible estaba en `src/modules/tesoreria/service.ts`, método `record`: antes de este cambio se comprobaban cuenta activa, moneda, fecha y deuda (`operation.amountMinor <= obligation.balanceMinor`), pero no se comparaba el egreso con `accountBalance(state, account.id)`. Las transferencias tampoco tenían esa comprobación. `cancel` agregaba reversiones sin comprobar el saldo de la cuenta que sufriría el retiro.

Reproducción aislada con el servicio anterior: apertura 0 céntimos, factura de 10 000 céntimos y pago de 1 000 céntimos. Resultado: saldo −1 000, una operación, una aplicación y un movimiento. Reintentar el mismo ID no creó un segundo movimiento. Por tanto, ese negativo se produce por falta de control de fondos, sin necesidad de duplicados.

El cálculo en `domain.ts`, `accountBalance`, es apertura + ingresos − egresos, incluidas las reversiones. `operationMovements` genera IDs estables y `validateState` exige IDs únicos y el conjunto exacto de movimientos esperado para las operaciones. La idempotencia ya existía en `record` y `cancel`. No se encontró un doble descuento en esa fórmula. También se admitían aperturas negativas y anulaciones de ingresos ya utilizados; pueden explicar otros negativos. No se inspeccionaron datos del navegador habitual del usuario, por lo que no se atribuye una causa concreta a cada cuenta real.

## Reglas y guardado

- `requireFunds` centraliza el control en céntimos enteros, sin combinar monedas. El importe debe ser positivo y no superar el saldo; se permite agotarlo exactamente.
- `record` conserva las validaciones de actividad, moneda, fecha y deuda. Comprueba los fondos de pagos y transferencias dentro de `repository.transact`, sobre el estado recién leído y antes de agregar aplicaciones o movimientos.
- El formulario muestra origen, titular, moneda, saldo e importe. Su revisión usa la misma función. El servicio nunca confía en esa instantánea; al rechazar se conservan los campos y se actualiza el saldo mostrado.
- `requireCancellationFunds` protege la anulación de cobros y la devolución del dinero desde el destino de transferencias. Si falta dinero, explica qué cuenta se reduciría y pide revisar los egresos posteriores. Se conserva motivo y confirmación. La anulación de pagos devuelve dinero y sigue disponible, incluso para corregir una cuenta antigua negativa o inactiva.
- Una excepción antes del guardado descarta la instantánea en memoria. `localStorage.setItem` guarda todo el estado en una sola escritura; un fallo de cuota no guarda un pago parcial. Un resultado de escritura ambiguo se resuelve reintentando el mismo ID, sin duplicar movimientos. No se intenta un rollback que pudiera borrar una operación ya confirmada.
- Los saldos negativos existentes se mantienen visibles con advertencia y enlace al historial. No se borran registros, no se cambian aperturas y no se crean ingresos correctivos.

## Concurrencia local

El repositorio relee el estado al entrar en la transacción. Usa Web Locks con la misma clave de almacenamiento para serializar pestañas cooperantes del mismo origen, cuando el navegador lo permite. Sin Web Locks, la cola serializa llamadas de esa instancia. Antes de escribir también se compara el valor almacenado con la instantánea inicial y se rechaza si otra ventana lo cambió durante una espera.

La comparación final no es un compare-and-set atómico. Sin Web Locks aún hay una ventana entre lectura y escritura, y ningún mecanismo frontend garantiza fondos entre equipos ni frente a código antiguo u otros escritores que omitan el bloqueo. Una versión multiusuario necesita una transacción en servidor, control de concurrencia sobre las cuentas afectadas, validación autoritativa de fondos e idempotencia. Este cambio no modifica backend, SQL ni RLS.

## Titular y compatibilidad

`name` sigue siendo el nombre o alias; `holderName` es empresa/titular y `responsibleName` el responsable interno opcional. Las tarjetas y formularios lo distinguen de un proveedor. El banco y el número enmascarado se conservan.

No hay una ficha operativa de empresa en el frontend: «Empresa y parámetros» aparece pendiente en `config/modules.ts`. Los nombres del ERP y de las contrapartes no se usan como titulares. Los datos no informados se muestran como «Titular no especificado» y se pueden completar al editar.

`migrateTreasuryState` convierte de versión 1 a 2 manteniendo la clave `erp_treasury_v1` para conservar el mismo libro. Agrega campos vacíos a las cuentas antiguas sin cambiar IDs, revisiones, aperturas, operaciones, aplicaciones, movimientos ni documentos bloqueados. La lectura y los rechazos no escriben; la versión 2 se persiste con la siguiente transacción que realmente modifique datos y solo si el guardado completo tiene éxito. Un formato desconocido o dañado se conserva intacto y se informa como error. Tras actualizar la aplicación conviene recargar las pestañas antiguas para que todas utilicen el mismo formato y reglas.

## Verificación local

`node tests/treasury-funds-unit.mjs` ejecuta la compatibilidad previa y cubre importes menores, iguales y mayores al saldo, fondos cero y negativos, cuentas inactivas y monedas distintas, transferencias, reversiones dependientes, doble clic/reintentos, errores de cuota y confirmación ambigua, instantáneas obsoletas y migración sin pérdida.

`node tests/treasury-browser.mjs` utiliza un perfil aislado e intercepta las peticiones externas. Comprueba los formularios y flujos previos, identidad de cuentas antiguas, error de fondos sin pérdida del formulario, relectura al confirmar y pago exacto. No escribe en Supabase ni en el almacenamiento habitual del usuario.

Verificaciones adicionales: `npm.cmd run build` (incluye TypeScript), `npm.cmd run lint` y `node tests/treasury-sales-compatibility.mjs`.
