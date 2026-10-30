import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');const dir=resolve(root,'node_modules/.tmp/treasury-sales-compat');await mkdir(dir,{recursive:true});
const source=await readFile(resolve(root,'src/services/ventasService.ts'),'utf8');
await writeFile(resolve(dir,'ventas.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@/lib/supabase'","'./fixture.mjs'"));
await writeFile(resolve(dir,'fixture.mjs'),`export const supabase={from:()=>({select:()=>({order(){return this;},range(from,to){globalThis.rangeCalls=(globalThis.rangeCalls||0)+1;return Promise.resolve({data:globalThis.salesFixture.slice(from,to+1),error:null});},then(resolve,reject){return Promise.resolve({data:globalThis.salesFixture,error:null}).then(resolve,reject);}})})};`);
const {ventasService}=await import(pathToFileURL(resolve(dir,'ventas.mjs')));
globalThis.salesFixture=[{id:'sale',numero:'OV-1',cliente_nombre:'Cliente',total:100,moneda:'PEN',estado:'Pendiente',items:[]}];
assert.equal((await ventasService.getVentas(true,true))[0].fecha,'','financial reader does not invent emission dates');
assert.ok((await ventasService.getVentas())[0].fecha,'previous callers retain their existing date fallback');
const expectedErrors=[];const originalError=console.error;console.error=(...args)=>expectedErrors.push(args);
for(const patch of [{total:undefined},{total:null},{total:''},{moneda:undefined},{moneda:'EUR'},{estado:undefined}]){salesFixture=[{id:'sale',total:100,moneda:'PEN',estado:'Pendiente',...patch}];await assert.rejects(ventasService.getVentas(true,true));}
console.error=originalError;assert.equal(expectedErrors.length,6);
salesFixture=[{id:'old'}];const old=(await ventasService.getVentas())[0];assert.equal(old.total,0);assert.equal(old.moneda,'PEN');assert.equal(old.estado,'Completada','standard service callers keep their existing defaults');
salesFixture=Array.from({length:1001},(_,i)=>({id:'page-'+i,total:1,moneda:'PEN',estado:'Pendiente'}));rangeCalls=0;assert.equal((await ventasService.getVentas(true,true)).length,1001);assert.equal(rangeCalls,2);
console.log('PASS financial sales read: required original total/currency/status, no invented dates, all financial pages read, default service compatibility retained, all data mocked.');
