import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { erpModules } from '../src/config/modules.ts';
import { findDuplicates } from '../src/repositories/contracts.ts';

assert.equal(erpModules.length, 12);
assert.equal(new Set(erpModules.map(module => module.id)).size, 12);
const source = [{ id: 'a', code: ' SKU ' }, { id: 'b', code: 'sku' }];
assert.deepEqual(findDuplicates(source, record => record.code), [{ key: 'sku', ids: ['a', 'b'] }]);
assert.equal(source.length, 2);
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const artifacts = resolve(root, 'docs/treasury-redesign');
await mkdir(artifacts, { recursive: true });
const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(edge)) throw new Error('Set EDGE_PATH to a Chromium/Edge executable to run browser checks.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = extname(path) ? resolve(dist, '.' + path) : resolve(dist, 'index.html');
    if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(root, `node_modules/.tmp/treasury-browser/profile-${Date.now()}`);
await mkdir(profile,{recursive:true});
const child = spawn(edge, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 150; i++) {
    try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim(); if (port) break; } catch {}
    await pause(100);
  }
  assert.ok(port, 'Edge debug port is available');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const writes = [];
  let supplierFailure = false;
  function command(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 10000);
      timeout.unref();
      pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const products = [{ id: 'product-1', codigo: 'ALVA-001', descripcion: 'Bolsa de prueba local', linea: 'Bolsas', marca: 'AlvaPlast', unidad: 'UND', precio_compra: 2, precio_venta: 3, stock: 10, stock_minimo: 2, almacen: 'Central' }];
  const party = { id: 'party-1', documento: '20123456789', tipo_persona: 'JURIDICA', nombre: 'Entidad local de prueba', email: 'local@example.test', telefono: '', direccion: 'Lima', limite_credito: 100, condicion_pago: 30, estado: 'Activo', historial: [] };
  ws.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error))); else request?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description ?? ''));
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      if (request.url.startsWith(origin)) { await command('Fetch.continueRequest', { requestId }); return; }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) writes.push({ method: request.method, url: request.url });
      const table = new URL(request.url).pathname.split('/').pop();

      let data = [];
      if (table === 'ventas') data=[{id:'sale-1',numero:'OV-1',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-01-01',moneda:'PEN',estado:'Pendiente',total:100,items:[]},{id:'sale-2',numero:'OV-2',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-01-02',moneda:'PEN',estado:'Pendiente',total:100,items:[]},{id:'old-completed',numero:'F001-old',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-01-01',moneda:'PEN',estado:'Completada',total:10,items:[]}];
      if (table === 'productos') data = products;
      if (table === 'ordenes_compra') data = [{id:'oc-1',codigo:'OC-001',proveedor_id:'party-1',proveedor_nombre:party.nombre,moneda:'PEN',estado:'EMITIDA',items:[{id:'oc-line-1',producto_id:'product-1',producto_codigo:'ALVA-001',producto_descripcion:'Bolsa de prueba local',unidad:'UND',cantidad:20,costo_unitario:2}]},{id:'oc-2',codigo:'OC-002',proveedor_id:'party-2',proveedor_nombre:'Segundo proveedor',moneda:'USD',estado:'EMITIDA',items:[{id:'oc-line-2',producto_id:'product-1',producto_codigo:'ALVA-001',producto_descripcion:'Bolsa de prueba local',unidad:'UND',cantidad:8,costo_unitario:4}]}];
      if (table === 'clientes' || table === 'proveedores') data = [party, {...party,id:'party-2',nombre:party.nombre,documento:'20987654321'}];
      if (table === 'lineas_categorias') data = [{ id: 'cat-1', codigo: 'BOL', nombre: 'Bolsas' }];
      if (table === 'almacenes') data = [{ id: 'alm-1', codigo: 'ALM', nombre: 'Central' }];
      if (table === 'unidades_medida') data = [{ id: 'um-1', codigo: 'NIU', nombre: 'Unidad', simbolo: 'UND' }];
      if (table === 'marcas') data = [{ id: 'brand-1', nombre: 'AlvaPlast' }];
      if (table === 'proveedores' && supplierFailure) { await command('Fetch.fulfillRequest', {requestId, responseCode: 500, responseHeaders: [{name:'Content-Type',value:'application/json'}, {name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify({message:'Simulated supplier read failure'})).toString('base64')}); return; }
      await command('Fetch.fulfillRequest', { requestId, responseCode: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 200 : 403, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS' }, { name: 'Content-Range', value: '0-0/1' }], body: Buffer.from(JSON.stringify(data)).toString('base64') });
    }
  });
  console.log('Browser connected');
  await command('Network.enable');
  await command('Network.setBypassServiceWorker', { bypass: true });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 160; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50); }
    console.error(await evaluate("document.body.innerText.slice(0,1500)"), errors);
    throw new Error(`Timed out: ${expression}`);
  }
  async function go(path) {
    console.log(`Checking ${path}`);
    await command('Page.navigate', { url: origin + path });
    await waitFor('document.querySelector("h1") && document.body.innerText.length > 100');
    await pause(80);
    assert.ok(!await evaluate('document.body.innerText.includes("Página no encontrada")'), path);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const key = 'erp_treasury_v1';
  const click = text => evaluate(`window.confirm=()=>true; [...([...document.querySelectorAll('dialog[open]')].at(-1)||document).querySelectorAll('button,a')].find(b=>(b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})).click()`);
  async function field(label, value) {
    await waitFor(`Array.from((Array.from(document.querySelectorAll('dialog[open]')).at(-1)||document).querySelectorAll('label')).some(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)})`);
    await evaluate(`(() => { const root=[...document.querySelectorAll('dialog[open]')].at(-1)||document; const label=[...root.querySelectorAll('label')].find(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)}); const el=label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); })()`);
  }
  const screens=[['cuentas-por-pagar','obligaciones'],['pagos','pagos'],['caja-bancos','cuentas']];
  async function captureSet(state) {
    for(const dark of [false,true]) for(const mobile of [false,true]) {
      await command('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
      await evaluate(`localStorage.setItem('erp_theme','${dark?'dark':'light'}')`);
      for(const [route,name] of screens) {
        await go('/'+route);await waitFor("!document.querySelector('main [role=status]')?.textContent.includes('Cargando')");await pause(200);
        assert.ok(await evaluate(`document.documentElement.scrollWidth<=${mobile?390:1440}`),route+' fits viewport');
        const {cssContentSize}=await command('Page.getLayoutMetrics');
        const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1}});
        await writeFile(resolve(artifacts,`${name}-${state}-${mobile?'mobile':'desktop'}-${dark?'dark':'light'}.png`),Buffer.from(image.data,'base64'));
      }
    }
    await evaluate("localStorage.setItem('erp_theme','light')");
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await command('Emulation.setTimezoneOverride',{timezoneId:'America/Lima'});
  await go('/tesoreria');
  await waitFor("document.body.innerText.includes('Saldo por cobrar')");
  await captureSet('empty');
  await go('/caja-bancos/movimientos');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('No hay movimientos registrados')");assert.ok(!await evaluate("document.querySelector('main').textContent.includes('Nueva cuenta')"));
  await go('/pagos');assert.ok(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Nuevo pago').disabled"));
  await go('/caja-bancos');assert.ok(await evaluate("[...document.querySelectorAll('main button')].some(b=>b.textContent==='Crear primera cuenta'&&!b.disabled)"));
  const invoice=(id,number,total,currency='PEN')=>({id,status:'REGISTRADA',createdAt:'2026-01-01T00:00:00Z',supplierId:'party-1',supplierName:party.nombre,supplierDocument:party.documento,documentType:'FACTURA',series:'F001',number,issuedAt:'2026-01-01',dueAt:'2026-01-15',currency,paymentDays:0,orderId:'oc-shared',orderCode:'OC-001',notes:'',lines:[{id:'line-'+id,productId:'product-1',code:'P1',description:'Producto de prueba',unit:'UND',quantity:1,price:total,discount:0,tax:0}],totals:{base:total,tax:0,total}});
  const invoices=[invoice('invoice-1','1',100),invoice('invoice-2','2',80),invoice('invoice-usd','3',50,'USD')];
  const pendingInvoice={...invoice('pending-invoice','',40),status:'PENDIENTE',orderId:'oc-pending',automaticOrderId:'oc-pending',orderCode:'OC-PENDING',series:'',issuedAt:'',dueAt:'',revision:0};
  const legacy=[{dbId:'sale-1',tipo:'FACTURA',nro:'F001-AR',razonSocial:party.nombre,rawFecha:'2026-01-01',fecha:'01/01/2026',productos:'Productos anteriores',metodoPago:'Efectivo',estado:'PENDIENTE',total:100,pagado:25,saldo:75}];
  await evaluate(`localStorage.setItem('erp_supplier_invoices_v1',${JSON.stringify(JSON.stringify({version:2,records:[...invoices,pendingInvoice]}))});localStorage.setItem('erp_estado_cuenta',${JSON.stringify(JSON.stringify(legacy))});localStorage.setItem('stock-probe','unchanged');localStorage.setItem('kardex-probe','unchanged');localStorage.setItem('ventas-probe','unchanged');`);
  const original=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}'&&k!=='erp_theme').map(k=>[k,localStorage.getItem(k)]))`);
  await go('/cuentas-por-pagar');await waitFor("document.querySelectorAll('main ul li').length===3");
  assert.ok(!await evaluate("document.querySelector('main ul').textContent.includes('OC-PENDING')"));
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),null,'obligations are unique read projections; no debt registration writes');
  await go('/caja-bancos');await waitFor("[...document.querySelectorAll('button')].some(b=>['Nueva cuenta','Crear primera cuenta'].includes(b.textContent)&&!b.disabled)");
  async function account(code,name,currency,opening,type='CAJA') {
    await evaluate("[...document.querySelectorAll('main button')].find(b=>['Nueva cuenta','Crear primera cuenta'].includes(b.textContent)).click()");await field('Código',code);await field('Nombre o alias',name);await field('Tipo',type);await field('Moneda',currency);await field('Saldo inicial',opening);await field('Fecha de apertura','2026-01-01');
    if(type==='BANCO'){await field('Banco (opcional)','Banco de prueba');await field('Número de cuenta (opcional)','1234567890');}
    await click('Guardar cuenta');await waitFor(`!document.querySelector('dialog')&&document.body.innerText.includes(${JSON.stringify(name)})`);
  }
  await account('BANK','Banco PEN','PEN','1000','BANCO');await account('CASH','Caja PEN','PEN','0');await account('USD','Banco USD','USD','100','BANCO');
  assert.ok(!await evaluate("document.body.innerText.includes('1234567890')"),'bank numbers are masked');
  let state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);assert.equal(state.operations.length,0);assert.equal(state.movements.length,0,'legacy receipts do not create retrospective cash');
  const bank=state.accounts.find(a=>a.code==='BANK').id;const cash=state.accounts.find(a=>a.code==='CASH').id;
  await go('/pagos');await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Nuevo pago'&&!b.disabled)");
  async function payment(amount,reference) {
    await click('Nuevo pago');await field('Proveedor','party-1');await field('Factura pendiente','ap:invoice:invoice-1');await field('Caja o cuenta bancaria',bank);await field('Importe',amount);await field('Fecha','2026-10-27');await field('Referencia',reference);
  }
  await payment('50','first-pay');await click('Revisar pago');
  await evaluate("const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirmar pago');b.click();b.click()");
  await waitFor("document.querySelector('dialog')?.textContent.includes('Detalle de operaci')");
  state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);assert.equal(state.operations.length,1);assert.equal(state.movements.length,1);assert.equal(state.applications.length,1);
  const firstPay=state.operations[0].id;await click('Cerrar');
  await payment('50.01','overpay');await click('Revisar pago');await waitFor("document.querySelector('[role=alert]')?.textContent.includes('no superes su saldo')");assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).operations.length`),1);await click('Cerrar ventana');
  await payment('50','second-pay');await click('Revisar pago');
  const beforeFailure=await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='${key}')throw new DOMException('quota','QuotaExceededError');return window.originalSet.call(this,k,v)}`);
  await click('Confirmar pago');await waitFor("document.querySelector('[role=alert]')?.textContent.includes('No se pudo guardar Tesorería')");assert.equal(await evaluate(`localStorage.getItem('${key}')`),beforeFailure);
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('PEN 50.00')"));
  await evaluate("Storage.prototype.setItem=window.originalSet");await click('Confirmar pago');await waitFor("document.querySelector('dialog')?.textContent.includes('Detalle de operaci')");await click('Cerrar');
  await go('/cuentas-por-pagar');await waitFor("document.querySelectorAll('main ul li').length===3");
  assert.ok(await evaluate("[...document.querySelectorAll('main ul li')].find(tr=>tr.textContent.includes('F001-1')).textContent.includes('PAGADA')"));
  await go('/pagos');await waitFor("document.querySelectorAll('main article').length===2");
  await evaluate(`[...document.querySelectorAll('main article')].find(tr=>tr.textContent.includes('first-pay'))?.querySelector('button')?.click()`);
  // Search uses canonical reference; open the matching operation through the filtered history.
  if(!await evaluate("!!document.querySelector('dialog[open]')")){await field('Buscar operación o referencia','first-pay');await waitFor("document.querySelectorAll('main article').length===1");await click('Ver detalle');}
  async function cancel(reason) {await field('Motivo de anulación',reason);await field('Fecha de reversión','2026-10-27');await click('Revisar anulación');await evaluate("const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirmar anulación');b.click();b.click()");await waitFor("document.querySelector('dialog')?.textContent.includes('Anulada el')");}
  await cancel('Pago equivocado');state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);assert.equal(state.movements.filter(m=>m.operationId===firstPay).length,2);await click('Cerrar');
  await go('/estado-cuenta');await waitFor("document.querySelectorAll('tbody tr').length>0");
  assert.ok(await evaluate("document.body.innerText.includes('F001-AR') && document.body.innerText.includes('OV-2')"));
  assert.ok(!await evaluate("[...document.querySelectorAll('tbody tr')].some(tr=>tr.textContent.includes('OV-1'))"),'linked order is not a second receivable');
  async function receipt(amount,reference) {
    await evaluate("[...document.querySelectorAll('tr')].find(tr=>tr.textContent.includes('F001-AR')&&tr.querySelector('button')).querySelector('button[title=\"Registrar cobro de este documento\"]').click()");
    await waitFor("document.querySelector('dialog[open]')");await field('Caja o cuenta bancaria',cash);await field('Importe',amount);await field('Fecha','2026-10-27');await field('Referencia',reference);await click('Revisar cobro');await click('Confirmar cobro');await waitFor("document.querySelector('dialog')?.textContent.includes('Detalle de operaci')");
  }
  await receipt('25','first-receipt');state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);const firstReceipt=state.operations.find(o=>o.reference==='first-receipt').id;await click('Cerrar');
  await waitFor("[...document.querySelectorAll('tr')].some(tr=>tr.textContent.includes('F001-AR')&&tr.textContent.includes('PARCIAL'))");
  await receipt('50','second-receipt');await click('Cerrar');
  await waitFor("[...document.querySelectorAll('tr')].some(tr=>tr.textContent.includes('F001-AR')&&tr.textContent.includes('PAGADA'))");
  await evaluate("[...document.querySelectorAll('tr')].find(tr=>tr.textContent.includes('F001-AR')&&tr.querySelector('button')).querySelector('button').click()");
  await waitFor("document.querySelector('dialog')?.textContent.includes('importe histórico')");
  await evaluate(`[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Ver operación')&&b.textContent.includes('25.00')).click()`);
  await cancel('Cobro duplicado por error');await click('Cerrar');
  state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);assert.ok(state.operations.find(o=>o.id===firstReceipt).cancellation);
  await go('/caja-bancos');await waitFor("document.querySelectorAll('main article').length===3");
  await click('Transferencia interna');await field('Cuenta de origen',cash);await field('Cuenta de destino',bank);await field('Importe','10');await field('Fecha','2026-10-27');await field('Referencia','transfer-1');await click('Revisar transferencia');await click('Confirmar transferencia');
  await waitFor("document.querySelector('dialog')?.textContent.includes('Detalle de operaci')");
  state=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);const transfer=state.operations.find(o=>o.reference==='transfer-1');assert.equal(state.movements.filter(m=>m.operationId===transfer.id).length,2);
  await cancel('Destino incorrecto');await click('Cerrar');
  await go('/tesoreria');await waitFor("document.body.innerText.includes('Saldo por cobrar')");
  assert.ok(await evaluate("document.body.innerText.includes('PEN 125.00') && document.body.innerText.includes('PEN 130.00') && document.body.innerText.includes('USD 50.00')"));
  assert.ok(await evaluate("document.body.innerText.includes('PEN 950.00') && document.body.innerText.includes('PEN 50.00') && document.body.innerText.includes('USD 100.00')"));
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}'&&k!=='erp_theme').map(k=>[k,localStorage.getItem(k)]))`),original,'all operations leave legacy receipts, invoices, sales, stock and Kardex untouched');
  await go('/cuentas-por-pagar');
  await evaluate("[...document.querySelectorAll('main ul button')].find(b=>b.textContent.includes('F001-2')).click()");
  await waitFor("document.querySelector('main aside').textContent.includes('F001-2')");await click('Registrar pago');
  await waitFor("document.querySelector('dialog[open]')");
  assert.equal(await evaluate("[...document.querySelectorAll('dialog label')].find(l=>l.firstChild.textContent==='Factura pendiente').querySelector('select').value"),'ap:invoice:invoice-2');await click('Cerrar ventana');
  await click('Filtros');assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Filtros').getAttribute('aria-expanded')"),'true');
  await field('Estado de pago','PAGADA');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('No hay coincidencias')");await click('Limpiar / actualizar');
  await go('/caja-bancos');await waitFor("document.querySelectorAll('main article').length===3");
  await evaluate("[...document.querySelectorAll('main article')].find(a=>a.textContent.includes('Banco PEN')).querySelector('a').click()");
  const movementPath='/caja-bancos/movimientos';
  const accountURL=movementPath+'?accountId='+encodeURIComponent(bank);
  await waitFor(`location.pathname===${JSON.stringify(movementPath)}&&new URLSearchParams(location.search).get('accountId')===${JSON.stringify(bank)}&&document.querySelector('tbody')`);
  assert.ok(await evaluate("document.querySelector('h1').textContent==='Movimientos de Caja/Bancos'&&document.querySelectorAll('main article').length===0&&!document.querySelector('main').textContent.includes('Nueva cuenta')"));
  assert.ok(await evaluate("[...document.querySelectorAll('tbody tr')].every(row=>row.children[1].textContent==='Banco PEN')"));
  await go(accountURL);await waitFor("document.querySelector('tbody')");
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Cuenta').querySelector('select').value"),bank);
  await click('Ver todas las cuentas');await waitFor("!new URLSearchParams(location.search).has('accountId')&&document.querySelector('tbody')");
  await evaluate('history.back()');await waitFor(`new URLSearchParams(location.search).get('accountId')===${JSON.stringify(bank)}&&document.querySelector('tbody')`);
  await evaluate('history.forward()');await waitFor("!new URLSearchParams(location.search).has('accountId')&&document.querySelector('tbody')");
  await field('Cuenta',cash);await waitFor(`new URLSearchParams(location.search).get('accountId')===${JSON.stringify(cash)}&&document.querySelector('tbody')`);
  await field('Buscar','ZZZ-no-match');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('No hay coincidencias')");
  await click('Limpiar / actualizar');await waitFor("location.search===''&&document.querySelector('tbody')");
  await click('Ver operación');await waitFor("document.querySelector('dialog[open]')");await click('Cerrar');
  const movementsImage=await command('Page.captureScreenshot',{format:'png'});await writeFile(resolve(artifacts,'cuentas-movimientos.png'),Buffer.from(movementsImage.data,'base64'));
  await click('Volver a Caja/Bancos');await waitFor("location.pathname==='/caja-bancos'&&document.querySelectorAll('main article').length===3");
  await click('Todos los movimientos');await waitFor("location.pathname==='/caja-bancos/movimientos'&&location.search===''&&document.querySelector('tbody')");
  for(const dark of [false,true]) for(const mobile of [false,true]) {
    await evaluate(`localStorage.setItem('erp_theme','${dark?'dark':'light'}')`);
    await command('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
    await go(accountURL);await waitFor("document.querySelector('tbody')");assert.ok(await evaluate(`document.documentElement.scrollWidth<=${mobile?390:1440}`));
    assert.equal(await evaluate("document.documentElement.classList.contains('dark')"),dark);
  }
  await evaluate("localStorage.setItem('erp_theme','light')");
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await captureSet('data');
  for(const [route] of screens) {
    await go('/'+route);await field('Por página','25');await waitFor("document.querySelector('main').textContent.includes('Página 1 de 1')");
    await field(route==='pagos'?'Buscar operación o referencia':route==='caja-bancos'?'Buscar':'Documento o proveedor','ZZZ-no-match');
    await waitFor("document.querySelector('main [role=status]')?.textContent.includes('No hay coincidencias')");
    assert.ok(!await evaluate("document.querySelector('main').textContent.includes('Por página')"));
  }
  await go('/pagos');
  await evaluate("document.querySelector('header button[aria-pressed]').click()");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const path of ['/tesoreria','/cuentas-por-pagar','/pagos','/caja-bancos','/caja-bancos/movimientos','/estado-cuenta']) {await go(path);await pause(150);assert.ok(await evaluate("document.documentElement.classList.contains('dark')&&document.documentElement.scrollWidth<=390"),path);}
  await go('/pagos');await waitFor("document.querySelectorAll('main article').length===2");await click('Ver detalle');await waitFor("document.querySelector('dialog[open]')");
  const image=await command('Page.captureScreenshot',{format:'png'});await (await import('node:fs/promises')).writeFile(resolve(artifacts,'treasury-mobile-dark.png'),Buffer.from(image.data,'base64'));await click('Cerrar');
  await go('/caja-bancos');await waitFor("document.querySelectorAll('main article').length===3");
  await evaluate("[...document.querySelectorAll('main article')].find(tr=>tr.textContent.includes('Banco PEN')).querySelector('button').click()");
  await waitFor("document.querySelector('dialog[open]')");
  assert.ok(await evaluate("[...document.querySelectorAll('dialog label')].filter(l=>['Moneda','Saldo inicial','Fecha de apertura','Tipo'].includes(l.firstChild.textContent)).every(l=>l.querySelector('input,select').disabled)"));
  await evaluate("document.querySelector('dialog input[type=checkbox]').click()");await click('Guardar cuenta');await waitFor("!document.querySelector('dialog')&&document.body.innerText.includes('Inactiva')");
  await go('/pagos');await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Nuevo pago'&&!b.disabled)");await click('Nuevo pago');await field('Proveedor','party-1');await field('Factura pendiente','ap:invoice:invoice-1');
  assert.ok(!await evaluate(`Array.from(document.querySelector('dialog select').closest('form').querySelectorAll('option')).some(o=>o.value===${JSON.stringify(bank)})`),'inactive account cannot be selected');await click('Cerrar ventana');
  const originalInvoices=await evaluate("localStorage.getItem('erp_supplier_invoices_v1')");
  await evaluate("(()=>{const data=JSON.parse(localStorage.getItem('erp_supplier_invoices_v1'));const record=data.records.find(r=>r.id==='invoice-1');record.supplierId='changed-supplier';record.supplierName='Proveedor alterado';localStorage.setItem('erp_supplier_invoices_v1',JSON.stringify(data));})()");
  await go('/cuentas-por-pagar');await waitFor("document.body.innerText.includes('Operación bloqueada')");
  assert.ok(await evaluate("[...document.querySelectorAll('main aside button')].find(b=>b.textContent==='Registrar pago').disabled"));
  await go('/tesoreria');await waitFor("document.querySelector('[role=alert]')?.textContent.includes('modificados')");assert.ok(!await evaluate("document.body.innerText.includes('PEN 0.00')"));
  await evaluate(`localStorage.setItem('erp_supplier_invoices_v1',${JSON.stringify(originalInvoices)})`);await click('Reintentar');await waitFor("document.body.innerText.includes('PEN 130.00')");
  const healthy=await evaluate(`localStorage.getItem('${key}')`);await evaluate(`localStorage.setItem('${key}','{damaged')`);await go('/caja-bancos');await waitFor("document.querySelector('[role=alert]')?.textContent.includes('intactos')");assert.equal(await evaluate(`localStorage.getItem('${key}')`),'{damaged');assert.ok(!await evaluate("document.body.innerText.includes('PEN 0.00')"));
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);await click('Reintentar');await waitFor("document.body.innerText.includes('Banco PEN')");
  for(const [route] of [...screens,['caja-bancos/movimientos']]) {
    await evaluate(`localStorage.setItem('${key}','{damaged')`);await go('/'+route);await waitFor("document.querySelector('[role=alert]')");
    assert.ok(!await evaluate("document.querySelector('main').textContent.includes('Por página')"));
    await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);await click('Reintentar');await waitFor("!document.querySelector('[role=alert]')");
  }
  const invoiceBackup=await evaluate("localStorage.getItem('erp_supplier_invoices_v1')");
  const manyInvoices=[...invoices,...Array.from({length:12},(_,n)=>invoice('page-'+n,String(100+n),10))];
  await evaluate(`localStorage.setItem('erp_supplier_invoices_v1',${JSON.stringify(JSON.stringify({version:2,records:manyInvoices}))})`);
  await go('/cuentas-por-pagar');await waitFor("document.querySelectorAll('main ul li').length===10");await click('Siguiente');
  await waitFor("document.querySelector('main').textContent.includes('Página 2 de 2')");assert.equal(await evaluate("document.querySelectorAll('main ul li').length"),5);await click('Anterior');await waitFor("document.querySelectorAll('main ul li').length===10");
  await evaluate(`localStorage.setItem('erp_supplier_invoices_v1',${JSON.stringify(invoiceBackup)})`);
  const pagingState=JSON.parse(healthy);
  const transferTemplate=pagingState.operations.find(o=>o.kind==='TRANSFERENCIA');
  const movementTemplates=pagingState.movements.filter(m=>m.operationId===transferTemplate.id&&!m.reversalId);
  for(let n=0;n<12;n++) {
    const op={...transferTemplate,id:'movement-page-'+n};delete op.cancellation;pagingState.operations.push(op);
    pagingState.movements.push(...movementTemplates.map((m,index)=>({...m,id:`${op.id}:movement:${index+1}`,operationId:op.id})));
  }
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(JSON.stringify(pagingState))})`);
  await go(accountURL);await waitFor("document.querySelectorAll('tbody tr').length===10");await click('Siguiente');
  await waitFor("new URLSearchParams(location.search).get('page')==='2'&&document.querySelector('tbody')");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('accountId')"),bank);
  await go(accountURL+'&page=2');await waitFor("document.querySelector('tbody')");
  assert.ok(await evaluate("[...document.querySelectorAll('tbody tr')].every(row=>row.children[1].textContent==='Banco PEN')"));
  await click('Anterior');await waitFor("!new URLSearchParams(location.search).has('page')&&document.querySelectorAll('tbody tr').length===10");
  await field('Por página','25');await waitFor("new URLSearchParams(location.search).get('pageSize')==='25'&&document.querySelector('tbody')");
  await click('Limpiar / actualizar');await waitFor("!new URLSearchParams(location.search).has('accountId')&&document.querySelector('tbody')");
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);
  await go('/caja-bancos/movimientos?accountId=missing-account');await waitFor("document.querySelector('main').textContent.includes('Cuenta no disponible')&&document.querySelector('main [role=status]')");
  await click('Ver todas las cuentas');await waitFor("document.querySelector('tbody')");
  // Delay the workspace Promise.all only in this isolated browser to observe loading.
  const delayScript=await command('Page.addScriptToEvaluateOnNewDocument',{source:`const originalAll=Promise.all;Promise.all=function(values){const result=originalAll.call(this,values);return new Promise((resolve,reject)=>{result.then(value=>setTimeout(()=>resolve(value),1200),reject);});};`});
  for(const [route] of screens){await go('/'+route);await waitFor("document.querySelector('main [role=status]')?.textContent.includes('Cargando')");await waitFor("!document.querySelector('main [role=status]')?.textContent.includes('Cargando')");}
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:delayScript.identifier});
  // Legacy identity and funds checks use an isolated synthetic ledger only.
  const fundsAccounts=JSON.parse(healthy).accounts.map(a=>({...a,active:true,openingMinor:a.id===bank?5000:0}));
  fundsAccounts.push({...fundsAccounts.find(a=>a.id===cash),id:'legacy-negative',code:'NEG',name:'Caja negativa',openingMinor:-1000});
  for(const a of fundsAccounts){delete a.holderName;delete a.responsibleName;}
  const legacyFunds={version:1,accounts:fundsAccounts,operations:[],applications:[],movements:[],locks:[]};
  const legacyFundsText=JSON.stringify(legacyFunds);
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(legacyFundsText)})`);
  await go('/caja-bancos');await waitFor("document.querySelectorAll('main article').length===4");
  assert.ok(await evaluate("document.querySelector('main').textContent.includes('Titular no especificado')&&document.querySelector('main').textContent.includes('Saldo negativo existente')"));
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),legacyFundsText,'reading legacy identities never mutates the ledger');
  await evaluate("[...document.querySelectorAll('main article')].find(a=>a.textContent.includes('Banco PEN')).querySelector('button').click()");
  await field('Empresa / titular','Empresa de prueba S.A.C.');await field('Responsable interno (opcional)','Responsable de prueba');await click('Guardar cuenta');
  await waitFor("!document.querySelector('dialog')&&document.querySelector('main').textContent.includes('Empresa de prueba S.A.C.')");
  const withIdentity=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);
  assert.equal(withIdentity.version,2);assert.equal(withIdentity.accounts.find(a=>a.id===bank).holderName,'Empresa de prueba S.A.C.');
  assert.equal(withIdentity.accounts.find(a=>a.id==='legacy-negative').openingMinor,-1000);assert.deepEqual(withIdentity.movements,[]);
  await go('/pagos');await waitFor("[...document.querySelectorAll('main button')].some(b=>b.textContent==='Nuevo pago'&&!b.disabled)");
  await payment('50.01','funds-rejected');await click('Revisar pago');
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('Saldo insuficiente. Disponible: S/ 50.00. Importe solicitado: S/ 50.01')");
  assert.equal(await evaluate("[...document.querySelectorAll('dialog label')].find(l=>l.firstChild.textContent==='Importe').querySelector('input').value"),'50.01');
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('${key}'))`),withIdentity);
  const rejectedImage=await command('Page.captureScreenshot',{format:'png'});await writeFile(resolve(artifacts,'funds-insufficient.png'),Buffer.from(rejectedImage.data,'base64'));
  await field('Importe','50');await click('Revisar pago');await waitFor("document.querySelector('dialog').textContent.includes('Revisa antes de confirmar')");
  // Simulate another local writer after opening/reviewing the modal.
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('${key}'));s.accounts.find(a=>a.id===${JSON.stringify(bank)}).openingMinor=1000;localStorage.setItem('${key}',JSON.stringify(s));})()`);
  const afterOtherWriter=await evaluate(`localStorage.getItem('${key}')`);
  await click('Confirmar pago');await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('Disponible: S/ 10.00')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),afterOtherWriter);
  await waitFor("!document.querySelector('dialog [role=status]')");
  await click('Editar');await field('Importe','10');await click('Revisar pago');
  await evaluate("(()=>{const b=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Confirmar pago');b.click();b.click();})()");
  await waitFor("document.querySelector('dialog')?.textContent.includes('Detalle de operaci')");
  const exactFunds=await evaluate(`JSON.parse(localStorage.getItem('${key}'))`);
  assert.equal(exactFunds.operations.length,1);assert.equal(exactFunds.movements.length,1);assert.equal(exactFunds.applications.length,1);
  assert.equal(exactFunds.accounts.find(a=>a.id===bank).openingMinor-exactFunds.movements[0].amountMinor,0);
  await click('Cerrar');await payment('1','zero-funds');await click('Revisar pago');
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('Disponible: S/ 0.00')");await click('Cerrar ventana');
  await go('/caja-bancos');await click('Transferencia interna');await field('Cuenta de origen',bank);await field('Cuenta de destino',cash);await field('Importe','1');await field('Fecha','2026-10-27');await click('Revisar transferencia');
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('Saldo insuficiente')");
  await field('Cuenta de origen','legacy-negative');await field('Cuenta de destino',cash);await click('Revisar transferencia');
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('Disponible: S/ -10.00')");await click('Cerrar ventana');
  const reversalState=JSON.parse(healthy);const incoming=reversalState.operations.find(o=>o.kind==='COBRO'&&!o.cancellation);
  const incomingAccount=reversalState.accounts.find(a=>a.id===incoming.accountId);
  const available=incomingAccount.openingMinor+reversalState.movements.filter(m=>m.accountId===incomingAccount.id).reduce((n,m)=>n+(m.direction==='INGRESO'?m.amountMinor:-m.amountMinor),0);
  incomingAccount.openingMinor-=available;
  const reversalText=JSON.stringify(reversalState);await evaluate(`localStorage.setItem('${key}',${JSON.stringify(reversalText)})`);
  await go('/caja-bancos/movimientos?accountId='+encodeURIComponent(incoming.accountId));await waitFor("document.querySelector('tbody')");
  await evaluate(`[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(${JSON.stringify(incoming.id)})).querySelector('button').click()`);
  await field('Motivo de anulación','Cobro equivocado');await field('Fecha de reversión','2026-10-28');await click('Revisar anulación');
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('reversión retiraría fondos')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),reversalText,'rejected reversal does not mutate its cancellation or movements');
  await click('Cerrar');await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS Treasury browser: registered-only payables, accounts/opening balances, masked banks, partial/total payments and receipts, overpayment and quota, double click, reversals, linked order deduplication, legacy receipt compatibility, transfer/reversal, per-currency summary, reload, mobile/dark, corrupt data recovery and zero writes to remote/legacy/commercial/stock sources.');
} finally {ws?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
