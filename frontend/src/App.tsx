import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { erpModules } from './config/modules';
import { ModuleOverviewPage } from './modules/estructura/ModuleOverviewPage';
import { LoginPage } from '@/components/ui/sign-in-page';
import { SignUpPage } from '@/components/ui/sign-up-page';
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const OrdenCompraPage = lazy(() => import('./modules/compras/OrdenCompraPage').then(m => ({ default: m.OrdenCompraPage })));
const OrdenVentaPage = lazy(() => import('./modules/ventas/OrdenVentaPage').then(m => ({ default: m.OrdenVentaPage })));
const FacturacionPage = lazy(() => import('./modules/ventas/FacturacionPage').then(m => ({ default: m.FacturacionPage })));
const EstadoCuentaPage = lazy(() => import('./modules/ventas/EstadoCuentaPage').then(m => ({ default: m.EstadoCuentaPage })));
const IngresoKardexPage = lazy(() => import('./modules/inventario/IngresoKardexPage').then(m => ({ default: m.IngresoKardexPage })));
const MovimientoKardexPage = lazy(() => import('./modules/inventario/MovimientoKardexPage').then(m => ({ default: m.MovimientoKardexPage })));
const StockProductosPage = lazy(() => import('./modules/inventario/StockProductosPage').then(m => ({ default: m.StockProductosPage })));
const ReportesPage = lazy(() => import('./modules/reportes/ReportesPage').then(m => ({ default: m.ReportesPage })));
const MantenimientosPage = lazy(() => import('./modules/mantenimientos/MantenimientosPage').then(m => ({ default: m.MantenimientosPage })));
const ClientesPage = lazy(() => import('./modules/clientes/ClientesPage').then(m => ({ default: m.ClientesPage })));
const ProveedoresPage = lazy(() => import('./modules/proveedores/ProveedoresPage').then(m => ({ default: m.ProveedoresPage })));
const CotizacionesPage = lazy(() => import('./modules/cotizaciones/CotizacionesPage').then(m => ({ default: m.CotizacionesPage })));
const MaestrosPage = lazy(() => import('./modules/maestros/MaestrosPage').then(m => ({ default: m.MaestrosPage })));
const LocalCatalogsPage = lazy(() => import('./modules/maestros/LocalCatalogsPage').then(m => ({ default: m.LocalCatalogsPage })));
const FacturasProveedoresPage = lazy(() => import('./modules/compras/facturas/FacturasProveedoresPage').then(m => ({ default: m.FacturasProveedoresPage })));
const DevolucionesPage = lazy(() => import('./modules/ventas/devoluciones/DevolucionesPage').then(m => ({ default: m.DevolucionesPage })));
const PayablesPage = lazy(() => import('./modules/tesoreria/PayablesPage').then(m => ({ default: m.PayablesPage })));
const PaymentsPage = lazy(() => import('./modules/tesoreria/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
const CashBanksPage = lazy(() => import('./modules/tesoreria/CashBanksPage').then(m => ({ default: m.CashBanksPage })));
const CashBankMovementsPage = lazy(() => import('./modules/tesoreria/CashBankMovementsPage').then(m => ({ default: m.CashBankMovementsPage })));
const TreasurySummaryPage = lazy(() => import('./modules/tesoreria/TreasurySummaryPage').then(m => ({ default: m.TreasurySummaryPage })));
const DispatchesPage = lazy(() => import('./modules/logistica/DispatchesPage').then(m => ({ default: m.DispatchesPage })));
const DeliveriesPage = lazy(() => import('./modules/logistica/DispatchesPage').then(m => ({ default: m.DeliveriesPage })));
const RoutesPage = lazy(() => import('./modules/logistica/RoutesPage').then(m => ({ default: m.RoutesPage })));
const CarriersPage = lazy(() => import('./modules/logistica/CarriersPage').then(m => ({ default: m.CarriersPage })));
const LogisticsSummaryPage = lazy(() => import('./modules/logistica/LogisticsSummaryPage').then(m => ({ default: m.LogisticsSummaryPage })));
function App() {
  return <BrowserRouter><Suspense fallback={<p role="status" className="p-6 text-slate-500">Cargando página…</p>}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/registro" element={<SignUpPage />} />
    <Route path="/" element={<MainLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="facturas-proveedores" element={<FacturasProveedoresPage />} />
      <Route path="devoluciones" element={<DevolucionesPage />} />
      <Route path="orden-compra" element={<OrdenCompraPage />} />
      <Route path="orden-venta" element={<OrdenVentaPage />} />
      <Route path="facturacion" element={<FacturacionPage />} />
      <Route path="estado-cuenta" element={<EstadoCuentaPage />} />
      <Route path="cuentas-por-pagar" element={<PayablesPage />} />
      <Route path="pagos" element={<PaymentsPage />} />
      <Route path="caja-bancos" element={<CashBanksPage />} />
      <Route path="caja-bancos/movimientos" element={<CashBankMovementsPage />} />
      <Route path="logistica" element={<LogisticsSummaryPage />} />
      <Route path="despachos" element={<DispatchesPage />} />
      <Route path="entregas" element={<DeliveriesPage />} />
      <Route path="rutas" element={<RoutesPage />} />
      <Route path="transportistas" element={<CarriersPage />} />
      <Route path="tesoreria" element={<TreasurySummaryPage />} />
      <Route path="ingreso-kardex" element={<IngresoKardexPage />} />
      <Route path="movimiento-kardex" element={<MovimientoKardexPage />} />
      <Route path="stock-productos" element={<StockProductosPage />} />
      <Route path="reportes" element={<ReportesPage />} />
      <Route path="maestros" element={<MaestrosPage />} />
      <Route path="mantenimientos" element={<MantenimientosPage />} />
      <Route path="clientes" element={<ClientesPage />} />
      <Route path="proveedores" element={<ProveedoresPage />} />
      <Route path="cotizaciones" element={<CotizacionesPage />} />
      <Route path="maestros/locales" element={<LocalCatalogsPage />} />
      <Route path="maestros/productos" element={<StockProductosPage masterMode />} />
      {erpModules.filter(module => module.id !== 'maestros' && module.id !== 'tesoreria' && module.id !== 'logistica').map(module => <Route key={module.id} path={module.id} element={<ModuleOverviewPage moduleId={module.id} />} />)}
      <Route path="*" element={<div className="space-y-4 text-slate-800 dark:text-white"><h1 className="text-2xl font-bold">Página no encontrada</h1><Link className="text-blue-600" to="/">Volver al dashboard</Link></div>} />
    </Route>
  </Routes></Suspense></BrowserRouter>;
}
export default App;
