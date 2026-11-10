import { CONFIG } from './config.js';
import { createLocalStore, createSupabaseStore } from './store.js';
import {
  $, $$, aviso, capitalizar, diasEntre, el, fechaCorta, isoDia, sumarDias, sumarMeses,
} from './util.js';
import { desbloquearAudio, iniciarTemporizadores } from './temporizadores.js';
import { iniciarAgenda } from './agenda.js';
import { abrirRecetas, actualizarRecetas, iniciarRecetas, recetaPorTitulo } from './recetas.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COMIDAS = [['comida', 'Comida'], ['cena', 'Cena']];
const VACIO = {
  tareas: 'Todo hecho. A descansar.',
  notas: 'Sin notas.',
};

// Repeticiones: d = días (cuenta desde que se hace), s = semanas y m = meses (respetan el calendario)
export const REPETICIONES = {
  d1: 'Cada día',
  d2: 'Cada 2 días',
  d3: 'Cada 3 días',
  s1: 'Cada semana',
  s2: 'Cada 2 semanas',
  m1: 'Cada mes',
};
const REPETICIONES_CORTO = { d1: 'Diaria', d2: 'Cada 2 días', d3: 'Cada 3 días', s1: 'Semanal', s2: 'Quincenal', m1: 'Mensual' };

let store = null;
let state = { items: [], menu: [], recetas: [] };
let arrancado = false;

const hoyIndice = () => (new Date().getDay() + 6) % 7; // lunes = 0

function setConexion(ok) {
  $('#estado').hidden = ok;
}

// ── datos ────────────────────────────────────────────────────

let cargando = false;
let otraVez = false;
async function refrescar() {
  if (!store) return;
  if (cargando) {
    otraVez = true;
    return;
  }
  cargando = true;
  try {
    do {
      otraVez = false;
      state = await store.load();
      render();
      setConexion(true);
    } while (otraVez);
  } catch (e) {
    console.error(e);
    setConexion(false);
  } finally {
    cargando = false;
  }
}

async function accion(fn) {
  if (!store) return;
  try {
    await fn();
    await refrescar();
  } catch (e) {
    console.error(e);
    aviso('No se ha podido guardar. ¿Hay conexión?', 'error');
  }
}

// ── tareas que se repiten ────────────────────────────────────

/** Próxima fecha de una tarea repetida al marcarla como hecha hoy */
export function siguienteFecha(repetir, proxima, hoy = isoDia()) {
  const unidad = repetir[0];
  const n = Number(repetir.slice(1));
  if (unidad === 'd') return sumarDias(hoy, n);
  const sumar = unidad === 's' ? (iso) => sumarDias(iso, 7 * n) : (iso) => sumarMeses(iso, n);
  let fecha = sumar(proxima && proxima <= hoy ? proxima : hoy);
  while (fecha <= hoy) fecha = sumar(fecha);
  return fecha;
}

const pendienteHoy = (item, hoy) => !item.repetir || !item.proxima || item.proxima <= hoy;

// ── render ───────────────────────────────────────────────────

function render() {
  renderTareas();
  renderNotas();
  renderMenu();
  actualizarRecetas();
}

function renderTareas() {
  const hoy = isoDia();
  const tareas = state.items.filter((i) => i.lista === 'tareas');
  const ahora = tareas
    .filter((t) => pendienteHoy(t, hoy))
    .sort(
      (a, b) =>
        Number(a.hecho) - Number(b.hecho) ||
        String(a.proxima ?? hoy).localeCompare(String(b.proxima ?? hoy)) ||
        String(a.creado).localeCompare(String(b.creado)),
    );
  const luego = tareas.filter((t) => !pendienteHoy(t, hoy)).sort((a, b) => a.proxima.localeCompare(b.proxima));

  const filas = ahora.length ? ahora.map((t) => tareaEl(t, hoy)) : [el('li', { class: 'vacio' }, VACIO.tareas)];
  if (luego.length) {
    filas.push(el('li', { class: 'separador' }, 'Próximamente'));
    filas.push(...luego.map((t) => tareaEl(t, hoy)));
  }
  $('#l-tareas').replaceChildren(...filas);
  $('#n-tareas').textContent = ahora.filter((t) => !t.hecho).length || '';
  $('[data-limpiar="tareas"]').hidden = !tareas.some((t) => t.hecho);
}

