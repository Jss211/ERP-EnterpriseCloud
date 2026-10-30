import { DispatchBoard } from './DispatchBoard';
import { DeliveriesInbox } from './DeliveriesInbox';
import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Dispatch } from './types';
import { logisticsService } from './runtime';
import { ErrorNotice, Filters, Loading, LogisticsShell, Pagination } from './LogisticsUI';
import { primary, useLoad } from './uiSupport';
import { DispatchEditor } from './DispatchEditor';
import { DeliveryEditor } from './DeliveryEditor';
import { DispatchDetail } from './DispatchDetail';
import { useLogisticsQuery } from './useLogisticsQuery';
function DispatchWorkspace({deliveryMode=false}:{deliveryMode?:boolean}) {
  const {query,patch,reset,filtered,invalid}=useLogisticsQuery();const [revision,setRevision]=useState(0);
  const [editor,setEditor]=useState<{dispatch?:Dispatch}|null>(null);const [attempt,setAttempt]=useState<Dispatch|null>(null);const [detail,setDetail]=useState('');
  const resource=useLoad(useCallback(async()=>{
    if(deliveryMode){const page=await logisticsService.deliveries(query);return {total:page.total,items:page.items.map(v=>({dispatch:v.dispatch,status:v.status}))};}
    const page=await logisticsService.dispatches(query);return {total:page.total,items:page.items.map(dispatch=>({dispatch,status:dispatch.status as string}))};
  },[query,deliveryMode]),revision);
  const reload=()=>setRevision(n=>n+1);
  return <LogisticsShell title={deliveryMode?'Entregas':'Despachos'} description={deliveryMode?'Seguimiento por despacho enviado. Consulta cantidades e historial de intentos en el detalle.':'Prepara salidas totales o parciales desde ventas existentes, sin generar un nuevo descuento de stock.'} action={!deliveryMode&&<button className={`${primary} flex items-center gap-2`} onClick={()=>setEditor({})}><Plus size={17} aria-hidden="true"/>Nuevo despacho</button>}>
    <Filters query={query} patch={patch} reset={()=>{reset();reload();}} statuses={deliveryMode?['PENDIENTE','PARCIAL','ENTREGADO']:['BORRADOR','PREPARADO','DESPACHADO','CANCELADO']}/>
    {invalid&&<p role="alert" className="text-amber-700 dark:text-amber-300">La fecha inicial no puede superar la final.</p>}
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={reload}/>:resource.data&&!invalid&&<>
      {deliveryMode?<DeliveriesInbox items={resource.data.items} filtered={filtered} onDetail={setDetail} onChange={reload} onEdit={d=>{setDetail('');setEditor({dispatch:d});}} onAttempt={d=>{setDetail('');setAttempt(d);}}/>:<DispatchBoard items={resource.data.items} filtered={filtered} page={query.page} onCreate={()=>setEditor({})} onDetail={setDetail}/>}
      {resource.data.total>0&&<Pagination query={query} total={resource.data.total} onChange={patch}/>}
    </>}
    {editor&&<DispatchEditor dispatch={editor.dispatch} onClose={()=>setEditor(null)} onDone={d=>{setEditor(null);setDetail(d.id);reload();}}/>}
    {attempt&&<DeliveryEditor dispatch={attempt} onClose={()=>setAttempt(null)} onDone={a=>{setAttempt(null);setDetail(a.dispatchId);reload();}}/>}
    {detail&&<DispatchDetail id={detail} onClose={()=>setDetail('')} onChange={reload} onEdit={d=>{setDetail('');setEditor({dispatch:d});}} onAttempt={d=>{setDetail('');setAttempt(d);}}/>}
  </LogisticsShell>;
}
export function DispatchesPage(){return <DispatchWorkspace/>;}
export function DeliveriesPage(){return <DispatchWorkspace deliveryMode/>;}
