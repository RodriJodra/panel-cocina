// Vista "Reparto": a quién le toca cada tarea, quién ha hecho qué y recuentos.
import { CONFIG } from './config.js';
import { $, $$, deIso, diasEntre, el, escribirJSON, isoDia, leerJSON, sumarDias } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const CLAVE_PERIODO = 'panel-cocina:reparto-periodo';
const PERIODOS = {
  semana: { nombre: 'Esta semana', previo: 'la semana pasada a estas alturas' },
  mes: { nombre: 'Este mes', previo: 'el mes pasado a estas alturas' },
  trimestre: { nombre: 'Últimos 3 meses', previo: null },
};
const SEMANAS = 8;

let ctx = null;
let periodo = leerJSON(CLAVE_PERIODO, 'semana');
if (!PERIODOS[periodo]) periodo = 'semana';

// ── personas y colores ───────────────────────────────────────

/** Series en orden fijo: personas, 'Los dos' y, si hay registros sin persona, 'Sin indicar' */
function series(hechos = []) {
  const s = [...CONFIG.personas, 'Los dos'].map((nombre, i) => ({ nombre, clase: `p${i}` }));
  if (hechos.some((h) => !s.some((x) => x.nombre === h.persona))) s.push({ nombre: 'Sin indicar', clase: 'pn' });
  return s;
}
const serieDe = (persona, lista) => lista.find((s) => s.nombre === persona) ?? lista.find((s) => s.clase === 'pn');

// ── fechas ───────────────────────────────────────────────────

const lunes = (iso) => sumarDias(iso, -((deIso(iso).getDay() + 6) % 7));
const diaDe = (fechaIsoCompleta) => isoDia(new Date(fechaIsoCompleta));

function rango(tipo, hoy = isoDia()) {
  if (tipo === 'semana') {
    const ini = lunes(hoy);
    const prevIni = sumarDias(ini, -7);
    return { ini, fin: sumarDias(ini, 7), prevIni, prevFin: sumarDias(prevIni, diasEntre(ini, hoy) + 1) };
  }
  if (tipo === 'mes') {
    const d = deIso(hoy);
    const ini = isoDia(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    const fin = isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
    const prevIni = isoDia(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12));
    const prevFin = sumarDias(prevIni, Math.min(diasEntre(ini, hoy) + 1, diasEntre(prevIni, ini)));
    return { ini, fin, prevIni, prevFin };
  }
  return { ini: sumarDias(hoy, -89), fin: sumarDias(hoy, 1), prevIni: null };
}

const enRango = (h, ini, fin) => {
  const d = diaDe(h.fecha);
  return d >= ini && d < fin;
};

function cuandoFue(fecha) {
  const d = new Date(fecha);
  const dia = isoDia(d);
  const hoy = isoDia();
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (dia === hoy) return `hoy ${hora}`;
  if (dia === sumarDias(hoy, -1)) return `ayer ${hora}`;
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}

const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0);

// ── vista ────────────────────────────────────────────────────

const abierta = () => !$('#vista-reparto').hidden;

export function abrirReparto() {
  $('#panel').hidden = true;
  $('#vista-recetas').hidden = true;
  $('#btn-recetas').classList.remove('activo');
  $('#vista-reparto').hidden = false;
  render();
  $('#vista-reparto').scrollTop = 0;
}

export function cerrarReparto() {
  $('#vista-reparto').hidden = true;
  $('#panel').hidden = false;
}

export function actualizarReparto() {
  if (ctx && abierta()) render();
}

function render() {
  const { items, hechos = [] } = ctx.getState();
  const lista = series(hechos);
  const r = rango(periodo);
  const delPeriodo = hechos.filter((h) => enRango(h, r.ini, r.fin));
  const previos = r.prevIni ? hechos.filter((h) => enRango(h, r.prevIni, r.prevFin)) : null;
  const scroll = $('#vista-reparto').scrollTop;

  $('#vista-reparto').replaceChildren(
    el(
      'header',
      { class: 'reparto-cab' },
      el('button', { class: 'btn', type: 'button', onclick: cerrarReparto }, '‹ Panel'),
      el('h1', {}, 'Reparto de tareas'),
      el(
        'div',
        { class: 'segmentado', role: 'tablist', 'aria-label': 'Periodo' },
        Object.entries(PERIODOS).map(([k, v]) =>
          el(
            'button',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(k === periodo),
              class: k === periodo ? 'activo' : '',
              onclick: () => {
                periodo = k;
                escribirJSON(CLAVE_PERIODO, k);
                render();
              },
            },
            v.nombre,
          ),
        ),
      ),
    ),
    el(
      'div',
      { class: 'reparto-grid' },
      el(
        'div',
        { class: 'reparto-col reparto-principal' },
        tarjetaRecuento(delPeriodo, previos, lista),
        tarjetaSemanas(hechos, lista),
      ),
      el('div', { class: 'reparto-col' }, tarjetaLeToca(items)),
      el('div', { class: 'reparto-col' }, tarjetaQuienQue(delPeriodo, lista), tarjetaUltimas(hechos, lista)),
    ),
  );
  $('#vista-reparto').scrollTop = scroll;
}

