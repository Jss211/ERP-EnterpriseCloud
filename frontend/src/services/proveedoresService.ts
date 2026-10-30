// Servicio de Proveedores conectado directamente a Supabase PostgreSQL
import { supabase } from '@/lib/supabase';
import { migoService } from './migoService';

export interface ProveedorFormData {
  tipo_persona: 'NATURAL' | 'JURIDICA';
  documento: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  condicion_pago: number; // En días, ej: 0 (contado), 15, 30, 60, 90 días
}

export interface EntradaHistorialProveedor {
  id: string;
  fecha: string;
  accion: string;
  detalle: string;
}

export interface Proveedor extends ProveedorFormData {
  id: string;
  estado: string;
  dias_inactivo?: number;
  fecha_registro: string;
  historial: EntradaHistorialProveedor[];
}

export const proveedoresService = {
  // Obtener proveedores directamente desde Supabase
  getProveedores: async (strict = false): Promise<Proveedor[]> => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select(`
          id,
          tipo_persona,
          documento,
          nombre,
          email,
          telefono,
          direccion,
          condicion_pago,
          estado,
          dias_inactivo,
          fecha_registro,
          historial:proveedores_historial(
            id,
            fecha,
            accion,
            detalle
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al obtener proveedores de Supabase:', error.message);
        if (strict) throw new Error('No se pudieron cargar los proveedores. Intenta nuevamente.');
        return [];
      }

      return (data || []).map((p: any) => ({
        id: p.id,
        tipo_persona: p.tipo_persona || 'JURIDICA',
        documento: p.documento || '',
        nombre: p.nombre || '',
        email: p.email || '',
        telefono: p.telefono || '',
        direccion: p.direccion || '',
        condicion_pago: Number(p.condicion_pago) || 30,
        estado: p.estado || 'Activo',
        dias_inactivo: Number(p.dias_inactivo) || 0,
        fecha_registro: p.fecha_registro || new Date().toISOString(),
        historial: Array.isArray(p.historial) ? p.historial : []
      }));
    } catch (err) {
      console.error('Error inesperado en getProveedores:', err);
      if (strict) throw new Error('No se pudieron cargar los proveedores. Intenta nuevamente.');
      return [];
    }
  },

  // Crear un nuevo proveedor en Supabase
  createProveedor: async (proveedor: ProveedorFormData): Promise<Proveedor> => {
    const tipoDoc = proveedor.documento.length === 8 ? 'DNI' : 'RUC';

    const { data, error } = await supabase
      .from('proveedores')
      .insert([{
        tipo_persona: proveedor.tipo_persona,
        tipo_documento: tipoDoc,
        documento: proveedor.documento.trim(),
        nombre: proveedor.nombre.trim(),
        email: proveedor.email.trim(),
        telefono: proveedor.telefono.trim(),
        direccion: proveedor.direccion.trim(),
        condicion_pago: Number(proveedor.condicion_pago) || 30,
        estado: 'Activo',
        dias_inactivo: 0,
        fecha_registro: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear proveedor en Supabase');

    // Registrar evento inicial en historial
    await supabase.from('proveedores_historial').insert([{
      proveedor_id: data.id,
      accion: 'Creación',
      detalle: `Proveedor registrado en el sistema con ${tipoDoc} ${proveedor.documento}.`
    }]);

    return {
      id: data.id,
      tipo_persona: data.tipo_persona,
      documento: data.documento,
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      direccion: data.direccion,
      condicion_pago: Number(data.condicion_pago) || 30,
      estado: data.estado || 'Activo',
      dias_inactivo: 0,
      fecha_registro: data.fecha_registro || new Date().toISOString(),
      historial: [{
        id: 'hp-1',
        fecha: new Date().toISOString(),
        accion: 'Creación',
        detalle: `Proveedor registrado en el sistema con ${tipoDoc} ${proveedor.documento}.`
      }]
    };
  },

  // Actualizar un proveedor existente en Supabase
  updateProveedor: async (id: string, proveedorData: ProveedorFormData): Promise<Proveedor> => {
    const tipoDoc = proveedorData.documento.length === 8 ? 'DNI' : 'RUC';

    const { data, error } = await supabase
      .from('proveedores')
      .update({
        tipo_persona: proveedorData.tipo_persona,
        tipo_documento: tipoDoc,
        documento: proveedorData.documento.trim(),
        nombre: proveedorData.nombre.trim(),
        email: proveedorData.email.trim(),
        telefono: proveedorData.telefono.trim(),
        direccion: proveedorData.direccion.trim(),
        condicion_pago: Number(proveedorData.condicion_pago) || 30,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar proveedor');

    // Registrar evento en historial
    await supabase.from('proveedores_historial').insert([{
      proveedor_id: id,
      accion: 'Actualización',
      detalle: 'Datos comerciales del proveedor actualizados.'
    }]);

    const proveedores = await proveedoresService.getProveedores();
    const encontrado = proveedores.find(p => p.id === id);
    if (!encontrado) throw new Error('Proveedor actualizado no encontrado');
    return encontrado;
  },

  // Eliminar un proveedor de Supabase
  deleteProveedor: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('proveedores')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al eliminar proveedor');
  },

  // Consultar RUC o DNI usando Migo API oficial de SUNAT / RENIEC
  consultarRUC: async (ruc: string) => {
    return await migoService.consultarRuc(ruc);
  },

  consultarDNI: async (dni: string) => {
    return await migoService.consultarDni(dni);
  }
};
