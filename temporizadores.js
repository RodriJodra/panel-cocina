// Temporizadores de cocina. Se guardan en este dispositivo y se muestran
// en todas las listas <ul class="timers"> (panel y modo cocina).
import { $, $$, el, escribirJSON, leerJSON } from './util.js';
import { uid } from './store.js';

const CLAVE = 'panel-cocina:temporizadores';
const PRESETS = [3, 5, 10, 15, 20];
const MAXIMO = 8;
let temporizadores = leerJSON(CLAVE, []);
let audio = null;
let alarma = null;

export function desbloquearAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    /* sin audio */
  }
}

function pitido() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const o of [0, 0.22, 0.44]) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + o);
    g.gain.exponentialRampToValueAtTime(0.5, t + o + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.18);
    osc.connect(g).connect(audio.destination);
    osc.start(t + o);
    osc.stop(t + o + 0.2);
  }
}

export const formatoCuenta = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const formatoMinutos = (min) => {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return min < 1 ? `${Math.round(min * 60)} s` : `${+min.toFixed(1)} min`;
};

export function nuevoTemporizador(minutos, etiqueta) {
  desbloquearAudio();
  if (!(minutos > 0)) return;
  if (temporizadores.length >= MAXIMO) return;
  const ms = Math.round(minutos * 60000);
  const nombre = etiqueta ? `${etiqueta} · ${formatoMinutos(minutos)}` : formatoMinutos(minutos);
  temporizadores.push({ id: uid(), fin: Date.now() + ms, total: ms, etiqueta: nombre });
  escribirJSON(CLAVE, temporizadores);
  construir();
}

function quitar(id) {
  temporizadores = temporizadores.filter((t) => t.id !== id);
  escribirJSON(CLAVE, temporizadores);
  construir();
}

function timerEl(t, ahora) {
  const sonando = t.fin <= ahora;
  return el(
    'li',
    {
      class: `timer${sonando ? ' sonando' : ''}`,
      dataset: { id: t.id, sonando: String(sonando) },
      onclick: () => {
        if (t.fin <= Date.now()) quitar(t.id);
      },
    },
    el('span', { class: 'cuenta' }, sonando ? '¡Listo!' : formatoCuenta(t.fin - ahora)),
    el('span', { class: 'etiqueta' }, t.etiqueta),
    el('span', { class: 'barra' }, el('i')),
    el(
      'button',
      {
        class: 'borrar',
        'aria-label': 'Quitar temporizador',
        onclick: (e) => {
          e.stopPropagation();
          quitar(t.id);
        },
      },
      '×',
    ),
  );
}

function construir() {
  const ahora = Date.now();
  for (const ul of $$('ul.timers')) ul.replaceChildren(...temporizadores.map((t) => timerEl(t, ahora)));
  tick();
}

function tick() {
  const ahora = Date.now();
  // los que llevan más de 5 minutos sonando se quitan solos
  if (temporizadores.some((t) => ahora - t.fin > 5 * 60000)) {
    temporizadores = temporizadores.filter((t) => ahora - t.fin <= 5 * 60000);
    escribirJSON(CLAVE, temporizadores);
    return construir();
  }
  for (const t of temporizadores) {
    const sonando = t.fin <= ahora;
    for (const li of $$(`.timer[data-id="${t.id}"]`)) {
      if (String(sonando) !== li.dataset.sonando) return construir();
      if (!sonando) {
        $('.cuenta', li).textContent = formatoCuenta(t.fin - ahora);
        $('.barra i', li).style.width = `${(100 * (t.fin - ahora)) / t.total}%`;
      }
    }
  }
  const algunoSonando = temporizadores.some((t) => t.fin <= ahora);
  if (algunoSonando && !alarma) {
    pitido();
    navigator.vibrate?.([300, 150, 300]);
    alarma = setInterval(pitido, 1400);
  } else if (!algunoSonando && alarma) {
    clearInterval(alarma);
    alarma = null;
  }
}

/** Refresca las listas (p. ej. al abrir el modo cocina) */
export const redibujarTemporizadores = construir;

export function iniciarTemporizadores() {
  $('#presets').prepend(
    ...PRESETS.map((m) => el('button', { type: 'button', onclick: () => nuevoTemporizador(m) }, `${m}′`)),
  );
  $('#timer-libre').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.minutos;
    nuevoTemporizador(Number(String(input.value).replace(',', '.')));
    input.value = '';
    input.blur();
  });
  construir();
  setInterval(tick, 500);
}

// ── detectar tiempos en el texto de un paso de receta ────────

const NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30 };
const UNIDADES = [
  [/^h(?:oras?|rs?)?$/i, 60],
  [/^min(?:utos?|s)?$/i, 1],
  [/^(?:s|seg(?:undos?|s)?)$/i, 1 / 60],
];
const RE_TIEMPO = new RegExp(
  String.raw`(?:(media)\s+hora)|(?:(\d+(?:[.,]\d+)?|${Object.keys(NUMEROS).join('|')})` +
    String.raw`(?:\s*(?:-|a|o)\s*(\d+(?:[.,]\d+)?))?\s*(horas?|hrs?|h|minutos?|mins?|min|segundos?|segs?|seg|s)\b)`,
  'gi',
);

/** Devuelve [{minutos, texto}] con los tiempos que aparecen en un texto */
export function tiemposEnTexto(texto) {
  const res = [];
  for (const m of texto.matchAll(RE_TIEMPO)) {
    if (m[1]) {
      res.push({ minutos: 30, texto: m[0] });
      continue;
    }
    const n1 = NUMEROS[m[2].toLowerCase()] ?? Number(m[2].replace(',', '.'));
    const n2 = m[3] ? Number(m[3].replace(',', '.')) : 0;
    const factor = UNIDADES.find(([re]) => re.test(m[4]))?.[1];
    const minutos = Math.max(n1, n2) * factor;
    if (factor && minutos > 0 && minutos <= 24 * 60) res.push({ minutos, texto: m[0] });
  }
  return res;
}
