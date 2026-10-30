import { ventasService } from '../../services/ventasService';
import { clientesService } from '../../services/clientesService';
import { inventarioService } from '../../services/inventarioService';
import { legacyCatalogRepository } from '../../repositories/legacyCatalogRepository';
import { mapSaleSources } from '../ventas/devoluciones/sourceMapping';
import { ensure, matches, paginate, reliableSale, units } from './domain';
import type { Carrier, LogisticsQuery, LogisticsSources, SaleReference } from './types';

function legacyDocuments(key:string):unknown[]{
  try{const raw=localStorage.getItem(key);if(raw===null)return [];const value:unknown=JSON.parse(raw);ensure(Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)),'Formato desconocido');return value;}
  catch{throw new Error(`No se pueden leer los documentos anteriores (${key}). Se conservan intactos.`);}
}
async function sales():Promise<SaleReference[]> {
  // The strict complete read preserves DB line IDs and every page of ventas;
  // logistics does not require financial metadata to inspect an old document.
  const [sales,customers]=await Promise.all([ventasService.getVentas(true,false,true),clientesService.getClientes(true)]);
  const orders=legacyDocuments('erp_ordenes_venta');const receipts=legacyDocuments('erp_estado_cuenta');
  const mapped=mapSaleSources(sales,orders,receipts,customers);
  // An explicit original order reference suppresses its old local mirror even
  // after its ventas document number changed at billing. Never match party/name/amount.
  const linked=new Set(sales.flatMap(s=>[s.numero,...(s.notas.match(/OV-\d+-\d+/g)||[])]));
  const result=mapped.filter(s=>s.origin!=='orden-local'||!linked.has(s.id)).map(s=>{
    const customer=customers.find(c=>c.id===s.customerId);
    const original=s.origin==='ventas'?sales.find(row=>row.id===s.id):undefined;
    const source:SaleReference={key:`${s.origin}:${s.id}`,id:s.id,origin:s.origin,number:s.number,date:s.date,orderReferences:original?[original.numero,...(original.notas.match(/OV-\d+-\d+/g)||[])]:[],customer:{id:s.customerId,name:s.customerName,document:s.customerDocument,address:customer?.direccion||'',contact:customer?.telefono||''},documents:s.receipts.map(r=>({number:r.number,origin:r.origin})),lines:s.lines.map(l=>{
      let orderedUnits=0;try{orderedUnits=units(l.soldQuantity);}catch{/* An unreliable historical quantity is shown, never used for reservations. */}
      return {id:l.originalLineId||'',description:typeof l.description==='string'?l.description:'',productId:l.productId,orderedUnits};
    })};
    if(!reliableSale(source))source.limitation='Esta venta antigua no tiene identificadores de línea únicos o cantidades fiables. Puedes consultarla, pero no programar despachos ni afirmar cantidades pendientes. No se relacionan productos por su nombre.';
    return source;
  });
  ensure(new Set(result.map(s=>s.key)).size===result.length,'Hay referencias de ventas duplicadas. Reintenta.');return result;
}
const text=(value:unknown)=>typeof value==='string'?value:'';
async function carriers():Promise<Carrier[]> {
  // The legacy read-only adapter does not seed the examples in maestrosService.
  let catalogs:Awaited<ReturnType<typeof legacyCatalogRepository.listStrict>>;
  try{catalogs=await legacyCatalogRepository.listStrict();}
  catch{throw new Error('No se puede leer el maestro anterior de transportistas. Los datos se conservan intactos.');}
  const rows=catalogs.find(c=>c.id==='transportistas')?.records||[];
  const result=rows.map(row=>{
    ensure(text(row.id)&&text(row.razonSocial)&&['Activo','Inactivo'].includes(text(row.estado)),'Un transportista anterior no tiene ID, nombre o estado válido. Revisa el maestro; los datos se conservan.');
    const vehicle={model:text(row.vehiculoModelo),plate:text(row.vehiculoPlaca)};
    const driver={name:text(row.conductor),license:text(row.brevete)};
    return {id:text(row.id),document:text(row.ruc),name:text(row.razonSocial),phone:text(row.telefono),active:row.estado==='Activo',vehicle:vehicle.model||vehicle.plate?vehicle:undefined,driver:driver.name||driver.license?driver:undefined};
  });
  ensure(new Set(result.map(c=>c.id)).size===result.length,'El maestro tiene IDs de transportista duplicados. No se pueden asignar de forma segura.');return result;
}
const filterCarriers=(rows:Carrier[],q:LogisticsQuery)=>paginate(rows.filter(c=>matches(`${c.name} ${c.document} ${c.phone} ${c.vehicle?.plate||''} ${c.driver?.name||''}`,q.search)&&(!q.status||(q.status==='ACTIVO')===c.active)),q);
export const logisticsSources:LogisticsSources={
  async sales(q){return paginate((await sales()).filter(s=>matches(`${s.number} ${s.customer.name} ${s.customer.document}`,q.search)),q);},
  async sale(key){return (await sales()).find(s=>s.key===key);},
  async carriers(q){return filterCarriers(await carriers(),q);},async carrier(id){return (await carriers()).find(c=>c.id===id);},
  async warehouses(){const {almacenes}=await inventarioService.getCatalogosBase(true);ensure(new Set(almacenes.map(a=>a.id)).size===almacenes.length&&almacenes.every(a=>a.id&&a.nombre),'Los almacenes no tienen referencias únicas válidas.');return almacenes.map(a=>({id:a.id,name:a.nombre}));},
};
