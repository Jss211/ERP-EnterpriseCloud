// Servicio de Ventas conectado directamente a Supabase PostgreSQL
import { supabase } from '@/lib/supabase';

export interface VentaItem {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface VentaFormData {
  numero?: string;
  cliente_id: string;
  cliente_nombre: string;
  fecha: string;
  metodo_pago: 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Crédito';
  moneda: 'PEN' | 'USD';
  items: VentaItem[];
  estado: 'Pendiente' | 'Completada' | 'Anulada';
  notas: string;
}

export interface Venta extends VentaFormData {
  id: string;
  numero: string; // Ej: VEN-0001 o OV-2026-XXXX
  subtotal: number;
  igv: number;
  total: number;
  fecha_creacion: string;
}

export const ventasService = {
  // Obtener ventas reales desde Supabase
  getVentas: async (strict = false, financialRead = false, completeRead = false): Promise<Venta[]> => {
    try {
      const query = () => supabase
        .from('ventas')
        .select(`
          id,
          numero,
          cliente_id,
          cliente_nombre,
          fecha,
          metodo_pago,
          moneda,
          subtotal,
          igv,
          total,
          estado,
          notas,
          created_at,
          items:ventas_items(
            id,
            descripcion,
            cantidad,
            precio_unitario,
            subtotal
          )
        `)
        .order('created_at', { ascending: false });

      let { data, error } = await ((financialRead || completeRead) ? query().order('id', { ascending: true }).range(0,999) : query());
      if ((financialRead || completeRead) && !error) {
        const all: any[] = [...(data || [])];
        const ids = new Set(all.map(row => row.id));
        let last = data || [];
        for (let page = 1; last.length === 1000; page++) {
          const next = await query().order('id', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
          if (next.error) throw next.error;
          last = next.data || [];
          for (const row of last) {
            if (ids.has(row.id)) throw new Error('Las ventas cambiaron durante la consulta financiera. Reintenta.');
            ids.add(row.id); all.push(row);
          }
        }
        data = all;
      }

      if (error) {
        console.error('Error al obtener ventas de Supabase:', error.message);
        if (strict) throw new Error('No se pudieron cargar las ventas. Intenta nuevamente.');
        return [];
      }

      if (financialRead && (data || []).some((v: any) => v.total === undefined || v.total === null || v.total === '' || !Number.isFinite(Number(v.total)) || !['PEN','USD'].includes(v.moneda) || !['Pendiente','Completada','Anulada'].includes(v.estado))) throw new Error('Una venta no tiene importe, moneda o estado financiero disponible.');
      return (data || []).map((v: any) => ({
        id: v.id,
        numero: v.numero || '',
        cliente_id: v.cliente_id || '',
        cliente_nombre: v.cliente_nombre || '',
        fecha: v.fecha || ((financialRead || completeRead) ? '' : new Date().toISOString()),
        metodo_pago: v.metodo_pago || 'Efectivo',
        moneda: v.moneda || 'PEN',
        subtotal: Number(v.subtotal) || 0,
        igv: Number(v.igv) || 0,
        total: Number(v.total) || 0,
        estado: v.estado || 'Completada',
        notas: v.notas || '',
        fecha_creacion: v.created_at || new Date().toISOString(),
        items: Array.isArray(v.items) ? v.items.map((it: any) => ({
          id: it.id,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 0,
          precio_unitario: Number(it.precio_unitario) || 0,
          subtotal: Number(it.subtotal) || 0
        })) : []
      }));
    } catch (err) {
      console.error('Error en getVentas:', err);
      if (strict) throw new Error('No se pudieron cargar las ventas. Intenta nuevamente.');
      return [];
    }
  },

  // Crear venta y sus items en Supabase
  createVenta: async (data: VentaFormData): Promise<Venta> => {
    const subtotal = data.items.reduce((acc, item) => acc + item.subtotal, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    // Generar correlativo o usar el número provisto (ej: OV-2026-XXXX)
    let numero = data.numero;
    if (!numero) {
      const { count } = await supabase.from('ventas').select('*', { count: 'exact', head: true });
      const correlativo = String((count || 0) + 1).padStart(4, '0');
      numero = `VEN-${correlativo}`;
    }

    const { data: nuevaVenta, error: ventaErr } = await supabase
      .from('ventas')
      .insert([{
        numero,
        cliente_id: data.cliente_id || null,
        cliente_nombre: data.cliente_nombre,
        fecha: data.fecha || new Date().toISOString(),
        metodo_pago: data.metodo_pago,
        moneda: data.moneda,
        subtotal,
        igv,
        total,
        estado: data.estado || 'Completada',
        notas: data.notas || ''
      }])
      .select()
      .single();

    if (ventaErr) throw new Error(ventaErr.message || 'Error al guardar venta en Supabase');

    // Insertar items de venta
    if (data.items.length > 0) {
      const itemsPayload = data.items.map(it => ({
        venta_id: nuevaVenta.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal
      }));
      await supabase.from('ventas_items').insert(itemsPayload);
    }

    return {
      id: nuevaVenta.id,
      numero: nuevaVenta.numero,
      cliente_id: nuevaVenta.cliente_id,
      cliente_nombre: nuevaVenta.cliente_nombre,
      fecha: nuevaVenta.fecha,
      metodo_pago: nuevaVenta.metodo_pago,
      moneda: nuevaVenta.moneda,
      subtotal: Number(nuevaVenta.subtotal),
      igv: Number(nuevaVenta.igv),
      total: Number(nuevaVenta.total),
      estado: nuevaVenta.estado,
      notas: nuevaVenta.notas,
      fecha_creacion: nuevaVenta.created_at,
      items: data.items
    };
  },

  // Actualizar venta en Supabase
  updateVenta: async (id: string, data: VentaFormData): Promise<Venta> => {
    const subtotal = data.items.reduce((acc, item) => acc + item.subtotal, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const { data: updated, error } = await supabase
      .from('ventas')
      .update({
        cliente_id: data.cliente_id || null,
        cliente_nombre: data.cliente_nombre,
        fecha: data.fecha,
        metodo_pago: data.metodo_pago,
        moneda: data.moneda,
        subtotal,
        igv,
        total,
        estado: data.estado,
        notas: data.notas
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar venta');

    // Reemplazar items
    await supabase.from('ventas_items').delete().eq('venta_id', id);
    if (data.items.length > 0) {
      const itemsPayload = data.items.map(it => ({
        venta_id: id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal
      }));
      await supabase.from('ventas_items').insert(itemsPayload);
    }

    return {
      id: updated.id,
      numero: updated.numero,
      cliente_id: updated.cliente_id,
      cliente_nombre: updated.cliente_nombre,
      fecha: updated.fecha,
      metodo_pago: updated.metodo_pago,
      moneda: updated.moneda,
      subtotal: Number(updated.subtotal),
      igv: Number(updated.igv),
      total: Number(updated.total),
      estado: updated.estado,
      notas: updated.notas,
      fecha_creacion: updated.created_at,
      items: data.items
    };
  },

  // Eliminar venta
  deleteVenta: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('ventas')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al eliminar venta');
  },

  // Cambiar estado de venta
  cambiarEstado: async (id: string, nuevoEstado: Venta['estado']): Promise<Venta> => {
    const { data: updated, error } = await supabase
      .from('ventas')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al cambiar estado de venta');

    const ventas = await ventasService.getVentas();
    const encontrado = ventas.find(v => v.id === id);
    if (!encontrado) throw new Error('Venta no encontrada');
    return encontrado;
  }
};
