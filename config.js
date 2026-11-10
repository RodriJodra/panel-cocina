// ─────────────────────────────────────────────────────────────
//  Configuración del panel de cocina. Edita solo este archivo.
// ─────────────────────────────────────────────────────────────

// Abre una app de Android por su paquete; si no está instalada, abre la web.
const app = (paquete, web) => {
  const u = new URL(web);
  return (
    `intent://${u.host}${u.pathname}#Intent;scheme=https;package=${paquete};` +
    `S.browser_fallback_url=${encodeURIComponent(web)};end`
  );
};

export const CONFIG = {
  // Supabase. Si lo dejas vacío, el panel funciona en "modo local":
  // los datos se guardan solo en ese dispositivo, sin agenda ni importar recetas.
  // Los encuentras en Supabase → Project Settings → API.
  supabaseUrl: '',      // p. ej. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',  // la clave "anon public" o "publishable" (es pública por diseño)

  // Personas de la casa, para asignar tareas. El orden decide el color
  // y coincide con el orden de los calendarios en Supabase (el tercero, el compartido).
  personas: ['Rodrigo', 'Sara'],

  // Botón "Compra": abre la app de Alexa (o, si no está, la lista en amazon.es).
  compraUrl:
    'intent://#Intent;package=com.amazon.dee.app;' +
    'S.browser_fallback_url=https%3A%2F%2Fwww.amazon.es%2Falexaquantum%2Fsp%2FalexaShoppingList;end',

  // Botón "Ver": apps de vídeo. Puedes quitar, añadir o reordenar.
  apps: [
    { nombre: 'YouTube', url: app('com.google.android.youtube', 'https://www.youtube.com/') },
    { nombre: 'Prime Video', url: app('com.amazon.avod.thirdpartyclient', 'https://www.primevideo.com/') },
    { nombre: 'Disney+', url: app('com.disney.disneyplus', 'https://www.disneyplus.com/') },
    { nombre: 'HBO Max', url: app('com.wbd.stream', 'https://play.hbomax.com/') },
    { nombre: 'Movistar Plus+', url: app('es.plus.yomvi', 'https://ver.movistarplus.es/') },
  ],

  // Tiempo (Open-Meteo, gratis y sin clave). Cambia ciudad y coordenadas.
  ciudad: 'Madrid',
  latitud: 40.4168,
  longitud: -3.7038,

  // Mantener la pantalla encendida mientras el panel está abierto.
  pantallaSiempreEncendida: true,

  // Modo noche automático (tema oscuro) entre estas horas.
  nocheDesde: 22,
  nocheHasta: 7,
};