// ── recuento y reparto ───────────────────────────────────────

function tarjetaRecuento(hechos, previos, lista) {
  const total = hechos.length;
  const cuenta = (arr, nombre) => arr.filter((h) => serieDe(h.persona, lista).nombre === nombre).length;
  const visibles = lista.filter((s) => s.clase !== 'pn' || cuenta(hechos, s.nombre) > 0);

  const tiles = visibles.map((s) => {
    const n = cuenta(hechos, s.nombre);
    let delta = null;
    if (previos) {
      const d = n - cuenta(previos, s.nombre);
      delta = el('span', { class: 'tile-delta' }, `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} vs ${PERIODOS[periodo].previo}`);
    }
    return el(
      'div',
      { class: 'tile' },
      el('span', { class: 'tile-label' }, el('i', { class: `punto ${s.clase}`, 'aria-hidden': 'true' }), s.nombre),
      el('span', { class: 'tile-valor' }, String(n), el('small', {}, total ? ` · ${pct(n, total)}%` : '')),
      delta,
    );
  });

  // barra segmentada: el total repartido entre personas
  const partes = visibles.map((s) => ({ ...s, n: cuenta(hechos, s.nombre) })).filter((p) => p.n > 0);
  const barra = el(
    'div',
    {
      class: 'barra-reparto',
      role: 'img',
      'aria-label': partes.length
        ? `Reparto: ${partes.map((p) => `${p.nombre} ${p.n} (${pct(p.n, total)}%)`).join(', ')}`
        : 'Sin tareas hechas en este periodo',
    },
    partes.map((p) => {
      const ancho = (100 * p.n) / total;
      return el(
        'div',
        { class: `parte ${p.clase}`, style: `flex-grow:${p.n}`, title: `${p.nombre}: ${p.n} (${pct(p.n, total)}%)` },
        ancho >= 14 ? el('span', {}, `${pct(p.n, total)}%`) : null,
      );
    }),
  );

  return el(
    'section',
    { class: 'tarjeta' },
    el(
      'header',
      { class: 'tarjeta-cab' },
      el('h2', {}, 'Quién ha hecho más'),
      el('span', { class: 'total' }, `${total} ${total === 1 ? 'tarea hecha' : 'tareas hechas'}`),
    ),
    el('div', { class: 'tiles' }, tiles),
    total
      ? el(
          'div',
          {},
          barra,
          el(
            'div',
            { class: 'leyenda-reparto' },
            partes.map((p) => el('span', {}, el('i', { class: `punto ${p.clase}`, 'aria-hidden': 'true' }), p.nombre)),
          ),
        )
      : el('p', { class: 'vacio' }, 'Aún no hay tareas hechas en este periodo. Al marcar una, elegid quién la ha hecho.'),
  );
}

// ── evolución por semanas (columnas apiladas) ────────────────

