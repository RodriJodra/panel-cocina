// Agenda: eventos de Google Calendar de hoy y los próximos días.
// Los lee la función "calendario" de Supabase a partir de los enlaces iCal privados.
import { $, el, etiquetaDia, isoDia, sumarDias } from './util.js';
import { NecesitaSupabase } from './store.js';

const DIAS_VISTA = 7;
let ultimo = null;

const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function eventosDelDia(eventos, dia) {
  const ini = new Date(`${dia}T00:00:00`);
  const fin = new Date(`${sumarDias(dia, 1)}T00:00:00`);
  return eventos
    .filter((e) =>
      e.todoElDia ? e.inicio <= dia && dia < e.fin : new Date(e.inicio) < fin && new Date(e.fin) > ini,
    )
    .sort((a, b) => Number(b.todoElDia) - Number(a.todoElDia) || a.inicio.localeCompare(b.inicio));
}

function render(datos) {
  const ul = $('#l-agenda');
  const hoy = isoDia();
  const ahora = Date.now();
  const eventos = datos.eventos ?? [];
  const bloques = [];
  for (let i = 0; i < DIAS_VISTA; i++) {
    const dia = sumarDias(hoy, i);
    const lista = eventosDelDia(eventos, dia);
    if (!lista.length && i > 0) continue;
    bloques.push(el('li', { class: `agenda-dia${i === 0 ? ' hoy' : ''}` }, etiquetaDia(dia, hoy)));
    if (!lista.length) bloques.push(el('li', { class: 'vacio' }, 'Nada para hoy.'));
    for (const e of lista) {
      const pasado = !e.todoElDia && new Date(e.fin).getTime() < ahora;
      const empezoAntes = !e.todoElDia && new Date(e.inicio) < new Date(`${dia}T00:00:00`);
      bloques.push(
        el(
          'li',
          { class: `evento${pasado ? ' pasado' : ''}`, dataset: { cal: String((e.calendario ?? 0) % 3) } },
          el('span', { class: 'evento-hora' }, e.todoElDia ? 'Todo el día' : empezoAntes ? 'Sigue' : hora(e.inicio)),
          el('span', { class: 'evento-texto' }, e.titulo || '(sin título)', e.lugar ? el('small', {}, e.lugar) : null),
        ),
      );
    }
  }
  ul.replaceChildren(...bloques);

  const leyenda = $('#agenda-leyenda');
  leyenda.replaceChildren(
    ...(datos.calendarios ?? []).map((nombre, i) => el('span', { dataset: { cal: String(i % 3) } }, nombre)),
  );
}

async function cargar(store) {
  try {
    ultimo = await store.agenda();
    render(ultimo);
  } catch (e) {
    if (e instanceof NecesitaSupabase) {
      $('#l-agenda').replaceChildren(
        el('li', { class: 'vacio' }, 'Conecta Supabase para ver aquí vuestros calendarios de Google.'),
      );
      return false;
    }
    console.warn('Agenda', e);
    if (ultimo) render(ultimo); // seguimos mostrando lo último que llegó
    else $('#l-agenda').replaceChildren(el('li', { class: 'vacio' }, `No se ha podido leer el calendario. ${e.message ?? ''}`));
  }
  return true;
}

export async function iniciarAgenda(store) {
  const activa = await cargar(store);
  if (!activa) return;
  setInterval(() => cargar(store), 10 * 60000);
  // al cambiar de día o volver a la app, refresca
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) cargar(store);
  });
  setInterval(() => ultimo && render(ultimo), 60000);
}