function tareaEl(item, hoy) {
  const futura = !pendienteHoy(item, hoy);
  const completar = () => {
    if (item.repetir) {
      const proxima = siguienteFecha(item.repetir, item.proxima, hoy);
      aviso(`Hecho. Vuelve ${diasEntre(hoy, proxima) === 1 ? 'mañana' : `el ${fechaCorta(proxima)}`}.`);
      return accion(() => store.updateItem(item.id, { proxima, hecho: false }));
    }
    return accion(() => store.updateItem(item.id, { hecho: !item.hecho }));
  };

  let detalle = null;
  if (item.repetir) {
    const atraso = item.proxima ? diasEntre(item.proxima, hoy) : 0;
    const cuando = futura ? fechaCorta(item.proxima) : atraso > 0 ? `atrasada ${atraso === 1 ? '1 día' : `${atraso} días`}` : null;
    detalle = el(
      'small',
      { class: `repite${atraso > 0 && !futura ? ' atrasada' : ''}` },
      `↻ ${REPETICIONES[item.repetir]?.toLowerCase() ?? ''}${cuando ? ` · ${cuando}` : ''}`,
    );
  }

  const indice = item.asignado ? CONFIG.personas.indexOf(item.asignado) : -1;
  return el(
    'li',
    { class: `item${item.hecho ? ' hecho' : ''}${futura ? ' futura' : ''}`, dataset: { id: item.id } },
    el(
      'button',
      { class: 'check', 'aria-label': item.hecho ? 'Marcar como pendiente' : 'Marcar como hecha', onclick: completar },
      el('span', { class: 'tick' }),
    ),
    el('span', { class: 'texto', onclick: completar }, item.texto, detalle),
    el(
      'button',
      {
        class: 'persona',
        dataset: { p: indice >= 0 ? String(indice % 2) : 'nadie' },
        'aria-label': 'Cambiar quién se encarga',
        onclick: () => {
          const opciones = [null, ...CONFIG.personas];
          const siguiente = opciones[(opciones.indexOf(item.asignado ?? null) + 1) % opciones.length];
          accion(() => store.updateItem(item.id, { asignado: siguiente }));
        },
      },
      item.asignado ?? 'Quién',
    ),
    el(
      'button',
      {
        class: 'borrar solo-editando',
        'aria-label': 'Borrar tarea',
        onclick: () => {
          if (confirm(`¿Borrar «${item.texto}»?`)) accion(() => store.removeItems([item.id]));
        },
      },
      '×',
    ),
  );
}

function renderNotas() {
  const notas = state.items
    .filter((i) => i.lista === 'notas')
    .sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
  $('#l-notas').replaceChildren(
    ...(notas.length
      ? notas.map((n) =>
          el(
            'li',
            { class: 'item' },
            el('span', { class: 'texto' }, n.texto),
            el(
              'button',
              { class: 'borrar', 'aria-label': 'Borrar nota', onclick: () => accion(() => store.removeItems([n.id])) },
              '×',
            ),
          ),
        )
      : [el('li', { class: 'vacio' }, VACIO.notas)]),
  );
  $('#n-notas').textContent = notas.length || '';
}

function construirMenu() {
  const tbody = $('#menu-body');
  DIAS.forEach((nombre, dia) => {
    const tr = el(
      'tr',
      { dataset: { dia } },
      el('th', { scope: 'row' }, el('span', { class: 'largo' }, nombre), el('span', { class: 'corto' }, nombre.slice(0, 3))),
    );
    for (const [comida, etiqueta] of COMIDAS) {
      const input = el('input', {
        type: 'text',
        'aria-label': `${etiqueta} del ${nombre.toLowerCase()}`,
        autocomplete: 'off',
        enterkeyhint: 'done',
        maxlength: '120',
        placeholder: '—',
        list: 'lista-recetas',
        dataset: { dia, comida },
      });
      input.addEventListener('change', () => accion(() => store.setMenu(dia, comida, input.value.trim())));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
      const abrir = el('button', { class: 'abrir-receta', type: 'button', 'aria-label': 'Abrir receta', hidden: true }, '📖');
      abrir.addEventListener('click', () => {
        const r = recetaPorTitulo(input.value);
        if (r) abrirRecetas(r.id);
      });
      tr.append(el('td', {}, el('div', { class: 'celda' }, input, abrir)));
    }
    tbody.append(tr);
  });
}

