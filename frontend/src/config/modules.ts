export interface ModuleLink {
  name: string;
  path?: string;
  description?: string;
}
export interface ErpModule {
  id: string;
  name: string;
  status: 'Parcial' | 'Pendiente';
  scope: string;
  pending: string[];
  links: ModuleLink[];
  secondaryLinks?: ModuleLink[];
}

export const erpModules: ErpModule[] = [
  { id: 'maestros', name: 'Maestros', status: 'Parcial', scope: 'Fuente compartida de clientes, proveedores, productos y catálogos.', pending: ['Edición de catálogos base y consolidación supervisada de datos locales.'], links: [
    { name: 'Productos', path: '/maestros/productos' },
    { name: 'Clientes', path: '/clientes' }, { name: 'Proveedores', path: '/proveedores' },
    { name: 'Almacenes y Catálogos base', path: '/mantenimientos', description: 'Consulta las pestañas de Almacenes, Categorías, Marcas y Unidades en Mantenimientos.' }], secondaryLinks: [{ name: 'Catálogos locales anteriores', path: '/maestros/locales', description: 'Consulta los datos anteriores de este navegador, sin mezclarlos con los maestros operativos.' }] },
  { id: 'compras', name: 'Compras', status: 'Parcial', scope: 'Compras nacionales y seguimiento de recepciones mediante el ingreso al Kardex existente.', pending: ['La recepción física se realiza desde Ingresos y recepción de mercadería, en Inventario y Kardex.', 'Importaciones, Contratos Marco y Evaluación de Proveedores son opcionales y futuros; no condicionan las compras nacionales.'], links: [
    { name: 'Órdenes de compra', path: '/orden-compra', description: 'Compras nacionales y seguimiento de órdenes.' },
    { name: 'Facturas de proveedores', path: '/facturas-proveedores' }], secondaryLinks: [{ name: 'Importaciones' }, { name: 'Contratos Marco' }, { name: 'Evaluación de Proveedores' }] },
  { id: 'ventas', name: 'Ventas', status: 'Parcial', scope: 'Cotizaciones de clientes, órdenes de venta y facturación existentes.', pending: ['Separar reserva de stock y salida física: actualmente guardar una orden de venta descuenta stock. El flujo se conserva en esta etapa.'], links: [
    { name: 'Cotizaciones', path: '/cotizaciones' }, { name: 'Órdenes de venta', path: '/orden-venta' },
    { name: 'Comprobantes', path: '/facturacion', description: 'Abre el flujo de facturación existente.' }, { name: 'Devoluciones', path: '/devoluciones', description: 'Solicitudes locales de devolución, sin movimientos de stock ni abonos.' }] },
  { id: 'inventario', name: 'Inventario y Kardex', status: 'Parcial', scope: 'Existencias, ingresos y movimientos físicos de inventario.', pending: ['Reservas y salidas coordinadas con despachos; operaciones atómicas en backend.'], links: [
    { name: 'Stock actual', path: '/stock-productos' },
    { name: 'Ingresos y recepción de mercadería', path: '/ingreso-kardex', description: 'Ingreso al Kardex y recepción de órdenes de compra en la misma pantalla.' },
    { name: 'Movimientos de Kardex, Salidas y Ajustes', path: '/movimiento-kardex', description: 'Consulta movimientos y registra las salidas manuales o ajustes disponibles. Los ajustes de entrada están en Ingresos.' }] },
  { id: 'tesoreria', name: 'Tesorería', status: 'Parcial', scope: 'Cobros, pagos y caja/bancos locales integrados por moneda.', pending: ['Persistencia multiusuario con transacciones de servidor y conciliación bancaria real.'], links: [
    { name: 'Cuentas por cobrar y Cobros', path: '/estado-cuenta', description: 'Estado de cuenta y registro de cobros existentes.' },
    { name: 'Cuentas por pagar', path: '/cuentas-por-pagar', description: 'Obligaciones de facturas de proveedores registradas.' }, { name: 'Pagos', path: '/pagos', description: 'Pagos parciales/totales y reversiones trazables.' }, { name: 'Caja/Bancos', path: '/caja-bancos', description: 'Cuentas, saldos y transferencias internas por moneda.' }], secondaryLinks: [{ name: 'Movimientos de Caja/Bancos', path: '/caja-bancos/movimientos' }] },
  { id: 'logistica', name: 'Logística y Transporte', status: 'Parcial', scope: 'Despachos, entregas y planificación manual de rutas con persistencia local.', pending: ['Transacciones y permisos multiusuario en servidor; integración futura con inventario sin duplicar salidas.', 'Edición del maestro de transportistas y gestión de flota. No se emiten guías oficiales.'], links: [
    { name: 'Despachos', path: '/despachos', description: 'Programación total o parcial desde ventas existentes.' }, { name: 'Entregas', path: '/entregas', description: 'Cantidades e historial de intentos por despacho enviado.' }, { name: 'Rutas', path: '/rutas', description: 'Asignación y orden manual de paradas.' },
    { name: 'Transportistas', path: '/transportistas', description: 'Consulta del maestro local existente, sin crear un catálogo paralelo.' }] },
  { id: 'comisiones', name: 'Comisiones de Vendedores', status: 'Pendiente', scope: 'Cálculo, revisión y liquidación de comisiones por vendedor.', pending: ['Reglas, base de cálculo, aprobación y liquidación.', 'Los porcentajes del catálogo local no calculan comisiones.'], links: [
    { name: 'Reglas de comisión' }, { name: 'Comisiones por vendedor' }, { name: 'Liquidaciones' }] },
  { id: 'metas', name: 'Metas y Objetivos', status: 'Pendiente', scope: 'Objetivos por periodo, vendedor y equipo; seguimiento de cumplimiento.', pending: ['Asignación de objetivos e indicadores conectados a operaciones.', 'Las cuotas locales de vendedores son solo datos de referencia.'], links: [
    { name: 'Metas' }, { name: 'Avance' }, { name: 'Cumplimiento por vendedor' }] },
  { id: 'reportes-bi', name: 'Reportes y BI', status: 'Parcial', scope: 'Dashboard inicial y reportes disponibles del ERP.', pending: ['BI consolidado y métricas de los módulos futuros.'], links: [
    { name: 'Ventas, Compras e Inventario', path: '/reportes', description: 'Selecciona la categoría o plantilla en la pantalla de reportes existente.' },
    { name: 'Cuentas por cobrar/pagar', description: 'Estos reportes específicos todavía no están disponibles.' }], secondaryLinks: [{ name: 'Otras plantillas contables', path: '/reportes', description: 'Las plantillas secundarias siguen dentro de la pantalla de Reportes.' }] },
  { id: 'seguridad', name: 'Seguridad y Auditoría', status: 'Parcial', scope: 'Inicio de sesión existente. Alcance futuro: roles y registro de acciones del ERP.', pending: ['Auditoría central de operaciones y autorización efectiva en backend.', 'Los historiales de clientes y proveedores no constituyen una auditoría global.'], links: [
    { name: 'Usuarios' }, { name: 'Roles y permisos' }, { name: 'Historial de acciones', description: 'La auditoría global del ERP está pendiente.' }], secondaryLinks: [{ name: 'Inicio de sesión', path: '/login' }, { name: 'Registro de cuenta', path: '/registro' }] },
  { id: 'configuracion', name: 'Configuración e Integraciones', status: 'Parcial', scope: 'Se conservan las conexiones existentes a Supabase y consulta de documentos mediante Migo.', pending: ['Interfaz de configuración y administración de integraciones.', 'No hay nuevas conexiones ni endpoints en esta etapa.'], links: [
    { name: 'Empresa y parámetros' }, { name: 'Series documentales' },
    { name: 'Integraciones', description: 'Las conexiones existentes se conservan; su administración desde esta pantalla está pendiente.' }] },
  { id: 'notificaciones', name: 'Notificaciones y Aprobaciones', status: 'Pendiente', scope: 'Bandeja de avisos, solicitudes y decisiones de aprobación.', pending: ['Persistencia, reglas, destinatarios y flujo de aprobación. No hay avisos operativos conectados.'], links: [
    { name: 'Notificaciones' }, { name: 'Aprobaciones pendientes' }, { name: 'Historial de decisiones' }] },
];
