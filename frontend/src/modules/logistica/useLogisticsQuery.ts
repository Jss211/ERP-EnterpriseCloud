import { useState } from 'react';
import type { LogisticsQuery } from './types';
export function useLogisticsQuery(){
  const [query,setQuery]=useState<LogisticsQuery>({page:1,pageSize:10,search:'',status:'',from:'',to:''});
  const patch=(p:Partial<LogisticsQuery>)=>setQuery(q=>({...q,...p,page:p.page??1}));
  const reset=()=>setQuery(q=>({page:1,pageSize:q.pageSize,search:'',status:'',from:'',to:''}));
  return {query,patch,reset,filtered:!!(query.search||query.status||query.from||query.to),invalid:!!(query.from&&query.to&&query.from>query.to)};
}
