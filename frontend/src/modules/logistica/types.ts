export interface Page<T> { items:T[]; total:number }
export interface LogisticsQuery { page:number; pageSize:number; search?:string; status?:string; from?:string; to?:string }
export interface SaleLine { id:string; description:string; productId?:string; orderedUnits:number }
export interface SaleReference {
  key:string; id:string; origin:'ventas'|'orden-local'; number:string; date:string;
  customer:{id?:string; name:string; document:string; address:string; contact:string};
  lines:SaleLine[]; documents:{number:string; origin:string}[]; limitation?:string;
  orderReferences?:string[];
}
export interface Carrier {
  id:string; document:string; name:string; phone:string; active:boolean;
  vehicle?:{model:string; plate:string}; driver?:{name:string; license:string};
}
export interface Warehouse { id:string; name:string }
export type DispatchStatus='BORRADOR'|'PREPARADO'|'DESPACHADO'|'CANCELADO';
export type RouteStatus='PLANIFICADA'|'EN_CURSO'|'FINALIZADA'|'CANCELADA';
export interface History { id:string; at:string; from:string; to:string; reason:string }
export interface DispatchLine { id:string; saleLineId:string; description:string; productId?:string; quantityUnits:number }
export interface Dispatch {
  id:string; code:string; source:SaleReference; lines:DispatchLine[];
  warehouse?:Warehouse; address:string; contact:string; scheduledDate:string; notes:string; carrier?:Carrier;
  status:DispatchStatus; revision:number; createdAt:string; history:History[];
}
export interface DispatchInput {
  id:string; expectedRevision?:number; saleKey:string; lines:{saleLineId:string; quantityUnits:number}[];
  warehouseId:string; carrierId:string; address:string; contact:string; scheduledDate:string; notes:string;
}
export interface DeliveryAttempt {
  id:string; dispatchId:string; date:string; receiver:string; outcome:'ENTREGA'|'FALLIDA'|'RECHAZADA';
  lines:{dispatchLineId:string; quantityUnits:number}[]; incidents:string; createdAt:string;
}
export type DeliveryInput=Omit<DeliveryAttempt,'createdAt'>;
export interface DeliveryView { dispatch:Dispatch; status:'PENDIENTE'|'PARCIAL'|'ENTREGADO'; attempts:DeliveryAttempt[] }
export interface RouteStop { id:string; dispatchId:string; customerName:string; address:string }
export interface RoutePlan {
  id:string; code:string; name:string; date:string; responsible:string; stops:RouteStop[];
  status:RouteStatus; revision:number; createdAt:string; history:History[];
}
export interface RouteInput { id:string; expectedRevision?:number; code:string; name:string; date:string; responsible:string; dispatchIds:string[] }
export interface Command { id:string; fingerprint:string; kind:'dispatch'|'delivery'|'route'; entityId:string; at:string }
export interface LogisticsState { version:1; dispatches:Dispatch[]; deliveries:DeliveryAttempt[]; routes:RoutePlan[]; commands:Command[] }
export interface LogisticsRepository {
  read():Promise<LogisticsState>;
  transact<T>(work:(state:LogisticsState)=>Promise<T>|T):Promise<T>;
  dispatches(query:LogisticsQuery):Promise<Page<Dispatch>>;
  deliveries(query:LogisticsQuery):Promise<Page<DeliveryView>>;
  routes(query:LogisticsQuery):Promise<Page<RoutePlan>>;
}
export interface LogisticsSources {
  sales(query:LogisticsQuery):Promise<Page<SaleReference>>;
  sale(key:string):Promise<SaleReference|undefined>;
  carriers(query:LogisticsQuery):Promise<Page<Carrier>>;
  carrier(id:string):Promise<Carrier|undefined>;
  warehouses():Promise<Warehouse[]>;
}