function renderMenu() {
  const hoy = hoyIndice();
  const valores = new Map(state.menu.map((m) => [`${m.dia}-${m.comida}`, m.texto]));
  $$('#menu-body tr').forEach((tr) => tr.classList.toggle('hoy', Number(tr.dataset.dia) === hoy));
  $$('#menu-body input').forEach((input) => {
    if (input !== document.activeElement) {
      input.value = valores.get(`${input.dataset.dia}-${input.dataset.comida}`) ?? '';
    }
    const boton = input.nextElementSibling;
    const tiene = Boolean(recetaPorTitulo(input.value));
    boton.hidden = !tiene;
    input.classList.toggle('con-receta', tiene);
  });
}

// ── formularios ──────────────────────────────────────────────

function prepararFormularios() {
  const repetir = $('#repetir-tarea');
  repetir.append(...Object.entries(REPETICIONES_CORTO).map(([v, t]) => el('option', { value: v }, t)));

  $$('form.nuevo').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.elements.texto;
      const lista = form.dataset.lista;
      const texto = capitalizar(input.value.trim()).slice(0, 500);
      if (!texto) return;
      const extra = {};
      if (lista === 'tareas' && repetir.value) {
        extra.repetir = repetir.value;
        extra.proxima = isoDia();
      }
      input.value = '';
      repetir.value = '';
      accion(() => store.addItems(lista, [texto], extra));
    });
  });

  $('[data-limpiar="tareas"]').addEventListener('click', () => {
    const ids = state.items.filter((i) => i.lista === 'tareas' && i.hecho && !i.repetir).map((i) => i.id);
    if (ids.length) accion(() => store.removeItems(ids));
  });

  $('#btn-editar-tareas').addEventListener('click', (e) => {
    const tarjeta = $('#t-tareas');
    tarjeta.classList.toggle('editando');
    e.currentTarget.textContent = tarjeta.classList.contains('editando') ? 'Listo' : 'Editar';
  });

  $('#btn-vaciar-menu').addEventListener('click', () => {
    if (confirm('¿Vaciar el menú de toda la semana?')) accion(() => store.clearMenu());
  });
}

// ── reloj y tema ─────────────────────────────────────────────

let ultimoDia = null;
function reloj() {
  const ahora = new Date();
  $('#hora').textContent = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  $('#fecha').textContent = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  if (ultimoDia !== null && ultimoDia !== ahora.getDate()) render();
  ultimoDia = ahora.getDate();
  aplicarTema();
}

function aplicarTema() {
  const h = new Date().getHours();
  const { nocheDesde: a, nocheHasta: b } = CONFIG;
  const noche = a > b ? h >= a || h < b : h >= a && h < b;
  const tema = noche ? 'dark' : 'light';
  if (document.documentElement.dataset.theme !== tema) {
    document.documentElement.dataset.theme = tema;
    $('meta[name="theme-color"]').content = noche ? '#171412' : '#f3ede3';
  }
}

// ── tiempo (Open-Meteo) ──────────────────────────────────────

const WMO = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Casi despejado'], 2: ['⛅', 'Nubes y claros'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla'],
  51: ['🌦️', 'Llovizna'], 53: ['🌦️', 'Llovizna'], 55: ['🌦️', 'Llovizna'], 56: ['🌧️', 'Llovizna helada'], 57: ['🌧️', 'Llovizna helada'],
  61: ['🌧️', 'Lluvia débil'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'], 66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'],
  71: ['🌨️', 'Nieve débil'], 73: ['🌨️', 'Nieve'], 75: ['❄️', 'Nieve fuerte'], 77: ['🌨️', 'Granizo fino'],
  80: ['🌦️', 'Chubascos'], 81: ['🌧️', 'Chubascos'], 82: ['⛈️', 'Chubascos fuertes'], 85: ['🌨️', 'Chubascos de nieve'], 86: ['🌨️', 'Chubascos de nieve'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo'],
};
const wmo = (c) => WMO[c] ?? ['🌡️', ''];

