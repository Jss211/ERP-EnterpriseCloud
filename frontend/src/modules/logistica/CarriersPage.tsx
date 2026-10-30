import { CarrierDirectory } from './CarrierDirectory';
import { Info } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Carrier } from './types';
import { logisticsSources } from './runtime';
import { ErrorNotice, Filters, Loading, LogisticsShell, Modal, Pagination } from './LogisticsUI';
import { useLoad } from './uiSupport';
import { TransportInfo } from './TransportInfo';
import { useLogisticsQuery } from './useLogisticsQuery';
export function CarriersPage(){
  const {query,patch,reset,filtered}=useLogisticsQuery();const [revision,setRevision]=useState(0);const [detail,setDetail]=useState<Carrier|null>(null);
  const resource=useLoad(useCallback(()=>logisticsSources.carriers(query),[query]),revision);
  return <LogisticsShell title="Transportistas" description="Consulta el maestro local existente y los datos de transporte que permite reutilizar.">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><p className="flex items-center gap-2"><Info size={14} aria-hidden="true"/>Solo consulta · Maestro local anterior, verifica sus datos.</p><Link className="font-semibold text-blue-600 dark:text-blue-400" to="/maestros/locales">Consultar catálogo de origen →</Link></div>
    <Filters query={query} patch={patch} reset={()=>{reset();setRevision(n=>n+1);}} statuses={['ACTIVO','INACTIVO']} showDates={false} searchLabel="Buscar transportista" placeholder="Nombre, documento, placa o conductor"/>
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={()=>setRevision(n=>n+1)}/>:resource.data&&<><CarrierDirectory items={resource.data.items} filtered={filtered} onDetail={setDetail}/>{resource.data.total>0&&<Pagination query={query} total={resource.data.total} onChange={patch}/>}</>}
    <details className="text-xs text-slate-500 dark:text-slate-400"><summary className="cursor-pointer">Sobre este maestro y su edición</summary><p className="mt-2 max-w-3xl leading-relaxed">Datos anteriores de origen no verificado: revisa documento, placa y licencia antes de asignarlos. No se inicializan ejemplos ni se crea un catálogo paralelo. La edición fiable del maestro y la gestión de flotas y conductores están pendientes de integración.</p></details>
    {detail&&<Modal title="Datos del transportista · Consulta" onClose={()=>setDetail(null)}><TransportInfo carrier={detail}/><p className="mt-4 text-xs text-slate-500 dark:text-slate-400">El maestro solo informa un vehículo y un conductor por registro. No constituye un catálogo independiente de flota.</p></Modal>}
  </LogisticsShell>;
}
