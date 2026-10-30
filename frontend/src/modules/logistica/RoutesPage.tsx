import { RoutePlanner } from './RoutePlanner';
import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import type { RoutePlan } from './types';
import { logisticsService } from './runtime';
import { ErrorNotice, Filters, Loading, LogisticsShell, Pagination } from './LogisticsUI';
import { primary, useLoad } from './uiSupport';
import { useLogisticsQuery } from './useLogisticsQuery';
import { RouteEditor } from './RouteEditor';
import { RouteDetail } from './RouteDetail';
export function RoutesPage(){
  const {query,patch,reset,filtered,invalid}=useLogisticsQuery();const [revision,setRevision]=useState(0);const [editor,setEditor]=useState<{route?:RoutePlan}|null>(null);const [detail,setDetail]=useState('');
  const resource=useLoad(useCallback(()=>logisticsService.routes(query),[query]),revision);const reload=()=>setRevision(n=>n+1);
  return <LogisticsShell title="Rutas" description="Planifica destinos y ordena paradas manualmente. El seguimiento respeta la salida y las entregas de cada despacho." action={<button className={`${primary} inline-flex items-center gap-2`} onClick={()=>setEditor({})}><Plus size={17} aria-hidden="true"/>Nueva ruta</button>}>
    <Filters query={query} patch={patch} reset={()=>{reset();reload();}} statuses={['PLANIFICADA','EN_CURSO','FINALIZADA','CANCELADA']} dateLabel="Fecha de ruta"/>
    {invalid&&<p role="alert" className="text-amber-700 dark:text-amber-300">La fecha inicial no puede superar la final.</p>}
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={reload}/>:resource.data&&!invalid&&<><RoutePlanner items={resource.data.items} filtered={filtered} onCreate={()=>setEditor({})} onDetail={setDetail} onChange={reload} onEdit={r=>{setDetail('');setEditor({route:r});}}/>{resource.data.total>0&&<Pagination query={query} total={resource.data.total} onChange={patch}/>}</>}
    {editor&&<RouteEditor route={editor.route} onClose={()=>setEditor(null)} onDone={r=>{setEditor(null);setDetail(r.id);reload();}}/>}{detail&&<RouteDetail id={detail} onClose={()=>setDetail('')} onChange={reload} onEdit={r=>{setDetail('');setEditor({route:r});}}/>}
  </LogisticsShell>;
}
