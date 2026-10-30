import { useEffect, useState } from 'react';
export const errorMessage=(error:unknown)=>error instanceof Error?error.message:'No se pudo completar la operación. Intenta nuevamente.';
export function useTreasuryLoad<T>(loader:()=>Promise<T>, revision=0) {
  const [settled,setSettled]=useState<{loader:(()=>Promise<T>)|null;data:T|null;error:string;revision:number}>({loader:null,data:null,error:'',revision:-1});
  useEffect(()=>{let active=true;loader().then(data=>{if(active)setSettled({loader,data,error:'',revision});}).catch(e=>{if(active)setSettled({loader,data:null,error:errorMessage(e),revision});});return()=>{active=false;};},[loader,revision]);
  const loading=settled.loader!==loader||settled.revision!==revision;
  return {loading,data:loading?null:settled.data,error:loading?'':settled.error};
}
