import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { LogisticsQuery, Page } from './types';
import { Empty, ErrorNotice, Loading, Pagination } from './LogisticsUI';
import { button, control, useLoad } from './uiSupport';
export function RecordPicker<T>({label,load,selected,keyOf,render,onSelect}:{label:string;load:(q:LogisticsQuery)=>Promise<Page<T>>;selected:string;keyOf:(row:T)=>string;render:(row:T)=>ReactNode;onSelect:(row:T)=>void}) {
  const [query,setQuery]=useState<LogisticsQuery>({page:1,pageSize:10,search:''});const [revision,setRevision]=useState(0);
  const resource=useLoad(useCallback(()=>load(query),[load,query]),revision);
  return <div className="min-w-0 space-y-3"><label className="block text-sm">{label}<input className={control} value={query.search} onChange={e=>setQuery(q=>({...q,search:e.target.value,page:1}))}/></label>
    {resource.loading?<Loading/>:resource.error?<ErrorNotice error={resource.error} retry={()=>setRevision(n=>n+1)}/>:resource.data&&<>{resource.data.items.length?<ul className="max-h-72 space-y-2 overflow-y-auto">{resource.data.items.map(row=><li key={keyOf(row)}><button type="button" aria-pressed={selected===keyOf(row)} className={`${button} w-full break-words text-left ${selected===keyOf(row)?'border-blue-500 bg-blue-50 dark:bg-blue-950':''}`} onClick={()=>onSelect(row)}>{render(row)}</button></li>)}</ul>:<Empty filtered={!!query.search}>No hay registros disponibles en esta fuente.</Empty>}{resource.data.total>0&&<Pagination query={query} total={resource.data.total} onChange={patch=>setQuery(q=>({...q,...patch}))}/>}</>}</div>;
}
