// Recetas, ingredientes de la semana y modo cocina
import { $, $$, aviso, capitalizar, el, escribirJSON, leerJSON } from './util.js';
import { NecesitaSupabase } from './store.js';
import { nuevoTemporizador, redibujarTemporizadores, tiemposEnTexto } from './temporizadores.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
let ctx = null; // { store, getState, accion }
let seleccion = null; // { tipo: 'receta' | 'nueva' | 'editar' | 'semana', id? }
let filtro = '';

// ── texto ────────────────────────────────────────────────────

export const normalizar = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const lineas = (t) =>
  String(t ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const pasosDe = (t) => lineas(t).map((l) => l.replace(/^(?:paso\s*)?\d+\s*[.):-]\s*/i, ''));

const UNIDADES =
  'g|gr|grs|gramos?|kg|kilos?|ml|cl|dl|l|litros?|cucharadas?|cucharaditas?|cdas?|cdtas?|tazas?|vasos?|unidades?|uds?|dientes?|pizcas?|chorritos?|chorros?|puñados?|ramitas?|hojas?|latas?|botes?|sobres?|rebanadas?|lonchas?|filetes?|trozos?';
const RE_CANTIDAD = new RegExp(String.raw`^[\d\s.,/½¼¾⅓⅔-]+\s*(?:(?:${UNIDADES})\.?\s+)?(?:de\s+)?`, 'i');

/** "200 g de harina de trigo" → "harina de trigo" */
export function nombreIngrediente(linea) {
  return linea
    .replace(RE_CANTIDAD, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/,.*$/, '')
    .trim();
}

export function recetaPorTitulo(texto) {
  const n = normalizar(texto);
  if (!n || !ctx) return null;
  return ctx.getState().recetas.find((r) => normalizar(r.titulo) === n) ?? null;
}

const receta = (id) => ctx.getState().recetas.find((r) => r.id === id);

// ── vista ────────────────────────────────────────────────────

export function abrirRecetas(id) {
  $('#panel').hidden = true;
  $('#vista-reparto').hidden = true;
  $('#btn-reparto-top')?.classList.remove('activo');
  $('#vista-recetas').hidden = false;
  $('#btn-recetas').classList.add('activo');
  if (id) seleccion = { tipo: 'receta', id };
  render();
}

export function cerrarRecetas() {
  $('#vista-recetas').hidden = true;
  $('#panel').hidden = false;
  $('#btn-recetas').classList.remove('activo');
}

const vistaAbierta = () => !$('#vista-recetas').hidden;

/** Llamado por app.js cada vez que cambian los datos */
export function actualizarRecetas() {
  actualizarDatalist();
  if (!vistaAbierta()) return;
  // si alguien está escribiendo en el formulario, no lo pisamos
  if (seleccion?.tipo === 'nueva' || seleccion?.tipo === 'editar') return renderLista();
  if (seleccion?.tipo === 'receta' && !receta(seleccion.id)) seleccion = null;
  render();
}

function actualizarDatalist() {
  const dl = $('#lista-recetas');
  dl.replaceChildren(...ctx.getState().recetas.map((r) => el('option', { value: r.titulo })));
}

function render() {
  renderLista();
  renderDetalle();
}

function renderLista() {
  const recetas = [...ctx.getState().recetas]
    .filter((r) => !filtro || normalizar(r.titulo).includes(normalizar(filtro)) || normalizar(r.ingredientes).includes(normalizar(filtro)))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  const enMenu = new Set(ctx.getState().menu.map((m) => normalizar(m.texto)));
  $('#l-recetas').replaceChildren(
    ...(recetas.length
      ? recetas.map((r) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                class: `receta-item${seleccion?.id === r.id ? ' activa' : ''}`,
                onclick: () => {
                  seleccion = { tipo: 'receta', id: r.id };
                  render();
                },
              },
              el('span', {}, r.titulo),
              el('small', {}, [r.tiempo, enMenu.has(normalizar(r.titulo)) ? 'en el menú' : null].filter(Boolean).join(' · ')),
            ),
          ),
        )
      : [el('li', { class: 'vacio' }, filtro ? 'Ninguna receta coincide.' : 'Aún no hay recetas. Crea la primera o impórtala de una web.')]),
  );
}

function renderDetalle() {
  const caja = $('#receta-detalle');
  caja.scrollTop = 0;
  if (!seleccion) return caja.replaceChildren(portada());
  if (seleccion.tipo === 'semana') return caja.replaceChildren(...vistaSemana());
  if (seleccion.tipo === 'nueva') return caja.replaceChildren(formulario({}));
  const r = receta(seleccion.id);
  if (!r) return caja.replaceChildren(portada());
  if (seleccion.tipo === 'editar') return caja.replaceChildren(formulario(r));
  caja.replaceChildren(...vistaReceta(r));
}