async function cargarTiempo() {
  const { latitud, longitud } = CONFIG;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitud}&longitude=${longitud}` +
    '&current=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=4';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const [icono, desc] = wmo(d.current.weather_code);
    const lluvia = d.daily.precipitation_probability_max?.[0];
    const dias = d.daily.time.slice(1, 4).map((fecha, i) => {
      const [ic] = wmo(d.daily.weather_code[i + 1]);
      const nombre = new Date(`${fecha}T12:00`).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
      return el(
        'div',
        { class: 'dia' },
        el('span', {}, nombre),
        el('span', { class: 'dia-icono', 'aria-hidden': 'true' }, ic),
        el('b', {}, `${Math.round(d.daily.temperature_2m_max[i + 1])}°`),
      );
    });
    $('#tiempo').replaceChildren(
      el(
        'div',
        { class: 'ahora' },
        el('span', { class: 'icono', 'aria-hidden': 'true' }, icono),
        el('span', { class: 'temp' }, `${Math.round(d.current.temperature_2m)}°`),
        el(
          'div',
          { class: 'det' },
          el('div', {}, desc),
          el(
            'div',
            {},
            `${Math.round(d.daily.temperature_2m_max[0])}° / ${Math.round(d.daily.temperature_2m_min[0])}°` +
              (lluvia != null ? ` · lluvia ${lluvia}%` : ''),
          ),
        ),
      ),
      el('div', { class: 'dias' }, ...dias),
    );
  } catch (e) {
    console.warn('Tiempo no disponible', e);
  }
}

// ── pantalla encendida ───────────────────────────────────────

let wakeLock = null;
async function pedirWakeLock() {
  if (!CONFIG.pantallaSiempreEncendida || !('wakeLock' in navigator) || document.hidden || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    /* el navegador no lo permite ahora; se reintenta al tocar la pantalla */
  }
}

// ── apps de vídeo ────────────────────────────────────────────

function prepararApps() {
  const hoja = $('#hoja-ver');
  const cerrar = () => (hoja.hidden = true);
  $('#apps-ver').replaceChildren(
    ...CONFIG.apps.map((a, i) =>
      el('a', { class: 'app-ver', href: a.url, rel: 'noopener', dataset: { i: String(i % 5) }, onclick: () => setTimeout(cerrar, 300) }, a.nombre),
    ),
  );
  $('#btn-ver').addEventListener('click', () => (hoja.hidden = false));
  hoja.addEventListener('click', (e) => {
    if (e.target === hoja) cerrar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });
}

// ── arranque ─────────────────────────────────────────────────

function mostrarLogin() {
  const caja = $('#login');
  const form = $('form', caja);
  caja.hidden = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const error = $('#login-error');
    const btn = $('button', form);
    error.textContent = '';
    btn.disabled = true;
    try {
      await store.signIn(form.elements.email.value.trim(), form.elements.password.value);
      caja.hidden = true;
      await arrancar();
    } catch (ex) {
      console.error(ex);
      error.textContent = 'Email o contraseña incorrectos.';
    } finally {
      btn.disabled = false;
    }
  };
}

async function arrancar() {
  if (arrancado) return;
  arrancado = true;
  store.onChange(() => refrescar());
  await refrescar();
  iniciarAgenda(store);
  setInterval(refrescar, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refrescar();
  });
  window.addEventListener('online', refrescar);
}

async function init() {
  construirMenu();
  prepararFormularios();
  iniciarTemporizadores();
  reloj();
  setInterval(reloj, 10000);
  cargarTiempo();
  setInterval(cargarTiempo, 30 * 60000);

  pedirWakeLock();
  document.addEventListener('visibilitychange', pedirWakeLock);
  document.addEventListener('pointerdown', () => {
    pedirWakeLock();
    desbloquearAudio();
  });

  $('#btn-recargar').addEventListener('click', () => location.reload());
  $('#btn-compra').href = CONFIG.compraUrl;
  prepararApps();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }

  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
    try {
      store = await createSupabaseStore(CONFIG);
    } catch (e) {
      console.error(e);
      aviso('No se ha podido conectar con Supabase. Usando modo local.', 'error', 8000);
    }
  }
  if (!store) {
    store = createLocalStore();
    $('#modo').hidden = false;
  }

  iniciarRecetas({ store, getState: () => state, accion, refrescar });

  if (store.mode === 'supabase') {
    const salir = $('#btn-salir');
    salir.hidden = false;
    salir.addEventListener('click', async () => {
      if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
      await store.signOut();
      location.reload();
    });
    if (!(await store.getSession())) return mostrarLogin();
  }
  await arrancar();
}

init();
