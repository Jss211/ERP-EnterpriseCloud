import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');const dir=resolve(root,'node_modules/.tmp/logistics-source-compatibility');await mkdir(dir,{recursive:true});
for(const name of ['ventasService','clientesService','inventarioService','legacyCatalogRepository']) {
  const source=await readFile(resolve(root,name==='legacyCatalogRepository'?`src/repositories/${name}.ts`:`src/services/${name}.ts`),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'@/lib/supabase'","'./fixture.mjs'").replaceAll("'./migoService'","'./fixture.mjs'");
  await writeFile(resolve(dir,name+'.mjs'),output);
}
await writeFile(resolve(dir,'fixture.mjs'),`export const migoService={};export const supabase={from(table){let range;const query={select(){return this;},order(){return this;},range(from,to){range=[from,to];globalThis.rangeCalls++;return this;},then(resolve,reject){const all=globalThis.tables[table]||[];return Promise.resolve({data:range?all.slice(range[0],range[1]+1):all,error:globalThis.failedTable===table?{message:'simulated read error'}:null}).then(resolve,reject);}};return query;}};`);
const load=name=>import(pathToFileURL(resolve(dir,name+'.mjs')));
const {ventasService}=await load('ventasService');const {clientesService}=await load('clientesService');const {inventarioService}=await load('inventarioService');const {legacyCatalogRepository,LEGACY_MASTERS_KEY}=await load('legacyCatalogRepository');
globalThis.rangeCalls=0;globalThis.failedTable='';globalThis.tables={ventas:Array.from({length:2301},(_,n)=>({id:'sale-'+n,numero:'OV-'+n,estado:'Pendiente',cliente_nombre:'Cliente de referencia',items:[{id:'line-'+n,descripcion:'Producto',cantidad:1}]}))};
const complete=await ventasService.getVentas(true,false,true);assert.equal(complete.length,2301);assert.equal(rangeCalls,3);assert.equal(complete[0].items[0].id,'line-0');assert.equal(complete[0].fecha,'','complete logistics reader does not invent an emission date');
const originalConsole=console.error;console.error=()=>{};
try {
  await assert.rejects(ventasService.getVentas(true,true),/No se pudieron cargar las ventas/,'financial validation remains strict');
  failedTable='clientes';assert.deepEqual(await clientesService.getClientes(),[]);await assert.rejects(clientesService.getClientes(true),/No se pudieron cargar los clientes/);
  failedTable='almacenes';assert.deepEqual(await inventarioService.getCatalogosBase(),{lineas:[],marcas:[],almacenes:[],unidades:[]});await assert.rejects(inventarioService.getCatalogosBase(true),/No se pudieron cargar los catálogos/);
} finally {console.error=originalConsole;failedTable='';}
let raw=null,writes=0;globalThis.localStorage={getItem:key=>{assert.equal(key,LEGACY_MASTERS_KEY);return raw;},setItem:()=>{writes++;throw Error('source writes forbidden');}};
assert.deepEqual(await legacyCatalogRepository.listStrict(),[]);assert.equal(raw,null);assert.equal(writes,0);
raw=JSON.stringify({transportistas:[null,{id:'actual',razonSocial:'Dato anterior'}]});const before=raw;
assert.equal((await legacyCatalogRepository.list())[0].records.length,1,'default historical viewer keeps its previous filtering behavior');
await assert.rejects(legacyCatalogRepository.listStrict(),/dañados/);assert.equal(raw,before);assert.equal(writes,0);
raw='{broken';await assert.rejects(legacyCatalogRepository.listStrict());assert.equal(raw,'{broken');
console.log('PASS logistics source compatibility: complete stable-ID sales read without financial prerequisites, strict/legacy customer and warehouse reads, read-only legacy catalogs and damaged records preserved.');
