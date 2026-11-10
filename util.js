// Utilidades compartidas

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) n.append(h);
  return n;
}

export const capitalizar = (t) => t.charAt(0).toLocaleUpperCase('es-ES') + t.slice(1);

export function leerJSON(clave, defecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? defecto;
  } catch {
    return defecto;
  }
}

export function escribirJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento */
  }
}

let avisoTimer;
export function aviso(msg, tipo = 'info', ms = 4000) {
  const caja = $('#aviso');
  caja.textContent = msg;
  caja.dataset.tipo = tipo;
  caja.hidden = false;
  clearTimeout(avisoTimer);
  if (ms) avisoTimer = setTimeout(() => (caja.hidden = true), ms);
}

// ── fechas (siempre en hora local) ───────────────────────────

/** 'YYYY-MM-DD' de una fecha en hora local */
export const isoDia = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date a mediodía local a partir de 'YYYY-MM-DD' (evita saltos por horario de verano) */
export const deIso = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const sumarDias = (iso, n) => {
  const d = deIso(iso);
  d.setDate(d.getDate() + n);
  return isoDia(d);
};

export const sumarMeses = (iso, n) => {
  const d = deIso(iso);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimo));
  return isoDia(d);
};

export const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);

export function etiquetaDia(iso, hoy = isoDia()) {
  const dif = diasEntre(hoy, iso);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  const txt = deIso(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  return capitalizar(txt);
}

export const fechaCorta = (iso) =>
  deIso(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '');
