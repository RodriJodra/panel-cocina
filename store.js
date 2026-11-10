// Almacenamiento de datos. Dos implementaciones con la misma interfaz:
//  - local: localStorage (solo este dispositivo; sin agenda ni importar recetas)
//  - supabase: base de datos compartida, en tiempo real, con funciones en la nube

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  Date.now().toString(36) + Math.random().toString(36).slice(2);

const CLAVE_LOCAL = 'panel-cocina:datos';
const VACIO = () => ({ items: [], menu: [], recetas: [] });

function leerLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_LOCAL));
    return { items: d?.items ?? [], menu: d?.menu ?? [], recetas: d?.recetas ?? [] };
  } catch {
    return VACIO();
  }
}

function escribirLocal(datos) {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(datos));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export class NecesitaSupabase extends Error {
  constructor() {
    super('Esta función necesita Supabase');
  }
}

export function createLocalStore() {
  const canal = 'BroadcastChannel' in globalThis ? new BroadcastChannel('panel-cocina') : null;
  const oyentes = new Set();
  const avisarLocal = () => oyentes.forEach((fn) => fn());
  if (canal) canal.onmessage = avisarLocal;

  const cambiar = (fn) => {
    const datos = leerLocal();
    const r = fn(datos);
    escribirLocal(datos);
    avisarLocal();
    canal?.postMessage('cambio');
    return r;
  };
  const ahora = () => new Date().toISOString();

  return {
    mode: 'local',
    async load() {
      return leerLocal();
    },
    async addItems(lista, textos, extra = {}) {
      cambiar((d) => {
        for (const texto of textos) {
          d.items.push({
            id: uid(), lista, texto, hecho: false,
            asignado: extra.asignado ?? null, repetir: extra.repetir ?? null, proxima: extra.proxima ?? null,
            creado: ahora(),
          });
        }
      });
    },
    async updateItem(id, cambios) {
      cambiar((d) => {
        const item = d.items.find((i) => i.id === id);
        if (item) Object.assign(item, cambios);
      });
    },
    async removeItems(ids) {
      const quitar = new Set(ids);
      cambiar((d) => {
        d.items = d.items.filter((i) => !quitar.has(i.id));
      });
    },
    async setMenu(dia, comida, texto) {
      cambiar((d) => {
        d.menu = d.menu.filter((m) => !(m.dia === dia && m.comida === comida));
        if (texto) d.menu.push({ dia, comida, texto });
      });
    },
    async clearMenu() {
      cambiar((d) => {
        d.menu = [];
      });
    },
    async saveReceta(receta) {
      return cambiar((d) => {
        const r = { ...receta, id: receta.id ?? uid(), actualizado: ahora() };
        r.creado ??= ahora();
        d.recetas = d.recetas.filter((x) => x.id !== r.id).concat(r);
        return r.id;
      });
    },
    async deleteReceta(id) {
      cambiar((d) => {
        d.recetas = d.recetas.filter((x) => x.id !== id);
      });
    },
    async agenda() {
      throw new NecesitaSupabase();
    },
    async importarReceta() {
      throw new NecesitaSupabase();
    },
    onChange(fn) {
      oyentes.add(fn);
    },
  };
}

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export async function createSupabaseStore({ supabaseUrl, supabaseAnonKey }) {
  const { createClient } = await import(SUPABASE_ESM);
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'panel-cocina-auth' },
  });
  const ok = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  const ahora = () => new Date().toISOString();
  async function funcion(nombre, body) {
    const { data, error } = await sb.functions.invoke(nombre, { body });
    if (error) {
      // intenta leer el mensaje de error que devuelve la función
      let msg = error.message;
      try {
        msg = (await error.context?.json())?.error ?? msg;
      } catch {
        /* sin cuerpo */
      }
      throw new Error(msg);
    }
    return data;
  }
  let canal = null;

  return {
    mode: 'supabase',
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      ok(await sb.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async load() {
      const [items, menu, recetas] = await Promise.all([
        sb.from('items').select('id,lista,texto,hecho,asignado,repetir,proxima,creado').order('creado'),
        sb.from('menu').select('dia,comida,texto'),
        sb.from('recetas').select('*').order('titulo'),
      ]);
      return { items: ok(items), menu: ok(menu), recetas: ok(recetas) };
    },
    async addItems(lista, textos, extra = {}) {
      const filas = textos.map((texto) => ({
        lista, texto, asignado: extra.asignado ?? null, repetir: extra.repetir ?? null, proxima: extra.proxima ?? null,
      }));
      ok(await sb.from('items').insert(filas));
    },
    async updateItem(id, cambios) {
      ok(await sb.from('items').update({ ...cambios, actualizado: ahora() }).eq('id', id));
    },
    async removeItems(ids) {
      if (ids.length) ok(await sb.from('items').delete().in('id', ids));
    },
    async setMenu(dia, comida, texto) {
      if (texto) {
        ok(await sb.from('menu').upsert({ dia, comida, texto, actualizado: ahora() }, { onConflict: 'dia,comida' }));
      } else {
        ok(await sb.from('menu').delete().eq('dia', dia).eq('comida', comida));
      }
    },
    async clearMenu() {
      ok(await sb.from('menu').delete().gte('dia', 0));
    },
    async saveReceta(receta) {
      const { id, titulo, raciones, tiempo, ingredientes, pasos, fuente } = receta;
      const fila = { titulo, raciones, tiempo, ingredientes, pasos, fuente, actualizado: ahora() };
      if (id) {
        ok(await sb.from('recetas').update(fila).eq('id', id));
        return id;
      }
      const data = ok(await sb.from('recetas').insert(fila).select('id').single());
      return data.id;
    },
    async deleteReceta(id) {
      ok(await sb.from('recetas').delete().eq('id', id));
    },
    async agenda() {
      return funcion('calendario');
    },
    async importarReceta(url) {
      return funcion('importar-receta', { url });
    },
    onChange(fn) {
      canal?.unsubscribe();
      canal = sb.channel('panel-cocina');
      for (const table of ['items', 'menu', 'recetas']) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table }, fn);
      }
      canal.subscribe();
    },
  };
}
