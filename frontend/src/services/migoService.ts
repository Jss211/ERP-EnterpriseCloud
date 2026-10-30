// Servicio de integración con MIGO API (migo.pe) para consultas de RUC (SUNAT) y DNI (RENIEC)

const MIGO_BASE_URL = 'https://api.migo.pe/api/v1';

export interface MigoRucResponse {
  success: boolean;
  ruc?: string;
  nombre_o_razon_social?: string;
  estado_del_contribuyente?: string;
  condicion_de_domicilio?: string;
  direccion?: string;
  direccion_simple?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  ubigeo?: string;
  es_agente_de_retencion?: boolean;
  message?: string;
}

export interface MigoDniResponse {
  success: boolean;
  dni?: string;
  nombre?: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  codigo_verificacion?: string;
  message?: string;
}

export const migoService = {
  // Obtiene el token desde variables de entorno con fallback
  getToken: (): string => {
    return import.meta.env.VITE_MIGO_TOKEN?.trim() || 'a451fa30-662c-4de1-969c-58a52149d593';
  },

  // Consulta RUC en SUNAT vía Migo API
  consultarRuc: async (ruc: string): Promise<MigoRucResponse> => {
    const cleanRuc = ruc.trim();
    if (cleanRuc.length !== 11) {
      throw new Error('El RUC debe tener 11 dígitos.');
    }

    const token = migoService.getToken();

    // Si tiene token de Migo configurado
    if (token) {
      try {
        const response = await fetch(`${MIGO_BASE_URL}/ruc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            token: token,
            ruc: cleanRuc,
          }),
        });

        const data = await response.json();
        if (response.ok && data.success) {
          return data;
        } else {
          throw new Error(data.message || 'No se encontró información para el RUC ingresado en Migo API.');
        }
      } catch (err: any) {
        console.warn('Fallo consulta Migo API, intentando respaldo...', err);
      }
    }

    // Respaldo de contingencia gratuito en caso de token no configurado o cuota agotada
    try {
      const backupRes = await fetch(`https://openruc.com/api/ruc/${cleanRuc}`);
      if (backupRes.ok) {
        const bData = await backupRes.json();
        return {
          success: true,
          ruc: cleanRuc,
          nombre_o_razon_social: bData.razon_social || bData.nombre,
          direccion: bData.direccion || '',
          estado_del_contribuyente: bData.estado || 'ACTIVO',
          condicion_de_domicilio: bData.condicion || 'HABIDO',
        };
      }
    } catch (e) {
      console.error('Error en respaldo de RUC:', e);
    }

    throw new Error('No se pudo consultar el RUC. Verifica el token de Migo o tu conexión a internet.');
  },

  // Consulta DNI en RENIEC vía Migo API
  consultarDni: async (dni: string): Promise<MigoDniResponse> => {
    const cleanDni = dni.trim();
    if (cleanDni.length !== 8) {
      throw new Error('El DNI debe tener 8 dígitos.');
    }

    const token = migoService.getToken();

    if (token) {
      try {
        const response = await fetch(`${MIGO_BASE_URL}/dni`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            token: token,
            dni: cleanDni,
          }),
        });

        const data = await response.json();
        if (response.ok && data.success) {
          return data;
        } else {
          throw new Error(data.message || 'No se encontró el DNI ingresado en RENIEC.');
        }
      } catch (err: any) {
        console.warn('Fallo consulta DNI en Migo API:', err);
        throw err;
      }
    }

    // Si aún no ha colocado el token de Migo
    throw new Error('Falta configurar tu Token de Migo en el archivo .env (VITE_MIGO_TOKEN) para consultar DNI con RENIEC.');
  },
};

export default migoService;
