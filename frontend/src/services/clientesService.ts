// Servicio de Clientes conectado directamente a Supabase PostgreSQL
import { supabase } from '@/lib/supabase';
import { migoService } from './migoService';

export interface ClienteFormData {
  tipo_persona: 'NATURAL' | 'JURIDICA';
  documento: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  limite_credito: number;
}

export interface EntradaHistorial {
  id: string;
  fecha: string;
  accion: string;
  detalle: string;
}

export interface Cliente extends ClienteFormData {
  id: string;
  estado: string;
  dias_inactivo?: number;
  fecha_registro: string;
  historial: EntradaHistorial[];
}

export const clientesService = {
  // Obtener clientes directamente desde Supabase
  getClientes: async (strict = false): Promise<Cliente[]> => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select(`
          id,
          tipo_persona,
          documento,
          nombre,
          email,
          telefono,
          direccion,
          limite_credito,
          estado,
          dias_inactivo,
          fecha_registro,
          historial:clientes_historial(
            id,
            fecha,
            accion,
            detalle
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al obtener clientes de Supabase:', error.message);
        if (strict) throw new Error('No se pudieron cargar los clientes. Reintenta.');
        return [];
      }

      return (data || []).map((c: any) => ({
        id: c.id,
        tipo_persona: c.tipo_persona || 'NATURAL',
        documento: c.documento || '',
        nombre: c.nombre || '',
        email: c.email || '',
        telefono: c.telefono || '',
        direccion: c.direccion || '',
        limite_credito: Number(c.limite_credito) || 0,
        estado: c.estado || 'Activo',
        dias_inactivo: Number(c.dias_inactivo) || 0,
        fecha_registro: c.fecha_registro || new Date().toISOString(),
        historial: Array.isArray(c.historial) ? c.historial : []
      }));
    } catch (err) {
      console.error('Error inesperado en getClientes:', err);
      if (strict) throw new Error('No se pudieron cargar los clientes. Reintenta.');
      return [];
    }
  },

  // Crear un nuevo cliente en Supabase
  createCliente: async (cliente: ClienteFormData): Promise<Cliente> => {
    const tipoDoc = cliente.documento.length === 8 ? 'DNI' : 'RUC';

    const { data, error } = await supabase
      .from('clientes')
      .insert([{
        tipo_persona: cliente.tipo_persona,
        tipo_documento: tipoDoc,
        documento: cliente.documento.trim(),
        nombre: cliente.nombre.trim(),
        email: cliente.email.trim(),
        telefono: cliente.telefono.trim(),
        direccion: cliente.direccion.trim(),
        limite_credito: Number(cliente.limite_credito) || 0,
        estado: 'Activo',
        dias_inactivo: 0,
        fecha_registro: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear cliente en Supabase');

    // Registrar evento en la tabla de historial
    await supabase.from('clientes_historial').insert([{
      cliente_id: data.id,
      accion: 'Creación',
      detalle: `Cliente registrado en el sistema con ${tipoDoc} ${cliente.documento}.`
    }]);

    return {
      id: data.id,
      tipo_persona: data.tipo_persona,
      documento: data.documento,
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      direccion: data.direccion,
      limite_credito: Number(data.limite_credito) || 0,
      estado: data.estado || 'Activo',
      dias_inactivo: 0,
      fecha_registro: data.fecha_registro || new Date().toISOString(),
      historial: [{
        id: 'h-1',
        fecha: new Date().toISOString(),
        accion: 'Creación',
        detalle: `Cliente registrado en el sistema con ${tipoDoc} ${cliente.documento}.`
      }]
    };
  },

  // Actualizar un cliente existente en Supabase
  updateCliente: async (id: string, clienteData: ClienteFormData): Promise<Cliente> => {
    const tipoDoc = clienteData.documento.length === 8 ? 'DNI' : 'RUC';

    const { data, error } = await supabase
      .from('clientes')
      .update({
        tipo_persona: clienteData.tipo_persona,
        tipo_documento: tipoDoc,
        documento: clienteData.documento.trim(),
        nombre: clienteData.nombre.trim(),
        email: clienteData.email.trim(),
        telefono: clienteData.telefono.trim(),
        direccion: clienteData.direccion.trim(),
        limite_credito: Number(clienteData.limite_credito) || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar cliente');

    // Registrar evento de actualización en el historial
    await supabase.from('clientes_historial').insert([{
      cliente_id: id,
      accion: 'Actualización',
      detalle: 'Datos generales del cliente actualizados.'
    }]);

    const clienteActualizado = await clientesService.getClientes();
    const encontrado = clienteActualizado.find(c => c.id === id);
    if (!encontrado) throw new Error('Cliente actualizado no encontrado');
    return encontrado;
  },

  // Eliminar un cliente de Supabase
  deleteCliente: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Error al eliminar cliente');
  },

  // Consultar RUC o DNI usando Migo API oficial de SUNAT / RENIEC
  consultarRUC: async (ruc: string) => {
    return await migoService.consultarRuc(ruc);
  },

  consultarDNI: async (dni: string) => {
    return await migoService.consultarDni(dni);
  }
};
