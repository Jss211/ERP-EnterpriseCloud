import type { DeliveryView, Dispatch, History, LogisticsQuery, LogisticsState, RoutePlan, SaleReference } from './types';
export function ensure(condition:unknown,message:string):asserts condition { if(!condition)throw new Error(message); }
export const calendarDay=(timestamp:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
export const today=()=>calendarDay(new Date().toISOString());
export const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const emptyState=():LogisticsState=>({version:1,dispatches:[],deliveries:[],routes:[],commands:[]});
export const units=(value:string|number):number=>{
  const text=String(value).trim().replace(',','.');
  ensure(/^\d+(\.\d{1,6})?$/.test(text),'Ingresa una cantidad válida con hasta seis decimales.');
  const [whole,fraction='']=text.split('.');const result=Number(whole)*1000000+Number(fraction.padEnd(6,'0'));
  ensure(Number.isSafeInteger(result),'La cantidad excede la precisión admitida.');return result;
};
export const quantity=(value:number)=>(value/1000000).toLocaleString('es-PE',{maximumFractionDigits:6});
export const quantityInput=(value:number)=>String(value/1000000);
export function add(a:number,b:number){const sum=a+b;ensure(Number.isSafeInteger(sum),'La cantidad excede la precisión admitida.');return sum;}
export const matches=(value:string,search='')=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').includes(search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es'));
export function paginate<T>(rows:T[],q:LogisticsQuery){const size=Math.max(1,Math.min(100,Math.trunc(q.pageSize)||10));const page=Math.max(1,Math.trunc(q.page)||1);return {items:rows.slice((page-1)*size,page*size),total:rows.length};}
const inDate=(date:string,q:LogisticsQuery)=>(!q.from||date>=q.from)&&(!q.to||date<=q.to);
export const saleSignature=(sale:SaleReference)=>JSON.stringify([sale.key,sale.customer.id||'',sale.lines.map(l=>[l.id,l.productId||'',l.orderedUnits]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
export function reliableSale(sale:SaleReference){return !sale.limitation&&['ventas','orden-local'].includes(sale.origin)&&!!sale.id&&sale.key===`${sale.origin}:${sale.id}`&&typeof sale.customer?.name==='string'&&!!sale.customer.name.trim()&&Array.isArray(sale.lines)&&sale.lines.length>0&&sale.lines.every(l=>!!l.id&&typeof l.description==='string'&&Number.isSafeInteger(l.orderedUnits)&&l.orderedUnits>0)&&new Set(sale.lines.map(l=>l.id)).size===sale.lines.length;}
export function pendingForSale(state:LogisticsState,sale:SaleReference,excludingId='') {
  ensure(reliableSale(sale),sale.limitation||'Esta venta no tiene referencias de línea y cantidades fiables. No se puede controlar lo pendiente.');
  // A legacy order later linked explicitly to ventas cannot receive a second
  // allowance under its new source ID. Different line IDs require review, not matching by name.
  const sameSource=(other:SaleReference)=>other.key===sale.key||(sale.origin==='ventas'&&other.origin==='orden-local'&&sale.orderReferences?.includes(other.id))||(sale.origin==='orden-local'&&other.origin==='ventas'&&other.orderReferences?.includes(sale.id));
  const active=state.dispatches.filter(d=>d.id!==excludingId&&sameSource(d.source)&&d.status!=='CANCELADO');
  ensure(active.every(d=>saleSignature(d.source)===saleSignature(sale)),'Las líneas o cantidades de la venta cambiaron. Revisa sus despachos antes de programar más cantidades.');
  return sale.lines.map(line=>{
    const reserved=active.reduce((sum,d)=>d.lines.filter(l=>l.saleLineId===line.id).reduce((n,l)=>add(n,l.quantityUnits),sum),0);
    ensure(reserved<=line.orderedUnits,'Los despachos existentes exceden las cantidades actuales de la venta.');
    return {line,reservedUnits:reserved,pendingUnits:line.orderedUnits-reserved};
  });
}
export function deliveredForLine(state:LogisticsState,dispatchId:string,lineId:string){return state.deliveries.filter(a=>a.dispatchId===dispatchId).reduce((sum,a)=>a.lines.filter(l=>l.dispatchLineId===lineId).reduce((n,l)=>add(n,l.quantityUnits),sum),0);}
export function deliveryView(state:LogisticsState,dispatch:Dispatch):DeliveryView {
  const complete=dispatch.lines.every(l=>deliveredForLine(state,dispatch.id,l.id)===l.quantityUnits);
  const partial=dispatch.lines.some(l=>deliveredForLine(state,dispatch.id,l.id)>0);
  return {dispatch,status:complete?'ENTREGADO':partial?'PARCIAL':'PENDIENTE',attempts:state.deliveries.filter(a=>a.dispatchId===dispatch.id)};
}
export const activeRouteFor=(state:LogisticsState,dispatchId:string,excludingId='')=>state.routes.find(r=>r.id!==excludingId&&!['CANCELADA','FINALIZADA'].includes(r.status)&&r.stops.some(s=>s.dispatchId===dispatchId));
export const listDispatches=(state:LogisticsState,q:LogisticsQuery)=>paginate(state.dispatches.filter(d=>matches(`${d.code} ${d.source.number} ${d.source.customer.name} ${d.address}`,q.search)&&(!q.status||d.status===q.status)&&inDate(d.scheduledDate,q)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),q);
export const listDeliveries=(state:LogisticsState,q:LogisticsQuery)=>paginate(state.dispatches.filter(d=>d.status==='DESPACHADO').map(d=>deliveryView(state,d)).filter(v=>matches(`${v.dispatch.code} ${v.dispatch.source.number} ${v.dispatch.source.customer.name} ${v.dispatch.address}`,q.search)&&(!q.status||v.status===q.status)&&inDate(v.dispatch.scheduledDate,q)).sort((a,b)=>b.dispatch.createdAt.localeCompare(a.dispatch.createdAt)),q);
export const listRoutes=(state:LogisticsState,q:LogisticsQuery)=>paginate(state.routes.filter(r=>matches(`${r.code} ${r.name} ${r.responsible} ${r.stops.map(s=>s.address).join(' ')}`,q.search)&&(!q.status||r.status===q.status)&&inDate(r.date,q)).sort((a,b)=>b.date.localeCompare(a.date)),q);
const nonempty=(v:unknown)=>typeof v==='string'&&!!v.trim();
const text=(v:unknown,max=4000)=>typeof v==='string'&&v.length<=max;
function unique(ids:unknown[]){ensure(ids.every(nonempty)&&new Set(ids).size===ids.length,'Hay identificadores duplicados o no válidos.');}
const dispatchTransitions:Record<string,string[]>={'':['BORRADOR'],BORRADOR:['BORRADOR','PREPARADO','CANCELADO'],PREPARADO:['DESPACHADO','CANCELADO'],DESPACHADO:[],CANCELADO:[]};
const routeTransitions:Record<string,string[]>={'':['PLANIFICADA'],PLANIFICADA:['PLANIFICADA','EN_CURSO','CANCELADA'],EN_CURSO:['FINALIZADA'],FINALIZADA:[],CANCELADA:[]};
function history(rows:History[],status:string,revision:number,transitions:Record<string,string[]>) {
  ensure(Array.isArray(rows)&&rows.length>0&&revision===rows.length-1,'El historial o revisión no es válido.');unique(rows.map(e=>e?.id));
  let previous='';for(const event of rows){ensure(event.from===previous&&transitions[previous]?.includes(event.to)&&text(event.reason)&&Number.isFinite(Date.parse(event.at)),'El historial tiene transiciones incoherentes.');previous=event.to;}
  ensure(previous===status,'El estado no coincide con el historial.');
}
export function validateState(state:LogisticsState) {
  ensure(state?.version===1&&['dispatches','deliveries','routes','commands'].every(k=>Array.isArray(state[k as keyof LogisticsState])),'Formato de Logística no compatible.');
  for(const rows of [state.dispatches,state.deliveries,state.routes,state.commands])unique(rows.map(r=>r?.id));
  unique(state.dispatches.map(d=>d.code));unique(state.routes.map(r=>r.code.toLocaleUpperCase()));
  for(const d of state.dispatches){
    ensure(d.source&&reliableSale(d.source)&&nonempty(d.source.customer?.name)&&text(d.source.customer.document)&&text(d.source.customer.address)&&text(d.source.customer.contact)&&Array.isArray(d.source.documents)&&d.source.documents.every(r=>text(r.number)&&text(r.origin))&&text(d.source.number)&&nonempty(d.address)&&text(d.address,500)&&nonempty(d.contact)&&text(d.contact,200)&&validDate(d.scheduledDate)&&text(d.notes)&&Array.isArray(d.lines)&&d.lines.length>0&&Number.isFinite(Date.parse(d.createdAt)),'Un despacho tiene referencias o datos no válidos.');
    ensure(!d.warehouse||(nonempty(d.warehouse.id)&&nonempty(d.warehouse.name)),'El almacén no tiene una referencia válida.');
    ensure(!d.carrier||(nonempty(d.carrier.id)&&nonempty(d.carrier.name)&&typeof d.carrier.active==='boolean'&&text(d.carrier.document)&&text(d.carrier.phone)&&(!d.carrier.vehicle||(text(d.carrier.vehicle.model)&&text(d.carrier.vehicle.plate)))&&(!d.carrier.driver||(text(d.carrier.driver.name)&&text(d.carrier.driver.license)))),'La referencia de transporte no es válida.');
    unique(d.lines.map(l=>l.id));unique(d.lines.map(l=>l.saleLineId));
    for(const l of d.lines)ensure(l.id===`${d.id}:line:${l.saleLineId}`&&d.source.lines.some(s=>s.id===l.saleLineId&&l.quantityUnits<=s.orderedUnits)&&Number.isSafeInteger(l.quantityUnits)&&l.quantityUnits>0&&text(l.description),'Una línea de despacho no es válida.');
    history(d.history,d.status,d.revision,dispatchTransitions);
    if(['PREPARADO','DESPACHADO'].includes(d.status))ensure(d.carrier?.active,'El despacho no tiene transportista asignado.');
    if(d.status!=='CANCELADO')pendingForSale(state,d.source);
  }
  for(const a of state.deliveries){
    const d=state.dispatches.find(d=>d.id===a.dispatchId);
    ensure(d?.status==='DESPACHADO'&&validDate(a.date)&&a.date>=calendarDay(d.history.find(e=>e.to==='DESPACHADO')!.at)&&text(a.receiver,200)&&text(a.incidents)&&Array.isArray(a.lines)&&Number.isFinite(Date.parse(a.createdAt)),'El intento no corresponde a un despacho enviado o tiene fecha no válida.');
    unique(a.lines.map(l=>l.dispatchLineId));
    for(const l of a.lines)ensure(d.lines.some(s=>s.id===l.dispatchLineId)&&Number.isSafeInteger(l.quantityUnits)&&l.quantityUnits>=0,'Las cantidades entregadas no son válidas.');
    const positive=a.lines.some(l=>l.quantityUnits>0);
    ensure(a.outcome==='ENTREGA'?positive&&nonempty(a.receiver):['FALLIDA','RECHAZADA'].includes(a.outcome)&&!positive&&nonempty(a.incidents),'El resultado del intento no coincide con sus cantidades o incidencias.');
  }
  for(const d of state.dispatches)for(const l of d.lines)ensure(deliveredForLine(state,d.id,l.id)<=l.quantityUnits,'Las entregas exceden lo enviado.');
  for(const r of state.routes){
    ensure(nonempty(r.code)&&text(r.code,40)&&nonempty(r.name)&&text(r.name,150)&&validDate(r.date)&&nonempty(r.responsible)&&text(r.responsible,200)&&Array.isArray(r.stops)&&r.stops.length>0&&Number.isFinite(Date.parse(r.createdAt)),'Los datos de la ruta no son válidos.');
    unique(r.stops.map(s=>s.id));unique(r.stops.map(s=>s.dispatchId));history(r.history,r.status,r.revision,routeTransitions);
    for(const stop of r.stops){const d=state.dispatches.find(d=>d.id===stop.dispatchId);ensure(d&&stop.id===`${r.id}:stop:${d.id}`&&nonempty(stop.address)&&text(stop.customerName),'La parada no tiene despacho o destino válido.');
      if(!['CANCELADA','FINALIZADA'].includes(r.status)){ensure(d.status!=='CANCELADO'&&!activeRouteFor(state,d.id,r.id),'Un despacho pertenece a varias rutas activas o está cancelado.');ensure(stop.address===d.address&&stop.customerName===d.source.customer.name,'El destino planificado no coincide con el despacho.');}
      if(['EN_CURSO','FINALIZADA'].includes(r.status))ensure(d.status==='DESPACHADO','La ruta tiene despachos que no han salido.');
      if(r.status==='FINALIZADA')ensure(deliveryView(state,d).status==='ENTREGADO','La ruta tiene entregas pendientes.');
    }
  }
  for(const c of state.commands)ensure(text(c.fingerprint,1000000)&&Number.isFinite(Date.parse(c.at))&&({dispatch:state.dispatches,delivery:state.deliveries,route:state.routes}[c.kind]?.some(row=>row.id===c.entityId)),'El registro de idempotencia no es válido.');
  for(const d of state.dispatches)for(const event of d.history)ensure(state.commands.some(c=>c.id===event.id&&c.kind==='dispatch'&&c.entityId===d.id),'Falta el registro de idempotencia del despacho.');
  for(const r of state.routes)for(const event of r.history)ensure(state.commands.some(c=>c.id===event.id&&c.kind==='route'&&c.entityId===r.id),'Falta el registro de idempotencia de la ruta.');
  for(const a of state.deliveries)ensure(state.commands.some(c=>c.kind==='delivery'&&c.entityId===a.id),'Falta el registro de idempotencia del intento.');
}
export function routeCanStart(state:LogisticsState,route:RoutePlan){return route.stops.every(s=>state.dispatches.find(d=>d.id===s.dispatchId)?.status==='DESPACHADO');}
