// Servicio de Cotizaciones conectado directamente a Supabase PostgreSQL
import { supabase } from '@/lib/supabase';

export interface CotizacionItem {
  /** Frontend selection; existing document schema persists the historical description. */
  producto_id?: string;
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface CotizacionFormData {
  cliente_id: string;
  cliente_nombre: string;
  fecha: string;
  validez_dias: number;
  moneda: 'PEN' | 'USD';
  items: CotizacionItem[];
  estado: 'Borrador' | 'Enviada' | 'Aprobada' | 'Rechazada';
  notas: string;
}

export interface Cotizacion extends CotizacionFormData {
  id: string;
  numero: string; // Ej: COT-0001
  subtotal: number;
  igv: number;
  total: number;
  fecha_creacion: string;
}

export const cotizacionesService = {
  // Obtener cotizaciones reales desde Supabase
  getCotizaciones: async (): Promise<Cotizacion[]> => {
    try {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select(`
          id,
          numero,
          cliente_id,
          cliente_nombre,
          fecha,
          validez_dias,
          moneda,
          subtotal,
          igv,
          total,
          estado,
          notas,
          created_at,
          items:cotizaciones_items(
            id,
            descripcion,
            cantidad,
            precio_unitario,
            subtotal
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al obtener cotizaciones de Supabase:', error.message);
        return [];
      }

      return (data || []).map((c: any) => ({
        id: c.id,
        numero: c.numero || '',
        cliente_id: c.cliente_id || '',
        cliente_nombre: c.cliente_nombre || '',
        fecha: c.fecha || new Date().toISOString(),
        validez_dias: Number(c.validez_dias) || 15,
        moneda: c.moneda || 'PEN',
        subtotal: Number(c.subtotal) || 0,
        igv: Number(c.igv) || 0,
        total: Number(c.total) || 0,
        estado: c.estado || 'Borrador',
        notas: c.notas || '',
        fecha_creacion: c.created_at || new Date().toISOString(),
        items: Array.isArray(c.items) ? c.items.map((it: any) => ({
          id: it.id,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 0,
          precio_unitario: Number(it.precio_unitario) || 0,
          subtotal: Number(it.subtotal) || 0
        })) : []
      }));
    } catch (err) {
      console.error('Error en getCotizaciones:', err);
      return [];
    }
  },

  // Crear cotización en Supabase
  createCotizacion: async (data: CotizacionFormData): Promise<Cotizacion> => {
    const subtotal = data.items.reduce((acc, item) => acc + item.subtotal, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    // Generar correlativo
    const { count } = await supabase.from('cotizaciones').select('*', { count: 'exact', head: true });
    const correlativo = String((count || 0) + 1).padStart(4, '0');
    const numero = `COT-${correlativo}`;

    const { data: nuevaCot, error: cotErr } = await supabase
      .from('cotizaciones')
      .insert([{
        numero,
        cliente_id: data.cliente_id || null,
        cliente_nombre: data.cliente_nombre,
        fecha: data.fecha || new Date().toISOString(),
        validez_dias: Number(data.validez_dias) || 15,
        moneda: data.moneda,
        subtotal,
        igv,
        total,
        estado: data.estado || 'Borrador',
        notas: data.notas || ''
      }])
      .select()
      .single();

    if (cotErr) throw new Error(cotErr.message || 'Error al guardar cotización en Supabase');

    // Insertar items de cotización
    if (data.items.length > 0) {
      const itemsPayload = data.items.map(it => ({
        cotizacion_id: nuevaCot.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal
      }));
      await supabase.from('cotizaciones_items').insert(itemsPayload);
    }

    return {
      id: nuevaCot.id,
      numero: nuevaCot.numero,
      cliente_id: nuevaCot.cliente_id,
      cliente_nombre: nuevaCot.cliente_nombre,
      fecha: nuevaCot.fecha,
      validez_dias: nuevaCot.validez_dias,
      moneda: nuevaCot.moneda,
      subtotal: Number(nuevaCot.subtotal),
      igv: Number(nuevaCot.igv),
      total: Number(nuevaCot.total),
      estado: nuevaCot.estado,
      notas: nuevaCot.notas,
      fecha_creacion: nuevaCot.created_at,
      items: data.items
    };
  },

  // Actualizar cotización en Supabase
  updateCotizacion: async (id: string, data: CotizacionFormData): Promise<Cotizacion> => {
    const subtotal = data.items.reduce((acc, item) => acc + item.subtotal, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const { data: updated, error } = await supabase
      .from('cotizaciones')
      .update({
        cliente_id: data.cliente_id || null,
        cliente_nombre: data.cliente_nombre,
        fecha: data.fecha,
        validez_dias: data.validez_dias,
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

    if (error) throw new Error(error.message || 'Error al actualizar cotización');

    // Reemplazar items
    await supabase.from('cotizaciones_items').delete().eq('cotizacion_id', id);
    if (data.items.length > 0) {
      const itemsPayload = data.items.map(it => ({
        cotizacion_id: id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal
      }));
      await supabase.from('cotizaciones_items').insert(itemsPayload);
    }

    return {
      id: updated.id,
      numero: updated.numero,
      cliente_id: updated.cliente_id,
      cliente_nombre: updated.cliente_nombre,
      fecha: updated.fecha,
      validez_dias: updated.validez_dias,
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

  // Eliminar cotización de Supabase
  deleteCotizacion: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('cotizaciones')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al eliminar cotización');
  },

  // Cambiar estado de cotización
  cambiarEstado: async (id: string, nuevoEstado: Cotizacion['estado']): Promise<Cotizacion> => {
    const { error } = await supabase
      .from('cotizaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al cambiar estado');

    const cotizaciones = await cotizacionesService.getCotizaciones();
    const encontrado = cotizaciones.find(c => c.id === id);
    if (!encontrado) throw new Error('Cotización no encontrada');
    return encontrado;
  }
};
