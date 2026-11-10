// Función de Supabase "importar-receta"
// Descarga una página de recetas y extrae la receta de sus datos estructurados
// (schema.org/Recipe en JSON-LD), que usan casi todas las webs de recetas.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  ordm: 'º', ordf: 'ª', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', iquest: '¿', iexcl: '¡',
};

export function limpiar(t: unknown): string {
  return String(t ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+\d*);/gi, (m, n) => ENTIDADES[n] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

const esReceta = (o: any) => {
  const t = o?.['@type'];
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
};

function buscarReceta(nodo: any): any {
  if (!nodo || typeof nodo !== 'object') return null;
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const r = buscarReceta(n);
      if (r) return r;
    }
    return null;
  }
  if (esReceta(nodo)) return nodo;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = buscarReceta(nodo[k]);
    if (r) return r;
  }
  return null;
}

/** "PT1H30M" → "1 h 30 min" */
export function duracion(iso: unknown): string {
  const m = String(iso ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return '';
  const min = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  if (!min) return '';
  const h = Math.floor(min / 60);
  const r = min % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

function pasos(instr: any): string[] {
  if (!instr) return [];
  if (typeof instr === 'string') {
    const texto = limpiar(instr);
    const porLineas = texto.split('\n').map((s) => s.trim()).filter(Boolean);
    return porLineas.length > 1 ? porLineas : texto.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).filter(Boolean);
  }
  if (Array.isArray(instr)) return instr.flatMap(pasos);
  if (typeof instr === 'object') {
    if (instr.itemListElement) {
      const dentro = pasos(instr.itemListElement);
      return instr['@type'] === 'HowToSection' && instr.name ? [`— ${limpiar(instr.name)} —`, ...dentro] : dentro;
    }
    return pasos(instr.text ?? instr.name ?? '');
  }
  return [];
}

const raciones = (y: unknown) => {
  const v = Array.isArray(y) ? y.find((x) => /\D/.test(String(x))) ?? y[0] : y;
  const t = limpiar(v);
  return /^\d+$/.test(t) ? `${t} raciones` : t;
};

export function extraerReceta(html: string) {
  const bloques = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, contenido] of bloques) {
    let datos: unknown;
    try {
      datos = JSON.parse(contenido.trim());
    } catch {
      try {
        datos = JSON.parse(contenido.trim().replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const r = buscarReceta(datos);
    if (!r) continue;
    const ingredientes = (r.recipeIngredient ?? r.ingredients ?? []) as unknown[];
    return {
      titulo: limpiar(r.name),
      raciones: raciones(r.recipeYield),
      tiempo: duracion(r.totalTime) || duracion(r.cookTime),
      ingredientes: ingredientes.map(limpiar).filter(Boolean).join('\n'),
      pasos: pasos(r.recipeInstructions).map(limpiar).filter(Boolean).join('\n'),
    };
  }
  return null;
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

if (globalThis.Deno?.serve) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let url: URL;
    try {
      const { url: u } = await req.json();
      url = new URL(u);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      return json({ error: 'Enlace no válido' }, 400);
    }
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
      });
      if (!r.ok) return json({ error: `La web respondió ${r.status}` }, 502);
      const receta = extraerReceta(await r.text());
      if (!receta) return json({ error: 'Esa página no tiene una receta reconocible' }, 422);
      return json(receta);
    } catch (e) {
      return json({ error: `No se ha podido abrir la página (${(e as Error).message})` }, 502);
    }
  });
}