function portada() {
  return el(
    'div',
    { class: 'portada' },
    el('p', {}, 'Elige una receta, crea una nueva o mira los ingredientes que necesitáis para el menú de esta semana.'),
    el('button', { class: 'btn', onclick: () => irA({ tipo: 'semana' }) }, 'Ingredientes de la semana'),
  );
}

function irA(sel) {
  seleccion = sel;
  render();
}

function vistaReceta(r) {
  const ingredientes = lineas(r.ingredientes);
  const pasos = pasosDe(r.pasos);
  let host = '';
  try {
    host = r.fuente ? new URL(r.fuente).hostname.replace(/^www\./, '') : '';
  } catch {
    /* fuente no es una URL */
  }
  return [
    el(
      'header',
      { class: 'receta-cab' },
      el('h2', {}, r.titulo),
      el(
        'p',
        { class: 'receta-meta' },
        [r.raciones && `${r.raciones}`, r.tiempo, host && `de ${host}`].filter(Boolean).join(' · '),
      ),
      el(
        'div',
        { class: 'receta-acciones' },
        el('button', { class: 'btn btn-yt', onclick: () => abrirCocina(r.id), disabled: !pasos.length }, '▶ Cocinar'),
        el('button', { class: 'btn', onclick: () => irA({ tipo: 'editar', id: r.id }) }, 'Editar'),
        el(
          'button',
          {
            class: 'btn btn-texto',
            onclick: () => {
              if (!confirm(`¿Borrar la receta «${r.titulo}»?`)) return;
              seleccion = null;
              ctx.accion(() => ctx.store.deleteReceta(r.id));
            },
          },
          'Borrar',
        ),
      ),
    ),
    el(
      'div',
      { class: 'receta-cuerpo' },
      el(
        'section',
        {},
        el('h3', {}, 'Ingredientes'),
        ingredientes.length ? el('ul', { class: 'ingredientes' }, ingredientes.map((i) => el('li', {}, i))) : el('p', { class: 'vacio' }, 'Sin ingredientes.'),
      ),
      el(
        'section',
        {},
        el('h3', {}, 'Pasos'),
        pasos.length
          ? el('ol', { class: 'pasos' }, pasos.map((p) => el('li', {}, p, chipsTiempo(p, r.titulo))))
          : el('p', { class: 'vacio' }, 'Sin pasos.'),
      ),
    ),
  ];
}

function chipsTiempo(texto, etiqueta) {
  const tiempos = tiemposEnTexto(texto);
  if (!tiempos.length) return null;
  return el(
    'span',
    { class: 'chips' },
    tiempos.map((t) =>
      el(
        'button',
        {
          class: 'chip-tiempo',
          type: 'button',
          onclick: (e) => {
            e.stopPropagation();
            nuevoTemporizador(t.minutos, etiqueta);
            aviso(`Temporizador de ${t.texto} en marcha`);
          },
        },
        `⏱ ${t.texto}`,
      ),
    ),
  );
}

// ── formulario ───────────────────────────────────────────────

function formulario(r) {
  const campo = (nombre, etiqueta, attrs = {}) =>
    el('label', { class: `campo campo-${nombre}` }, etiqueta, el(attrs.multilinea ? 'textarea' : 'input', { name: nombre, ...attrs, multilinea: null }));
  const form = el(
    'form',
    { class: 'receta-form', autocomplete: 'off' },
    el('h2', {}, r.id ? 'Editar receta' : 'Nueva receta'),
    el(
      'div',
      { class: 'importar' },
      el('input', { name: 'url', type: 'url', placeholder: 'Pega el enlace de una receta de internet…', inputmode: 'url' }),
      el('button', { type: 'button', class: 'btn', onclick: () => importar(form) }, 'Importar'),
    ),
    campo('titulo', 'Nombre', { required: true, maxlength: '120' }),
    el(
      'div',
      { class: 'fila' },
      campo('raciones', 'Raciones', { placeholder: '4 personas', maxlength: '40' }),
      campo('tiempo', 'Tiempo', { placeholder: '45 min', maxlength: '40' }),
    ),
    campo('ingredientes', 'Ingredientes · uno por línea', { multilinea: true, rows: '8', placeholder: '200 g de harina\n2 huevos\n…' }),
    campo('pasos', 'Pasos · uno por línea (los tiempos como "10 minutos" crean temporizadores)', { multilinea: true, rows: '10', placeholder: 'Precalienta el horno a 180 ºC.\nHornea 25 minutos.\n…' }),
    el('input', { type: 'hidden', name: 'fuente' }),
    el(
      'div',
      { class: 'receta-acciones' },
      el('button', { class: 'btn btn-yt', type: 'submit' }, 'Guardar'),
      el('button', { class: 'btn', type: 'button', onclick: () => irA(r.id ? { tipo: 'receta', id: r.id } : null) }, 'Cancelar'),
    ),
  );
  for (const k of ['titulo', 'raciones', 'tiempo', 'ingredientes', 'pasos', 'fuente']) form.elements[k].value = r[k] ?? '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(['titulo', 'raciones', 'tiempo', 'ingredientes', 'pasos', 'fuente'].map((k) => [k, form.elements[k].value.trim()]));
    if (!datos.titulo) return;
    try {
      const id = await ctx.store.saveReceta({ ...datos, id: r.id });
      seleccion = { tipo: 'receta', id };
      await ctx.refrescar();
      render();
    } catch (ex) {
      console.error(ex);
      aviso('No se ha podido guardar la receta.', 'error');
    }
  });
  return form;
}