function tarjetaSemanas(hechos, lista) {
  const hoy = isoDia();
  const semanas = Array.from({ length: SEMANAS }, (_, i) => sumarDias(lunes(hoy), -7 * (SEMANAS - 1 - i)));
  const visibles = lista.filter((s) => s.clase !== 'pn' || hechos.some((h) => serieDe(h.persona, lista) === s));
  const datos = semanas.map((ini) => {
    const fin = sumarDias(ini, 7);
    const sem = hechos.filter((h) => enRango(h, ini, fin));
    const porSerie = visibles.map((s) => ({ ...s, n: sem.filter((h) => serieDe(h.persona, lista) === s).length }));
    return { ini, porSerie, total: sem.length };
  });
  const max = Math.max(4, ...datos.map((d) => d.total));
  const paso = max <= 6 ? 2 : max <= 15 ? 5 : max <= 40 ? 10 : 20;
  const tope = Math.ceil(max / paso) * paso;

  // geometría
  const W = 560;
  const H = 230;
  const m = { t: 10, r: 8, b: 30, l: 30 };
  const anchoBanda = (W - m.l - m.r) / SEMANAS;
  const barra = Math.min(24, anchoBanda * 0.5);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / tope);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'grafico');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tareas hechas por semana, últimas ${SEMANAS} semanas`);
  const nodo = (tag, attrs, texto) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (texto != null) n.textContent = texto;
    svg.append(n);
    return n;
  };

  for (let v = 0; v <= tope; v += paso) {
    nodo('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'eje' : 'rejilla' });
    nodo('text', { x: m.l - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, String(v));
  }

  const tooltip = el('div', { class: 'tooltip', hidden: true, role: 'status' });
  const mostrar = (d, cx) => {
    const fin = sumarDias(d.ini, 6);
    tooltip.replaceChildren(
      el('b', {}, `${fechaCorta(d.ini)} – ${fechaCorta(fin)}`),
      ...d.porSerie.filter((s) => s.n).map((s) => el('div', {}, el('i', { class: `punto ${s.clase}` }), `${s.nombre}`, el('span', {}, String(s.n)))),
      el('div', { class: 'tooltip-total' }, 'Total', el('span', {}, String(d.total))),
    );
    tooltip.hidden = false;
    tooltip.style.left = `${(100 * cx) / W}%`;
  };
  const ocultar = () => (tooltip.hidden = true);

  datos.forEach((d, i) => {
    const cx = m.l + anchoBanda * (i + 0.5);
    const x = cx - barra / 2;
    // segmentos apilados con 2px de separación; el de arriba con la punta redondeada
    const conValor = d.porSerie.filter((s) => s.n > 0);
    let base = 0;
    conValor.forEach((s, j) => {
      const top = y(base + s.n);
      const bottom = y(base) - (j > 0 ? 2 : 0); // 2px de superficie entre segmentos
      base += s.n;
      const alto = bottom - top;
      if (alto <= 0) return;
      const ultimo = j === conValor.length - 1;
      const r = Math.min(4, alto, barra / 2);
      const dPath = ultimo
        ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${bottom} Z`
        : `M${x},${bottom} V${top} H${x + barra} V${bottom} Z`;
      nodo('path', { d: dPath, class: `seg ${s.clase}` });
    });
    const etiqueta = deIso(d.ini).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
    nodo('text', { x: cx, y: H - 10, class: `tick${i === SEMANAS - 1 ? ' actual' : ''}`, 'text-anchor': 'middle' }, i === SEMANAS - 1 ? 'Esta' : etiqueta);
    // zona de toque/hover más grande que la barra
    const hit = nodo('rect', {
      x: m.l + anchoBanda * i,
      y: m.t,
      width: anchoBanda,
      height: H - m.t - m.b,
      class: 'hit',
      tabindex: '0',
      'aria-label': `Semana del ${etiqueta}: ${d.total} tareas. ${d.porSerie.filter((s) => s.n).map((s) => `${s.nombre} ${s.n}`).join(', ')}`,
    });
    hit.addEventListener('pointerenter', () => mostrar(d, cx));
    hit.addEventListener('pointerdown', () => mostrar(d, cx));
    hit.addEventListener('focus', () => mostrar(d, cx));
    hit.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && ocultar());
    hit.addEventListener('blur', ocultar);
  });

  // tabla equivalente
  const tabla = el(
    'details',
    { class: 'ver-tabla' },
    el('summary', {}, 'Ver como tabla'),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Semana'), visibles.map((s) => el('th', {}, s.nombre)), el('th', {}, 'Total'))),
      el(
        'tbody',
        {},
        [...datos].reverse().map((d) =>
          el('tr', {}, el('td', {}, fechaCorta(d.ini)), d.porSerie.map((s) => el('td', {}, String(s.n))), el('td', {}, String(d.total))),
        ),
      ),
    ),
  );

  return el(
    'section',
    { class: 'tarjeta' },
    el('header', { class: 'tarjeta-cab' }, el('h2', {}, 'Por semanas')),
    el(
      'div',
      { class: 'leyenda-reparto' },
      visibles.map((s) => el('span', {}, el('i', { class: `punto ${s.clase}`, 'aria-hidden': 'true' }), s.nombre)),
    ),
    el('div', { class: 'grafico-caja', onpointerleave: (e) => e.pointerType !== 'mouse' || ocultar() }, svg, tooltip),
    tabla,
  );
}

