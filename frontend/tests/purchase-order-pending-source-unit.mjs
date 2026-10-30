import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const dir=resolve(root,'node_modules/.tmp/purchase-pending-source');
await mkdir(dir,{recursive:true});
let text=ts.transpileModule(await readFile(resolve(root,'src/services/comprasService.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@/lib/supabase'","'./supabase-fixture.mjs'");
await writeFile(resolve(dir,'compras.mjs'),text);
await writeFile(resolve(dir,'supabase-fixture.mjs'),`export const supabase = {
  from(table) {
    return { insert(payload) {
      globalThis.calls.push({table,payload});
      if (table === 'ordenes_compra_items') return Promise.resolve({error:null});
      return { select() { return { async single() {
        return globalThis.headerError ? {error:Error('simulated offline')} : {data:{...payload[0],id:'stable-server-id',fecha_emision:'2026-10-27'},error:null};
      } }; } };
    } };
  }
};`);
const {comprasService,readCachedPurchaseOrders}=await import(pathToFileURL(resolve(dir,'compras.mjs')));
let raw=null,quota=false;
globalThis.localStorage={getItem:()=>raw,setItem:(_,value)=>{if(quota)throw Error('quota');raw=value;}};
globalThis.calls=[];globalThis.headerError=false;
const draft={codigo:'OC-TEST',proveedor_id:'supplier-id',proveedor_nombre:'Proveedor',proveedor_documento:'20123456789',descuento_global:5,subtotal:20,igv:2.7,total:17.7,items:[{producto_id:'product-id',producto_codigo:'P1',producto_descripcion:'Producto',unidad:'UND',cantidad:2,costo_unitario:10,subtotal:20}]};
const serverOrder=await comprasService.createOrdenCompra(draft);
assert.equal(serverOrder.id,'stable-server-id');assert.equal(serverOrder.descuento_global,5);
assert.equal(readCachedPurchaseOrders()[0].id,'stable-server-id');
assert.equal(readCachedPurchaseOrders()[0].proveedor_id,'supplier-id');assert.equal(readCachedPurchaseOrders()[0].items[0].producto_id,'product-id');
const goodRaw=raw;
quota=true;calls.length=0;
const remoteSavedDespiteBackupError=await comprasService.createOrdenCompra({...draft,codigo:'OC-SECOND'});
assert.equal(remoteSavedDespiteBackupError.id,'stable-server-id');assert.ok(remoteSavedDespiteBackupError.localBackupWarning);
assert.equal(raw,goodRaw);assert.equal(calls.filter(c=>c.table==='ordenes_compra').length,1,'cache quota must not trigger another order save or fallback purchase');
quota=false;headerError=true;calls.length=0;raw=null;
const fallback=await comprasService.createOrdenCompra(draft);
assert.equal(fallback.id,'OC-TEST');
assert.equal(readCachedPurchaseOrders()[0].id,fallback.id);assert.equal(readCachedPurchaseOrders()[0].proveedor_id,'supplier-id');assert.equal(readCachedPurchaseOrders()[0].items[0].producto_id,'product-id');
assert.equal(readCachedPurchaseOrders()[0].descuento_global,5);
raw='{damaged';await assert.rejects(comprasService.createOrdenCompra(draft));assert.equal(raw,'{damaged');
console.log('PASS purchase source: stable server/local IDs, supplier/product/discount backup, remote order survives cache failure without resaving, local fallback, corrupt backup untouched. All Supabase operations mocked.');
