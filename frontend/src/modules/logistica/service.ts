import type { Command, DeliveryAttempt, DeliveryInput, Dispatch, DispatchInput, DispatchStatus, LogisticsRepository, LogisticsSources, LogisticsState, RouteInput, RoutePlan, RouteStatus } from './types';
import { activeRouteFor, deliveredForLine, deliveryView, ensure, pendingForSale, reliableSale, routeCanStart, saleSignature, validDate } from './domain';

const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const fingerprint=(value:unknown)=>JSON.stringify(canonical(value));
const reasonText=(value:string)=>{ensure(typeof value==='string'&&value.trim().length<=4000,'Revisa las observaciones.');return value.trim();};
export function createLogisticsService(repository:LogisticsRepository,sources:LogisticsSources,clock=()=>new Date().toISOString()) {
  async function execute<T extends {id:string}>(id:string,kind:Command['kind'],payload:unknown,work:(state:LogisticsState)=>Promise<T>|T):Promise<T> {
    ensure(typeof id==='string'&&!!id.trim(),'Falta el identificador de la operación.');const signature=fingerprint(payload);
    return repository.transact(async state=>{
      const previous=state.commands.find(c=>c.id===id);
      if(previous){ensure(previous.kind===kind&&previous.fingerprint===signature,'Este identificador ya se utilizó con otros datos. Actualiza antes de iniciar otra operación.');const rows=kind==='dispatch'?state.dispatches:kind==='delivery'?state.deliveries:state.routes;return rows.find(r=>r.id===previous.entityId)! as unknown as T;}
      const result=await work(state);state.commands.push({id,kind,entityId:result.id,fingerprint:signature,at:clock()});return result;
    });
  }
  async function currentSale(state:LogisticsState,dispatch:Dispatch){const live=await sources.sale(dispatch.source.key);ensure(live&&reliableSale(live),'La venta ya no está disponible o no tiene líneas fiables. No se modificó el despacho.');ensure(saleSignature(live)===saleSignature(dispatch.source),'Las líneas o cantidades de la venta cambiaron. Revisa el despacho antes de continuar.');pendingForSale(state,live);}
  const assertFree=(state:LogisticsState,id:string)=>{const route=activeRouteFor(state,id);ensure(!route,`Retira primero el despacho de la ruta ${route?.code||''} para modificarlo o cancelarlo.`);};
  return {
    state:repository.read,dispatches:repository.dispatches,deliveries:repository.deliveries,routes:repository.routes,
    async availability(saleKey:string,excludingId=''){const [state,sale]=await Promise.all([repository.read(),sources.sale(saleKey)]);ensure(sale,'La venta no está disponible.');return pendingForSale(state,sale,excludingId);},
    async saveDispatch(input:DispatchInput,commandId:string) {
      return execute<Dispatch>(commandId,'dispatch',{action:'save',input},async state=>{
        const old=state.dispatches.find(d=>d.id===input.id);
        ensure(!old||(old.status==='BORRADOR'&&old.revision===input.expectedRevision),'Solo se puede editar un borrador con su revisión actual.');
        if(old){assertFree(state,old.id);ensure(old.source.key===input.saleKey,'No se puede cambiar la venta de un despacho existente.');}
        const sale=await sources.sale(input.saleKey);ensure(sale,'La venta no está disponible.');
        const pending=pendingForSale(state,sale,old?.id);ensure(input.lines.length>0&&new Set(input.lines.map(l=>l.saleLineId)).size===input.lines.length,'Selecciona líneas distintas de la venta.');
        const lines=input.lines.map(line=>{const available=pending.find(p=>p.line.id===line.saleLineId);ensure(available&&Number.isSafeInteger(line.quantityUnits)&&line.quantityUnits>0&&line.quantityUnits<=available.pendingUnits,`La cantidad supera lo pendiente o no es válida para la línea ${line.saleLineId}.`);return {id:`${input.id}:line:${line.saleLineId}`,saleLineId:line.saleLineId,description:available.line.description,productId:available.line.productId,quantityUnits:line.quantityUnits};});
        const carrier=input.carrierId?await sources.carrier(input.carrierId):undefined;
        ensure(!input.carrierId||carrier?.active,'Selecciona un transportista activo del maestro existente.');
        const warehouse=input.warehouseId?(await sources.warehouses()).find(w=>w.id===input.warehouseId):undefined;
        ensure(!input.warehouseId||warehouse,'El almacén seleccionado ya no está disponible.');
        ensure(input.address.trim()&&input.contact.trim()&&validDate(input.scheduledDate),'Completa dirección, contacto y fecha programada.');
        const at=clock();const next:Dispatch={id:input.id,code:old?.code||`DSP-${String(state.dispatches.length+1).padStart(5,'0')}`,source:structuredClone(sale),lines,carrier:carrier?structuredClone(carrier):undefined,warehouse:warehouse?structuredClone(warehouse):undefined,address:input.address.trim(),contact:input.contact.trim(),scheduledDate:input.scheduledDate,notes:reasonText(input.notes),createdAt:old?.createdAt||at,status:'BORRADOR',revision:old?old.revision+1:0,history:[...(old?.history||[]),{id:commandId,at,from:old?.status||'',to:'BORRADOR',reason:old?'Datos del borrador actualizados':'Despacho registrado'}]};
        if(old)state.dispatches=state.dispatches.map(d=>d.id===next.id?next:d);else state.dispatches.push(next);return next;
      });
    },
    async changeDispatch(id:string,to:DispatchStatus,expectedRevision:number,reason:string,commandId:string) {
      return execute<Dispatch>(commandId,'dispatch',{action:'status',id,to,expectedRevision,reason},async state=>{
        const d=state.dispatches.find(d=>d.id===id);ensure(d&&d.revision===expectedRevision,'El despacho cambió. Vuelve a abrir su detalle.');
        ensure((d.status==='BORRADOR'&&['PREPARADO','CANCELADO'].includes(to))||(d.status==='PREPARADO'&&['DESPACHADO','CANCELADO'].includes(to)),'La transición de despacho no está permitida.');
        const note=reasonText(reason);
        if(to==='CANCELADO'){ensure(note,'Indica el motivo de cancelación.');assertFree(state,d.id);}
        else {await currentSale(state,d);ensure(d.carrier,'Asigna un transportista activo editando el borrador.');const current=await sources.carrier(d.carrier.id);ensure(current?.active&&fingerprint(current)===fingerprint(d.carrier),'El transportista o sus datos cambiaron. Revisa la asignación antes de continuar.');}
        d.history.push({id:commandId,at:clock(),from:d.status,to,reason:note||'Cambio de estado confirmado'});d.status=to;d.revision++;return d;
      });
    },
    async registerDelivery(input:DeliveryInput,commandId:string) {
      return execute<DeliveryAttempt>(commandId,'delivery',{action:'attempt',input},state=>{
        const d=state.dispatches.find(d=>d.id===input.dispatchId);ensure(d?.status==='DESPACHADO','Solo se registran entregas de un despacho enviado.');
        ensure(!state.deliveries.some(a=>a.id===input.id),'El intento ya existe con otro identificador de operación.');
        ensure(deliveryView(state,d).status!=='ENTREGADO','El despacho ya está completamente entregado.');
        ensure(validDate(input.date),'La fecha de entrega no es válida.');
        ensure(new Set(input.lines.map(l=>l.dispatchLineId)).size===input.lines.length,'No repitas líneas en el mismo intento.');
        for(const l of input.lines){const line=d.lines.find(s=>s.id===l.dispatchLineId);ensure(line&&Number.isSafeInteger(l.quantityUnits)&&l.quantityUnits>=0&&l.quantityUnits<=line.quantityUnits-deliveredForLine(state,d.id,line.id),'La entrega supera lo enviado pendiente o contiene una línea no válida.');}
        const positive=input.lines.some(l=>l.quantityUnits>0);
        ensure(input.outcome==='ENTREGA'?positive&&!!input.receiver.trim():['FALLIDA','RECHAZADA'].includes(input.outcome)&&!positive&&!!input.incidents.trim(),'Una entrega requiere receptor y cantidades positivas; un intento fallido o rechazado requiere incidencias y cantidades cero.');
        const next:DeliveryAttempt={...structuredClone(input),receiver:input.receiver.trim(),incidents:reasonText(input.incidents),createdAt:clock()};state.deliveries.push(next);return next;
      });
    },
    async saveRoute(input:RouteInput,commandId:string) {
      return execute<RoutePlan>(commandId,'route',{action:'save',input},state=>{
        const old=state.routes.find(r=>r.id===input.id);ensure(!old||(old.status==='PLANIFICADA'&&old.revision===input.expectedRevision),'Solo se edita una ruta planificada con su revisión actual.');
        ensure(input.dispatchIds.length>0&&new Set(input.dispatchIds).size===input.dispatchIds.length,'Asigna al menos un despacho, sin repetir paradas.');
        const stops=input.dispatchIds.map(dispatchId=>{const d=state.dispatches.find(d=>d.id===dispatchId);ensure(d&&d.status!=='CANCELADO'&&deliveryView(state,d).status!=='ENTREGADO','El despacho no está disponible para esta planificación.');const occupied=activeRouteFor(state,d.id,old?.id);ensure(!occupied,`El despacho ${d.code} ya está asignado a la ruta ${occupied?.code||''}.`);return {id:`${input.id}:stop:${d.id}`,dispatchId:d.id,address:d.address,customerName:d.source.customer.name};});
        const code=input.code.trim();ensure(!state.routes.some(r=>r.id!==input.id&&r.code.toLocaleUpperCase()===code.toLocaleUpperCase()),'El código de ruta ya existe.');
        const at=clock();const next:RoutePlan={id:input.id,code,name:input.name.trim(),date:input.date,responsible:input.responsible.trim(),stops,status:'PLANIFICADA',revision:old?old.revision+1:0,createdAt:old?.createdAt||at,history:[...(old?.history||[]),{id:commandId,at,from:old?.status||'',to:'PLANIFICADA',reason:old?'Planificación y orden de paradas actualizados':'Ruta planificada manualmente'}]};
        if(old)state.routes=state.routes.map(r=>r.id===next.id?next:r);else state.routes.push(next);return next;
      });
    },
    async changeRoute(id:string,to:RouteStatus,expectedRevision:number,reason:string,commandId:string) {
      return execute<RoutePlan>(commandId,'route',{action:'status',id,to,expectedRevision,reason},state=>{
        const r=state.routes.find(r=>r.id===id);ensure(r&&r.revision===expectedRevision,'La ruta cambió. Vuelve a abrir su detalle.');const note=reasonText(reason);
        ensure((r.status==='PLANIFICADA'&&['EN_CURSO','CANCELADA'].includes(to))||(r.status==='EN_CURSO'&&to==='FINALIZADA'),'La transición de ruta no está permitida.');
        if(to==='EN_CURSO')ensure(routeCanStart(state,r),'Todos los despachos de la ruta deben estar enviados antes de iniciar el seguimiento.');
        if(to==='FINALIZADA')ensure(r.stops.every(s=>deliveryView(state,state.dispatches.find(d=>d.id===s.dispatchId)!).status==='ENTREGADO'),'Completa las cantidades de todas las entregas antes de finalizar la ruta.');
        if(to==='CANCELADA')ensure(note,'Indica el motivo de cancelación de la planificación.');
        r.history.push({id:commandId,at:clock(),from:r.status,to,reason:note||'Cambio de seguimiento confirmado'});r.status=to;r.revision++;return r;
      });
    },
    async summary(){const state=await repository.read();return {dispatches:state.dispatches.length,prepared:state.dispatches.filter(d=>d.status==='PREPARADO').length,pendingDeliveries:state.dispatches.filter(d=>d.status==='DESPACHADO'&&deliveryView(state,d).status!=='ENTREGADO').length,activeRoutes:state.routes.filter(r=>['PLANIFICADA','EN_CURSO'].includes(r.status)).length};},
  };
}