const fechaCorta = (iso) => deIso(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

// ── a quién le toca ──────────────────────────────────────────

function tarjetaLeToca(items) {
  const hoy = isoDia();
  const pendientes = items.filter(
    (i) => i.lista === 'tareas' && !i.hecho && (!i.repetir || !i.proxima || i.proxima <= hoy),
  );
  const proximas = items.filter((i) => i.lista === 'tareas' && i.repetir && i.proxima && i.proxima > hoy);
  const columnas = [...CONFIG.personas.map((p, i) => ({ nombre: p, clase: `p${i}`, valor: p })), { nombre: 'Sin asignar', clase: 'pn', valor: null }];

  const reasignar = (item) => {
    const opciones = [null, ...CONFIG.personas];
    const siguiente = opciones[(opciones.indexOf(item.asignado ?? null) + 1) % opciones.length];
    ctx.accion(() => ctx.store.updateItem(item.id, { asignado: siguiente }));
  };

  return el(
    'section',
    { class: 'tarjeta tarjeta-letoca' },
    el(
      'header',
      { class: 'tarjeta-cab' },
      el('h2', {}, 'A quién le toca'),
      el('span', { class: 'total' }, `${pendientes.length} pendientes`),
    ),
    el('p', { class: 'ayuda' }, 'Toca una tarea para pasársela a otro.'),
    columnas.map((c) => {
      const suyas = pendientes.filter((t) => (t.asignado ?? null) === c.valor || (c.valor === null && t.asignado && !CONFIG.personas.includes(t.asignado)));
      const luego = proximas.filter((t) => (t.asignado ?? null) === c.valor).length;
      return el(
        'div',
        { class: 'letoca-grupo' },
        el(
          'h3',
          {},
          el('i', { class: `punto ${c.clase}`, 'aria-hidden': 'true' }),
          c.nombre,
          el('span', { class: 'letoca-n' }, String(suyas.length)),
        ),
        suyas.length
          ? el(
              'ul',
              { class: 'letoca-lista' },
              suyas.map((t) =>
                el(
                  'li',
                  {},
                  el(
                    'button',
                    { type: 'button', class: `letoca-tarea ${c.clase}`, onclick: () => reasignar(t), 'aria-label': `${t.texto}. Tocar para reasignar` },
                    t.texto,
                    t.repetir ? el('small', {}, '↻') : null,
                  ),
                ),
              ),
            )
          : el('p', { class: 'vacio' }, c.valor ? 'Nada pendiente.' : 'Todas tienen dueño.'),
        luego ? el('p', { class: 'letoca-luego' }, `+ ${luego} que se repite${luego === 1 ? '' : 'n'} más adelante`) : null,
      );
    }),
  );
}

// ── quién hace qué ───────────────────────────────────────────

function tarjetaQuienQue(hechos, lista) {
  const porTarea = new Map();
  for (const h of hechos) {
    const k = h.texto.trim().toLowerCase();
    if (!porTarea.has(k)) porTarea.set(k, { texto: h.texto, total: 0, cuenta: new Map() });
    const t = porTarea.get(k);
    t.total += 1;
    const s = serieDe(h.persona, lista);
    t.cuenta.set(s, (t.cuenta.get(s) ?? 0) + 1);
  }
  const top = [...porTarea.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  return el(
    'section',
    { class: 'tarjeta' },
    el('header', { class: 'tarjeta-cab' }, el('h2', {}, 'Quién hace qué')),
    top.length
      ? el(
          'ul',
          { class: 'quienque' },
          top.map((t) => {
            const partes = lista.filter((s) => t.cuenta.get(s)).map((s) => ({ s, n: t.cuenta.get(s) }));
            return el(
              'li',
              {},
              el('div', { class: 'quienque-cab' }, el('span', {}, t.texto), el('b', {}, `${t.total}×`)),
              el(
                'div',
                { class: 'barra-fina', role: 'img', 'aria-label': partes.map((p) => `${p.s.nombre} ${p.n}`).join(', ') },
                partes.map((p) => el('i', { class: p.s.clase, style: `flex-grow:${p.n}` })),
              ),
              el('div', { class: 'quienque-detalle' }, partes.map((p) => `${p.s.nombre} ${p.n}`).join(' · ')),
            );
          }),
        )
      : el('p', { class: 'vacio' }, 'Sin datos en este periodo.'),
  );
}

// ── últimas hechas ───────────────────────────────────────────

function tarjetaUltimas(hechos, lista) {
  const ultimas = [...hechos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 12);
  return el(
    'section',
    { class: 'tarjeta' },
    el('header', { class: 'tarjeta-cab' }, el('h2', {}, 'Últimas hechas')),
    ultimas.length
      ? el(
          'ul',
          { class: 'ultimas' },
          ultimas.map((h) => {
            const s = serieDe(h.persona, lista);
            return el(
              'li',
              {},
              el('i', { class: `punto ${s.clase}`, 'aria-hidden': 'true' }),
              el('span', { class: 'ultimas-texto' }, h.texto, el('small', {}, `${s.nombre} · ${cuandoFue(h.fecha)}`)),
              el(
                'button',
                {
                  class: 'borrar',
                  type: 'button',
                  'aria-label': 'Quitar del historial',
                  onclick: () => {
                    if (confirm(`¿Quitar «${h.texto}» (${s.nombre}) del historial?`)) ctx.accion(() => ctx.store.removeHecho(h.id));
                  },
                },
                '×',
              ),
            );
          }),
        )
      : el('p', { class: 'vacio' }, 'Todavía no hay historial.'),
  );
}

// ── arranque ─────────────────────────────────────────────────

export function iniciarReparto(contexto) {
  ctx = contexto;
  $('#btn-reparto').addEventListener('click', abrirReparto);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierta() && $('#hoja-quien').hidden) cerrarReparto();
  });
  void $$;
}
