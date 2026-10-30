import type { LogisticsRepository, LogisticsState } from './types';
import { emptyState, listDeliveries, listDispatches, listRoutes, validateState } from './domain';
export const LOGISTICS_KEY='erp_logistics_v1';
export interface StoragePort { getItem(key:string):string|null; setItem(key:string,value:string):void }
export function createLogisticsRepository(storage:()=>StoragePort):LogisticsRepository {
  let queue=Promise.resolve();
  async function snapshot(){try{const raw=storage().getItem(LOGISTICS_KEY);const state:LogisticsState=raw===null?emptyState():JSON.parse(raw);validateState(state);return {raw,state};}catch{throw new Error('No se puede leer Logística: almacenamiento no disponible o datos dañados. Se conservan intactos.');}}
  const read=async()=> (await snapshot()).state;
  return {read,
    async transact(work){
      const commit=async()=>{const {raw,state}=await snapshot();const before=JSON.stringify(state);const result=await work(state);validateState(state);const after=JSON.stringify(state);
        if(before!==after){let current:string|null;try{current=storage().getItem(LOGISTICS_KEY);}catch{throw new Error('No se pudo comprobar el almacenamiento antes de guardar. Conserva el formulario y reintenta.');}
          if(current!==raw)throw new Error('Logística cambió en otra ventana. No se guardó esta operación. Actualiza y reintenta.');
          try{storage().setItem(LOGISTICS_KEY,after);}catch{throw new Error('No se pudo guardar Logística. Conserva el formulario y reintenta con los mismos datos para evitar duplicados.');}}
        return result;};
      if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(LOGISTICS_KEY,commit);
      const task=queue.then(commit);queue=task.then(()=>undefined,()=>undefined);return task;
    },
    async dispatches(q){return listDispatches(await read(),q);},async deliveries(q){return listDeliveries(await read(),q);},async routes(q){return listRoutes(await read(),q);},
  };
}
export const logisticsRepository=createLogisticsRepository(()=>window.localStorage);
