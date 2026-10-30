import { useCallback, useRef, useState } from 'react';
import type { DeliveryAttempt, DeliveryInput, Dispatch } from './types';
import { deliveredForLine, ensure, quantity, quantityInput, today, units, validDate } from './domain';
import { logisticsService } from './runtime';
import { ErrorNotice, Loading, Modal } from './LogisticsUI';
import { button, control, errorText, panel, primary, useLoad } from './uiSupport';
export function DeliveryEditor({dispatch,onClose,onDone}:{dispatch:Dispatch;onClose:()=>void;onDone:(a:DeliveryAttempt)=>void}) {
  const [id]=useState(()=>crypto.randomUUID());const [commandId]=useState(()=>crypto.randomUUID());const guard=useRef(false);
  const [date,setDate]=useState(today);const [receiver,setReceiver]=useState('');const [outcome,setOutcome]=useState<DeliveryInput['outcome']>('ENTREGA');const [incidents,setIncidents]=useState('');
  const [quantities,setQuantities]=useState<Record<string,string>>({});const [review,setReview]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  const resource=useLoad(useCallback(()=>logisticsService.state(),[]),revision);
  const current=resource.data?.dispatches.find(d=>d.id===dispatch.id);
  const pending=(lineId:string)=>{const line=current?.lines.find(l=>l.id===lineId);return line&&resource.data?line.quantityUnits-deliveredForLine(resource.data,current!.id,line.id):0;};
  function input():DeliveryInput {
    ensure(resource.data&&current?.status==='DESPACHADO'&&!resource.loading,'Espera a que se compruebe el despacho enviado.');ensure(validDate(date),'Ingresa una fecha válida.');
    const lines=current.lines.map(l=>({dispatchLineId:l.id,quantityUnits:outcome==='ENTREGA'?units(quantities[l.id]||'0'):0}));
    ensure(lines.every(l=>l.quantityUnits<=pending(l.dispatchLineId)),'La cantidad supera lo enviado pendiente.');
    ensure(outcome==='ENTREGA'?lines.some(l=>l.quantityUnits>0)&&!!receiver.trim():!!incidents.trim(),'Una entrega requiere receptor y cantidad positiva; un intento fallido o rechazado requiere incidencias.');
    return {id,dispatchId:dispatch.id,date,receiver,outcome,incidents,lines};
  }
  function preview(){try{input();setError('');setReview(true);}catch(e){setError(errorText(e));}}
  async function save(){if(guard.current)return;guard.current=true;setBusy(true);setError('');try{onDone(await logisticsService.registerDelivery(input(),commandId));}catch(e){setError(errorText(e));}finally{guard.current=false;setBusy(false);}}
  return <Modal title={`Registrar intento · ${dispatch.code}`} busy={busy} onClose={onClose}><div className="space-y-4">
    {error&&<div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"><p>{error}</p><button className={button} onClick={()=>{setReview(false);setRevision(n=>n+1);}}>Actualizar pendientes</button></div>}
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={()=>setRevision(n=>n+1)}/>:!current?<p role="alert">El despacho no está disponible.</p>:review?<>
      <h3 className="font-semibold">Revisa el intento de entrega</h3><div className={`${panel} space-y-2 text-sm`}><p>{dispatch.source.customer.name} · {dispatch.address}</p><p>{date} · {outcome==='ENTREGA'?'Entrega':outcome==='FALLIDA'?'Intento fallido':'Rechazada'} · Receptor: {receiver||'No informado'}</p><ul>{input().lines.map(l=><li key={l.dispatchLineId}>{current.lines.find(s=>s.id===l.dispatchLineId)?.description}: {quantity(l.quantityUnits)}</li>)}</ul><p className="whitespace-pre-wrap">Incidencias: {incidents||'Sin incidencias'}</p></div><p className="text-xs text-slate-500 dark:text-slate-400">Este intento no genera devoluciones, reembolsos ni movimientos de stock.</p><div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={()=>setReview(false)}>Editar</button><button className={primary} disabled={busy} onClick={()=>void save()}>{busy?'Guardando…':'Confirmar intento'}</button></div>
    </>:<form onSubmit={e=>{e.preventDefault();preview();}} className="space-y-4"><p className="text-sm">{current.source.customer.name} · {current.address}</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Fecha del intento<input required type="date" className={control} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="text-sm">Resultado<select className={control} value={outcome} onChange={e=>setOutcome(e.target.value as DeliveryInput['outcome'])}><option value="ENTREGA">Entrega total o parcial</option><option value="FALLIDA">Intento fallido</option><option value="RECHAZADA">Rechazada</option></select></label><label className="text-sm sm:col-span-2">Receptor<input required={outcome==='ENTREGA'} className={control} maxLength={200} value={receiver} onChange={e=>setReceiver(e.target.value)}/></label></div>
      <div className="space-y-3">{current.lines.map(l=><label key={l.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_8rem] dark:border-slate-700"><span className="break-words"><strong className="block">{l.description}</strong><span className="text-xs text-slate-500 dark:text-slate-400">Enviado: {quantity(l.quantityUnits)} · Entregado: {quantity(l.quantityUnits-pending(l.id))} · Pendiente: {quantity(pending(l.id))}</span></span><span>Cantidad entregada<input aria-label={`Entregar ${l.id}`} disabled={outcome!=='ENTREGA'||pending(l.id)===0} inputMode="decimal" className={control} value={outcome==='ENTREGA'?quantities[l.id]||'':'0'} onChange={e=>setQuantities(q=>({...q,[l.id]:e.target.value}))}/></span></label>)}</div>
      {outcome==='ENTREGA'&&<button type="button" className={button} onClick={()=>setQuantities(Object.fromEntries(current.lines.map(l=>[l.id,quantityInput(pending(l.id))])))}>Completar cantidades pendientes</button>}
      <label className="block text-sm">Incidencias<textarea required={outcome!=='ENTREGA'} maxLength={4000} className={control} value={incidents} onChange={e=>setIncidents(e.target.value)}/></label><div className="flex justify-end"><button className={primary} type="submit">Revisar intento</button></div>
    </form>}
  </div></Modal>;
}
