import { ModuleOverviewPage } from '../estructura/ModuleOverviewPage';
export function MaestrosPage() {
  return <div className="space-y-5"><ModuleOverviewPage moduleId="maestros" />
    <p className="text-sm text-slate-500 dark:text-slate-400">Los formularios operativos comparten los servicios de clientes, proveedores e inventario. Los datos locales anteriores se conservan separados para revisión.</p>
  </div>;
}
