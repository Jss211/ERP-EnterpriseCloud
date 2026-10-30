import { FileText, CalendarClock, ArrowRight } from 'lucide-react';
import { WorkspaceSearch, WorkspaceEmpty } from './WorkspaceUI';
import { Link } from 'react-router-dom';
import { useCallback, useState } from 'react';
import type { Obligation, Query } from './types';
import { treasuryService } from './runtime';
import { money } from './money';
import { OperationForm } from './OperationForm';
import { FinancialDetail } from './FinancialDetail';
import { Loading, Pagination, TreasuryError, TreasuryHeader } from './TreasuryUI';
import { button, control, primary } from './styles';
import { useTreasuryLoad } from './useTreasuryLoad';
export function PayablesPage() {
 const [query,setQuery]=useState<Query>({page:1,pageSize:10,search:'',status:'',currency:'',from:'',to:''});const [revision,setRevision]=useState(0);
 const [selectedId,setSelectedId]=useState('');
 const [pay,setPay]=useState<Obligation|null>(null);const [detail,setDetail]=useState<Obligation|null>(null);const [operationId,setOperationId]=useState('');
 const resource=useTreasuryLoad(useCallback(async()=>{const view=await treasuryService.workspace(query,'PAGAR');return {page:view.obligations,all:view.documents,state:view.state};},[query]),revision);
 const patch=(p:Partial<Query>)=>setQuery(q=>({...q,...p,page:p.page??1}));const reload=()=>setRevision(n=>n+1);
 const invalid=!!(query.from&&query.to&&query.from>query.to);
 const filtered=!!(query.search||query.status||query.currency||query.from||query.to);
 const selected=resource.data?.page.items.find(o=>o.id===selectedId)||resource.data?.page.items[0];
 const showSearch=filtered||!!resource.data?.all.length||!!resource.error;
 const reason=selected&&(selected.blockedReason||(selected.cancelled?'Factura anulada':selected.balanceMinor<=0?'Sin saldo pendiente':''));
 return <section className="min-w-0 text-slate-800 dark:text-slate-100">
 <TreasuryHeader title="Cuentas por pagar" description="Bandeja de obligaciones · Selecciona una factura para revisar su saldo."/>
 {showSearch&&<WorkspaceSearch label="Documento o proveedor" value={query.search||''} onChange={search=>patch({search})} active={filtered} onReset={()=>{setQuery(q=>({page:1,pageSize:q.pageSize,search:'',status:'',currency:'',from:'',to:''}));reload();}}>
 <label className="text-sm">Estado de pago<select className={control} value={query.status} onChange={e=>patch({status:e.target.value})}><option value="">Todos</option><option>PENDIENTE</option><option>PARCIAL</option><option>PAGADA</option></select></label>
 <label className="text-sm">Moneda<select className={control} value={query.currency} onChange={e=>patch({currency:e.target.value})}><option value="">Todas</option><option>PEN</option><option>USD</option></select></label>
 <label className="text-sm">Emisión desde<input type="date" className={control} value={query.from} onChange={e=>patch({from:e.target.value})}/></label>
 <label className="text-sm">Emisión hasta<input type="date" className={control} value={query.to} onChange={e=>patch({to:e.target.value})}/></label>
 </WorkspaceSearch>}
 {invalid&&<p role="alert" className="py-3 text-amber-700 dark:text-amber-300">La fecha inicial no puede superar la final.</p>}
 {resource.loading?<Loading/>:resource.error?<TreasuryError error={resource.error} retry={reload}/>:resource.data&&!invalid&&<>
 {!resource.data.page.total?<WorkspaceEmpty icon={<FileText size={24}/>} title={filtered?'No hay coincidencias':resource.data.all.length&&!resource.data.all.some(o=>o.balanceMinor>0&&!o.cancelled)?'No tienes facturas pendientes de pago':resource.data.all.length?'No hay obligaciones disponibles':'Aún no hay facturas registradas'} action={<Link className="text-sm font-semibold text-blue-600 dark:text-blue-400" to="/facturas-proveedores">Ir a Facturas de proveedores →</Link>}>
 {filtered?'Prueba otros filtros para encontrar tus facturas.':'Registra las facturas de tus proveedores para consultar sus vencimientos y gestionar los pagos desde esta bandeja.'}
 </WorkspaceEmpty>:<div className="grid min-w-0 gap-6 py-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
 <div className="min-w-0"><div className="mb-2 flex justify-between text-xs uppercase tracking-wide text-slate-500"><span>Facturas · página {query.page}</span><span>Saldo pendiente</span></div>
 <ul className="divide-y divide-slate-200 dark:divide-slate-800">{resource.data.page.items.map(o=><li key={o.id}>
 <button aria-pressed={selected?.id===o.id} onClick={()=>setSelectedId(o.id)} className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-l-2 px-3 py-4 text-left focus-visible:outline-2 focus-visible:outline-blue-500 ${selected?.id===o.id?'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20':'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}>
 <span className="min-w-0"><span className="block break-words font-semibold">{o.partyName}</span><span className="mt-1 block break-words text-sm text-slate-500 dark:text-slate-400">{o.document} · {o.paymentStatus}</span><span className={`mt-2 flex items-center gap-1 text-xs ${o.overdue?'font-medium text-red-700 dark:text-red-300':'text-slate-500 dark:text-slate-400'}`}><CalendarClock size={13} aria-hidden="true"/>{o.dueAt||'Sin vencimiento'}{o.overdue?' · Vencida':''}</span></span>
 <span className="self-center text-right"><span className="block text-sm font-bold tabular-nums sm:text-base">{money(o.balanceMinor,o.currency)}</span><ArrowRight size={16} aria-hidden="true" className="ml-auto mt-2 text-slate-400"/></span>
 </button></li>)}</ul>
 <Pagination query={query} total={resource.data.page.total} onChange={patch}/></div>
 {selected&&<aside aria-label="Factura seleccionada" className="min-w-0 self-start rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-5 dark:border-slate-800 dark:bg-slate-900">
 <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Detalle de factura</span><h2 className="mt-3 break-words text-xl font-bold">{selected.partyName}</h2><p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{selected.document}</p>
 <div className="my-5 border-y border-slate-200 py-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Saldo pendiente · {selected.currency}</p><p className="mt-1 break-words text-2xl font-bold tabular-nums">{money(selected.balanceMinor,selected.currency)}</p></div>
 <dl className="space-y-3 text-sm">{[['Importe',money(selected.originalMinor,selected.currency)],['Pagado',money(selected.paidMinor,selected.currency)],['Emisión',selected.issuedAt||'Sin fecha'],['Vencimiento',selected.dueAt||'Sin fecha'],['Estado',selected.paymentStatus]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className={`font-medium tabular-nums ${label==='Vencimiento'&&selected.overdue?'text-red-700 dark:text-red-300':''}`}>{value}</dd></div>)}</dl>
 {selected.overdue&&<p className="mt-3 text-xs font-medium text-red-700 dark:text-red-300">Vencida con saldo pendiente</p>}
 <div className="mt-5 flex flex-wrap gap-2"><button className={primary} disabled={!!reason} onClick={()=>setPay(selected)}>Registrar pago</button><button className={button} onClick={()=>setDetail(selected)}>Ver detalle</button></div>{reason&&<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{reason}</p>}
 </aside>}
 </div>}
 </>}
 <details className="mt-5 text-xs text-slate-500 dark:text-slate-400"><summary className="cursor-pointer">Ayuda sobre las obligaciones</summary><p className="mt-2">Las referencias pendientes de completar no crean deuda. Cada factura parcial registrada tiene su propia obligación; contado no significa pagado.</p></details>
{pay&&resource.data&&<OperationForm kind="PAGO" obligations={resource.data.all} accounts={resource.data.state.accounts} preset={pay} onClose={()=>setPay(null)} onDone={op=>{setPay(null);setOperationId(op.id);reload();}}/>}{detail&&<FinancialDetail obligation={detail} onClose={()=>setDetail(null)} onChange={reload}/>} {operationId&&<FinancialDetail operationId={operationId} onClose={()=>setOperationId('')} onChange={reload}/>}</section>;
}