async function importar(form) {
  const url = form.elements.url.value.trim();
  if (!/^https?:\/\//i.test(url)) return aviso('Pega un enlace que empiece por https://', 'error');
  const btn = $('.importar button', form);
  btn.disabled = true;
  btn.textContent = 'Leyendo…';
  try {
    const r = await ctx.store.importarReceta(url);
    for (const k of ['titulo', 'raciones', 'tiempo', 'ingredientes', 'pasos']) if (r[k]) form.elements[k].value = r[k];
    form.elements.fuente.value = url;
    aviso('Receta importada. Revísala y pulsa Guardar.');
  } catch (e) {
    aviso(e instanceof NecesitaSupabase ? 'Importar recetas necesita Supabase.' : `No se ha podido importar: ${e.message}`, 'error', 7000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Importar';
  }
}

// ── ingredientes de la semana ────────────────────────────────

const CLAVE_TENGO = 'panel-cocina:ya-tengo';

function vistaSemana() {
  const { menu } = ctx.getState();
  const tengo = new Set(leerJSON(CLAVE_TENGO, []));
  const conReceta = [];
  const sinReceta = [];
  for (const m of [...menu].sort((a, b) => a.dia - b.dia || (a.comida === 'cena') - (b.comida === 'cena'))) {
    const r = recetaPorTitulo(m.texto);
    (r ? conReceta : sinReceta).push({ ...m, receta: r });
  }

  // ingredientes agrupados por nombre (sin cantidades)
  const mapa = new Map();
  for (const { receta: r } of conReceta) {
    for (const linea of lineas(r.ingredientes)) {
      const nombre = nombreIngrediente(linea) || linea;
      const clave = normalizar(nombre);
      if (!mapa.has(clave)) mapa.set(clave, { nombre, detalle: new Set(), recetas: new Set() });
      mapa.get(clave).detalle.add(linea);
      mapa.get(clave).recetas.add(r.titulo);
    }
  }
  const ingredientes = [...mapa.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));

  const frase = el('p', { class: 'frase-alexa' });
  const actualizarFrase = () => {
    const falta = ingredientes.filter(([k]) => !tengo.has(k)).map(([, v]) => v.nombre.toLowerCase());
    frase.textContent = falta.length
      ? `«Alexa, añade ${falta.length > 1 ? `${falta.slice(0, -1).join(', ')} y ${falta.at(-1)}` : falta[0]} a la lista de la compra»`
      : 'Lo tenéis todo. 🎉';
  };
  actualizarFrase();

  const lista = el(
    'ul',
    { class: 'ingredientes-semana' },
    ingredientes.map(([clave, v]) => {
      const li = el(
        'li',
        { class: tengo.has(clave) ? 'hecho' : '' },
        el('button', { class: 'check', type: 'button', 'aria-label': 'Ya lo tengo' }, el('span', { class: 'tick' })),
        el('span', { class: 'texto' }, capitalizar(v.nombre), el('small', {}, [...v.detalle].join(' · '))),
      );
      li.addEventListener('click', () => {
        tengo.has(clave) ? tengo.delete(clave) : tengo.add(clave);
        escribirJSON(CLAVE_TENGO, [...tengo]);
        li.classList.toggle('hecho', tengo.has(clave));
        actualizarFrase();
      });
      return li;
    }),
  );

  return [
    el(
      'header',
      { class: 'receta-cab' },
      el('h2', {}, 'Ingredientes de la semana'),
      el('p', { class: 'receta-meta' }, 'Marca lo que ya tenéis en casa. Lo demás, díselo a Alexa.'),
    ),
    ingredientes.length
      ? el('div', {}, frase, lista, el('button', { class: 'btn-texto', type: 'button', onclick: () => { escribirJSON(CLAVE_TENGO, []); renderDetalle(); } }, 'Desmarcar todo'))
      : el('p', { class: 'vacio' }, 'Ninguna comida del menú tiene receta guardada. Escribe en el menú el nombre exacto de una receta para enlazarla.'),
    conReceta.length || sinReceta.length
      ? el(
          'section',
          { class: 'semana-platos' },
          el('h3', {}, 'Platos del menú'),
          el(
            'ul',
            {},
            [...conReceta, ...sinReceta]
              .sort((a, b) => a.dia - b.dia)
              .map((m) =>
                el(
                  'li',
                  {},
                  el('span', { class: 'semana-dia' }, `${DIAS[m.dia]} · ${m.comida}`),
                  m.receta
                    ? el('button', { class: 'enlace', type: 'button', onclick: () => irA({ tipo: 'receta', id: m.receta.id }) }, m.texto)
                    : el('span', { class: 'sin-receta' }, `${m.texto} (sin receta)`),
                ),
              ),
          ),
        )
      : null,
  ];
}

// ── modo cocina ──────────────────────────────────────────────

let cocina = null; // { id, paso }

function abrirCocina(id) {
  cocina = { id, paso: 0 };
  $('#cocina').hidden = false;
  document.body.classList.add('cocinando');
  renderCocina();
  redibujarTemporizadores();
}

function cerrarCocina() {
  cocina = null;
  $('#cocina').hidden = true;
  document.body.classList.remove('cocinando');
}

function moverPaso(delta) {
  if (!cocina) return;
  const r = receta(cocina.id);
  const total = pasosDe(r?.pasos).length;
  const nuevo = cocina.paso + delta;
  if (nuevo < 0) return;
  if (nuevo > total) return cerrarCocina();
  cocina.paso = nuevo;
  renderCocina();
}

function renderCocina() {
  const r = receta(cocina.id);
  if (!r) return cerrarCocina();
  const pasos = pasosDe(r.pasos);
  const ingredientes = lineas(r.ingredientes);
  const i = cocina.paso; // 0 = preparar ingredientes, 1..n = pasos

  $('#cocina-titulo').textContent = r.titulo;
  $('#cocina-progreso').textContent = i === 0 ? 'Antes de empezar' : `Paso ${i} de ${pasos.length}`;
  $('#cocina-barra').style.width = `${(100 * i) / pasos.length}%`;

  const cuerpo = $('#cocina-paso');
  if (i === 0) {
    cuerpo.replaceChildren(
      el('p', { class: 'cocina-intro' }, 'Prepara los ingredientes'),
      el(
        'ul',
        { class: 'cocina-ingredientes' },
        ingredientes.map((linea) => {
          const li = el('li', {}, el('span', { class: 'tick' }), linea);
          li.addEventListener('click', () => li.classList.toggle('hecho'));
          return li;
        }),
      ),
    );
  } else {
    const texto = pasos[i - 1];
    cuerpo.replaceChildren(el('p', { class: 'cocina-texto' }, texto), chipsTiempo(texto, r.titulo));
  }

  $('#cocina-ant').disabled = i === 0;
  $('#cocina-sig').textContent = i === 0 ? 'Empezar ›' : i === pasos.length ? 'Terminar ✓' : 'Siguiente ›';
  $('#cocina-ingredientes').replaceChildren(...ingredientes.map((l) => el('li', {}, l)));
}

function prepararCocina() {
  $('#cocina-cerrar').addEventListener('click', cerrarCocina);
  $('#cocina-ant').addEventListener('click', () => moverPaso(-1));
  $('#cocina-sig').addEventListener('click', () => moverPaso(1));
  $('#cocina-ver-ing').addEventListener('click', () => $('#cocina').classList.toggle('ver-ingredientes'));

  // deslizar a izquierda/derecha para cambiar de paso
  let x0 = null;
  const zona = $('#cocina-paso');
  zona.addEventListener('pointerdown', (e) => (x0 = e.clientX));
  zona.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 70) moverPaso(dx < 0 ? 1 : -1);
  });
  document.addEventListener('keydown', (e) => {
    if (!cocina) return;
    if (e.key === 'ArrowRight') moverPaso(1);
    if (e.key === 'ArrowLeft') moverPaso(-1);
    if (e.key === 'Escape') cerrarCocina();
  });
}

// ── arranque ─────────────────────────────────────────────────

export function iniciarRecetas(contexto) {
  ctx = contexto;
  $('#btn-recetas').addEventListener('click', () => (vistaAbierta() ? cerrarRecetas() : abrirRecetas()));
  $('#btn-nueva-receta').addEventListener('click', () => irA({ tipo: 'nueva' }));
  $('#btn-semana').addEventListener('click', () => irA({ tipo: 'semana' }));
  $('#buscar-receta').addEventListener('input', (e) => {
    filtro = e.target.value;
    renderLista();
  });
  prepararCocina();
  actualizarDatalist();
}
