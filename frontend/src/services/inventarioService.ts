// Servicio de Inventario y Kardex conectado directamente a Supabase PostgreSQL
import { supabase } from '@/lib/supabase';

export interface Producto {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  marca?: string;
  unidad: string;
  costoUnitario: number;
  precioVenta: number;
  stock: number;
  stockMinimo: number;
  almacen: string;
}

export interface MovimientoKardex {
  id: string;
  fecha: string;
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  tipoMovimiento: 'ENTRADA' | 'SALIDA';
  tipoOperacion: 'COMPRA' | 'VENTA' | 'INGRESO_AJUSTE' | 'SALIDA_AJUSTE' | 'DEVOLUCION';
  documentoTipo: string;
  documentoNumero: string;
  detalle: string;
  almacen: string;
  // Entradas
  cantEntrada?: number;
  costoEntrada?: number;
  totalEntrada?: number;
  // Salidas
  cantSalida?: number;
  costoSalida?: number;
  totalSalida?: number;
  // Saldos
  saldoCantidad: number;
  saldoCostoUnitario: number;
  saldoTotal: number;
}

export interface CatalogoItem {
  id: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  paisOrigen?: string;
  direccion?: string;
  simbolo?: string;
}

export const inventarioService = {
  // Obtener catálogos base (líneas, marcas, almacenes, unidades)
  getCatalogosBase: async (strict = false) => {
    try {
      const [lineasRes, marcasRes, almacenesRes, unidadesRes] = await Promise.all([
        supabase.from('lineas_categorias').select('id, codigo, nombre, descripcion').order('nombre', { ascending: true }),
        supabase.from('marcas').select('id, nombre, pais_origen').order('nombre', { ascending: true }),
        supabase.from('almacenes').select('id, codigo, nombre, direccion').order('nombre', { ascending: true }),
        supabase.from('unidades_medida').select('id, codigo, nombre, simbolo').order('nombre', { ascending: true })
      ]);

      if (strict && [lineasRes, marcasRes, almacenesRes, unidadesRes].some(result => result.error)) throw new Error('No se pudieron cargar los catálogos. Reintenta.');
      return {
        lineas: (lineasRes.data || []).map((l: any) => ({
          id: l.id,
          codigo: l.codigo || '',
          nombre: l.nombre,
          descripcion: l.descripcion || ''
        })),
        marcas: (marcasRes.data || []).map((m: any) => ({
          id: m.id,
          nombre: m.nombre,
          paisOrigen: m.pais_origen || ''
        })),
        almacenes: (almacenesRes.data || []).map((a: any) => ({
          id: a.id,
          codigo: a.codigo,
          nombre: a.nombre,
          direccion: a.direccion || ''
        })),
        unidades: (unidadesRes.data || []).map((u: any) => ({
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          simbolo: u.simbolo || ''
        }))
      };
    } catch (err) {
      console.error('Error al obtener catálogos base:', err);
      if (strict) throw new Error('No se pudieron cargar los catálogos. Reintenta.');
      return { lineas: [], marcas: [], almacenes: [], unidades: [] };
    }
  },

  // Obtener productos reales de Supabase
  getProductos: async (): Promise<Producto[]> => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select(`
          id,
          codigo,
          descripcion,
          linea,
          marca,
          unidad,
          precio_compra,
          precio_venta,
          stock,
          stock_minimo,
          almacen
        `)
        .order('codigo', { ascending: true });

      if (error) {
        console.error('Error al obtener productos de Supabase:', error.message);
        return [];
      }

      return (data || []).map((p: any) => ({
        id: p.id,
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        categoria: p.linea || 'General',
        marca: p.marca || 'General',
        unidad: p.unidad || 'UND',
        costoUnitario: Number(p.precio_compra) || 0,
        precioVenta: Number(p.precio_venta) || 0,
        stock: Number(p.stock) || 0,
        stockMinimo: Number(p.stock_minimo) || 0,
        almacen: p.almacen || 'Almacén Central'
      }));
    } catch (err) {
      console.error('Error en getProductos:', err);
      return [];
    }
  },

  // Crear producto en Supabase
  createProducto: async (data: Omit<Producto, 'id' | 'stock'> & { stockInicial?: number }): Promise<Producto> => {
    const stock = Number(data.stockInicial || 0);

    const { data: nuevo, error } = await supabase
      .from('productos')
      .insert([{
        codigo: data.codigo.trim().toUpperCase(),
        descripcion: data.descripcion.trim(),
        linea: data.categoria || 'General',
        marca: data.marca || 'General',
        unidad: data.unidad || 'UND',
        precio_compra: Number(data.costoUnitario) || 0,
        precio_venta: Number(data.precioVenta) || 0,
        stock: stock,
        stock_minimo: Number(data.stockMinimo) || 0,
        almacen: data.almacen || 'Almacén Central',
        estado: 'Activo'
      }])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear producto en Supabase');

    const productoCreado: Producto = {
      id: nuevo.id,
      codigo: nuevo.codigo,
      descripcion: nuevo.descripcion,
      categoria: nuevo.linea,
      marca: nuevo.marca,
      unidad: nuevo.unidad,
      costoUnitario: Number(nuevo.precio_compra) || 0,
      precioVenta: Number(nuevo.precio_venta) || 0,
      stock: Number(nuevo.stock) || 0,
      stockMinimo: Number(nuevo.stock_minimo) || 0,
      almacen: nuevo.almacen
    };

    if (stock > 0) {
      await inventarioService.registrarMovimiento({
        productoId: nuevo.id,
        productoCodigo: nuevo.codigo,
        productoDescripcion: nuevo.descripcion,
        tipoMovimiento: 'ENTRADA',
        tipoOperacion: 'INGRESO_AJUSTE',
        documentoTipo: 'INVENTARIO INICIAL',
        documentoNumero: 'INV-INI',
        detalle: 'Inventario inicial al crear producto',
        almacen: nuevo.almacen,
        cantidad: stock,
        costoUnitario: productoCreado.costoUnitario
      });
    }

    return productoCreado;
  },

  // Actualizar producto en Supabase
  updateProducto: async (id: string, data: Partial<Producto>): Promise<Producto> => {
    const payload: any = {};
    if (data.codigo !== undefined) payload.codigo = data.codigo.trim().toUpperCase();
    if (data.descripcion !== undefined) payload.descripcion = data.descripcion.trim();
    if (data.categoria !== undefined) payload.linea = data.categoria;
    if (data.marca !== undefined) payload.marca = data.marca;
    if (data.unidad !== undefined) payload.unidad = data.unidad;
    if (data.costoUnitario !== undefined) payload.precio_compra = Number(data.costoUnitario);
    if (data.precioVenta !== undefined) payload.precio_venta = Number(data.precioVenta);
    if (data.stock !== undefined) payload.stock = Number(data.stock);
    if (data.stockMinimo !== undefined) payload.stock_minimo = Number(data.stockMinimo);
    if (data.almacen !== undefined) payload.almacen = data.almacen;
    payload.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('productos')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar producto');

    return {
      id: updated.id,
      codigo: updated.codigo,
      descripcion: updated.descripcion,
      categoria: updated.linea,
      marca: updated.marca,
      unidad: updated.unidad,
      costoUnitario: Number(updated.precio_compra) || 0,
      precioVenta: Number(updated.precio_venta) || 0,
      stock: Number(updated.stock) || 0,
      stockMinimo: Number(updated.stock_minimo) || 0,
      almacen: updated.almacen
    };
  },

  // Eliminar producto de Supabase
  deleteProducto: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al eliminar producto');
  },

  // Obtener movimientos de Kardex de Supabase
  getMovimientos: async (): Promise<MovimientoKardex[]> => {
    try {
      const { data, error } = await supabase
        .from('kardex_movimientos')
        .select('*')
        .order('fecha', { ascending: false });

      if (error) {
        console.error('Error al obtener movimientos de kardex:', error.message);
        return [];
      }

      return (data || []).map((m: any) => ({
        id: m.id,
        fecha: m.fecha,
        productoId: m.producto_id,
        productoCodigo: m.producto_codigo || '',
        productoDescripcion: m.producto_descripcion || '',
        tipoMovimiento: m.tipo_movimiento,
        tipoOperacion: m.tipo_operacion,
        documentoTipo: m.documento_tipo || '',
        documentoNumero: m.documento_numero || '',
        detalle: m.detalle || '',
        almacen: m.almacen || 'Central',
        cantEntrada: Number(m.cant_entrada) || 0,
        costoEntrada: Number(m.costo_entrada) || 0,
        totalEntrada: Number(m.total_entrada) || 0,
        cantSalida: Number(m.cant_salida) || 0,
        costoSalida: Number(m.costo_salida) || 0,
        totalSalida: Number(m.total_salida) || 0,
        saldoCantidad: Number(m.saldo_cantidad) || 0,
        saldoCostoUnitario: Number(m.saldo_costo_unitario) || 0,
        saldoTotal: Number(m.saldo_total) || 0
      }));
    } catch (err) {
      console.error('Error en getMovimientos:', err);
      return [];
    }
  },

  // Registrar movimiento en el Kardex y actualizar stock en Supabase
  registrarMovimiento: async (params: {
    productoId: string;
    productoCodigo: string;
    productoDescripcion: string;
    tipoMovimiento: 'ENTRADA' | 'SALIDA';
    tipoOperacion: 'COMPRA' | 'VENTA' | 'INGRESO_AJUSTE' | 'SALIDA_AJUSTE' | 'DEVOLUCION';
    documentoTipo: string;
    documentoNumero: string;
    detalle: string;
    almacen: string;
    cantidad: number;
    costoUnitario: number;
  }): Promise<MovimientoKardex> => {
    // 1. Obtener producto actual de Supabase
    const { data: producto, error: prodErr } = await supabase
      .from('productos')
      .select('*')
      .eq('id', params.productoId)
      .single();

    if (prodErr || !producto) throw new Error('Producto no existe para kardex');

    const cantidad = Number(params.cantidad);
    const costo = Number(params.costoUnitario);
    let nuevoStock = Number(producto.stock) || 0;
    let nuevoCostoPromedio = Number(producto.precio_compra) || 0;

    let payloadKardex: any = {
      producto_id: producto.id,
      producto_codigo: producto.codigo,
      producto_descripcion: producto.descripcion,
      tipo_movimiento: params.tipoMovimiento,
      tipo_operacion: params.tipoOperacion,
      documento_tipo: params.documentoTipo,
      documento_numero: params.documentoNumero,
      detalle: params.detalle,
      almacen: params.almacen || producto.almacen,
      fecha: new Date().toISOString()
    };

    if (params.tipoMovimiento === 'ENTRADA') {
      const valorActual = nuevoStock * nuevoCostoPromedio;
      const valorEntrada = cantidad * costo;
      nuevoStock = nuevoStock + cantidad;
      nuevoCostoPromedio = nuevoStock > 0 ? (valorActual + valorEntrada) / nuevoStock : costo;

      payloadKardex.cant_entrada = cantidad;
      payloadKardex.costo_entrada = costo;
      payloadKardex.total_entrada = cantidad * costo;
      payloadKardex.saldo_cantidad = nuevoStock;
      payloadKardex.saldo_costo_unitario = Number(nuevoCostoPromedio.toFixed(2));
      payloadKardex.saldo_total = Number((nuevoStock * nuevoCostoPromedio).toFixed(2));
    } else {
      if (nuevoStock < cantidad) {
        throw new Error(`Stock insuficiente. Disponible: ${nuevoStock}, Solicitado: ${cantidad}`);
      }
      nuevoStock = nuevoStock - cantidad;

      payloadKardex.cant_salida = cantidad;
      payloadKardex.costo_salida = nuevoCostoPromedio;
      payloadKardex.total_salida = cantidad * nuevoCostoPromedio;
      payloadKardex.saldo_cantidad = nuevoStock;
      payloadKardex.saldo_costo_unitario = Number(nuevoCostoPromedio.toFixed(2));
      payloadKardex.saldo_total = Number((nuevoStock * nuevoCostoPromedio).toFixed(2));
    }

    // 2. Insertar en kardex_movimientos (el trigger de la BD o actualización directa mantendrá el producto)
    const { data: movInserted, error: movErr } = await supabase
      .from('kardex_movimientos')
      .insert([payloadKardex])
      .select()
      .single();

    if (movErr) throw new Error(movErr.message || 'Error al registrar movimiento en kardex');

    // 3. Actualizar producto en tabla
    await supabase
      .from('productos')
      .update({
        stock: nuevoStock,
        precio_compra: Number(nuevoCostoPromedio.toFixed(2)),
        updated_at: new Date().toISOString()
      })
      .eq('id', producto.id);

    return {
      id: movInserted.id,
      fecha: movInserted.fecha,
      productoId: movInserted.producto_id,
      productoCodigo: movInserted.producto_codigo,
      productoDescripcion: movInserted.producto_descripcion,
      tipoMovimiento: movInserted.tipo_movimiento,
      tipoOperacion: movInserted.tipo_operacion,
      documentoTipo: movInserted.documento_tipo,
      documentoNumero: movInserted.documento_numero,
      detalle: movInserted.detalle,
      almacen: movInserted.almacen,
      cantEntrada: Number(movInserted.cant_entrada) || 0,
      costoEntrada: Number(movInserted.costo_entrada) || 0,
      totalEntrada: Number(movInserted.total_entrada) || 0,
      cantSalida: Number(movInserted.cant_salida) || 0,
      costoSalida: Number(movInserted.costo_salida) || 0,
      totalSalida: Number(movInserted.total_salida) || 0,
      saldoCantidad: Number(movInserted.saldo_cantidad) || 0,
      saldoCostoUnitario: Number(movInserted.saldo_costo_unitario) || 0,
      saldoTotal: Number(movInserted.saldo_total) || 0
    };
  }
};
