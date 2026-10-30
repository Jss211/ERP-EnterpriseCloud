import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { erpModules } from '../../config/modules';
import { logisticsService } from './runtime';
import { ErrorNotice, Loading, LogisticsShell } from './LogisticsUI';
import { button, panel, useLoad } from './uiSupport';
export function LogisticsSummaryPage(){
  const [revision,setRevision]=useState(0);const resource=useLoad(useCallback(()=>logisticsService.summary(),[]),revision);
  const module=erpModules.find(m=>m.id==='logistica')!;
  return <LogisticsShell title="Logística y Transporte" description="Planificación local de despachos, entregas y rutas. El stock conserva el flujo actual de Ventas e Inventario." action={<button className={button} onClick={()=>setRevision(n=>n+1)}>Actualizar resumen</button>}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{module.links.map(link=><Link key={link.name} to={link.path!} className={`${panel} font-semibold text-blue-700 dark:text-blue-300`}>{link.name}<p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">{link.description}</p></Link>)}</div>
    <h2 className="font-semibold">Operaciones de este navegador</h2>
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={()=>setRevision(n=>n+1)}/>:resource.data&&<dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Despachos registrados',resource.data.dispatches],['Preparados',resource.data.prepared],['Despachos con entrega pendiente',resource.data.pendingDeliveries],['Rutas activas',resource.data.activeRoutes]].map(([label,value])=><div className={panel} key={label}><dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>}
    <p className="text-xs text-slate-500 dark:text-slate-400">Los totales corresponden únicamente al registro logístico local, no a todas las ventas ni a otros usuarios. Los borradores también reservan cantidades programadas.</p>
  </LogisticsShell>;
}
