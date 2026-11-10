// Función de Supabase "calendario"
// Lee los calendarios de Google (enlace iCal privado) y devuelve los eventos
// de los próximos días, con las repeticiones ya expandidas.
//
// Secreto necesario (Edge Functions → Secrets):
//   CALENDARIOS = [{"nombre":"Rodrigo","url":"https://calendar.google.com/calendar/ical/.../basic.ics"},
//                  {"nombre":"Pareja","url":"https://calendar.google.com/calendar/ical/.../basic.ics"}]
import ICAL from 'npm:ical.js@2.1.0';

const DIAS = 8;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type Evento = {
  titulo: string;
  lugar: string | null;
  inicio: string; // ISO (con hora) o 'YYYY-MM-DD' (todo el día)
  fin: string; // exclusivo
  todoElDia: boolean;
  calendario: number;
};

const fechaIso = (t: any) =>
  `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;

/** Eventos de un .ics que se solapan con [desde, hasta) */
export function eventosEntre(ics: string, desde: Date, hasta: Date, calendario = 0): Evento[] {
  const raiz = new ICAL.Component(ICAL.parse(ics));
  for (const tz of raiz.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* zona ya registrada o inválida */
    }
  }

  // eventos base y sus excepciones (instancias modificadas de una serie)
  const base = new Map<string, any>();
  const excepciones: any[] = [];
  for (const v of raiz.getAllSubcomponents('vevent')) {
    if (v.hasProperty('recurrence-id')) excepciones.push(v);
    else base.set(v.getFirstPropertyValue('uid') as string, new ICAL.Event(v));
  }
  for (const v of excepciones) {
    const ev = base.get(v.getFirstPropertyValue('uid') as string);
    if (ev) ev.relateException(v);
    else base.set(`${v.getFirstPropertyValue('uid')}#${v.getFirstPropertyValue('recurrence-id')}`, new ICAL.Event(v));
  }

  const res: Evento[] = [];
  const anadir = (comp: any, ini: any, fin: any) => {
    if (String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return;
    const todoElDia = ini.isDate;
    let finReal = fin;
    if (todoElDia && fin.compare(ini) <= 0) {
      finReal = ini.clone();
      finReal.day += 1;
    }
    const iniJs = ini.toJSDate();
    const finJs = finReal.toJSDate();
    if (!(iniJs < hasta && finJs > desde)) return;
    res.push({
      titulo: String(comp.getFirstPropertyValue('summary') ?? ''),
      lugar: (comp.getFirstPropertyValue('location') as string) || null,
      inicio: todoElDia ? fechaIso(ini) : iniJs.toISOString(),
      fin: todoElDia ? fechaIso(finReal) : finJs.toISOString(),
      todoElDia,
      calendario,
    });
  };

  for (const ev of base.values()) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      anadir(ev.component, ev.startDate, ev.endDate ?? ev.startDate);
      continue;
    }
    const it = ev.iterator();
    let siguiente: any | null;
    let vueltas = 0;
    while ((siguiente = it.next()) && vueltas++ < 50000) {
      const d = ev.getOccurrenceDetails(siguiente);
      if (d.startDate.toJSDate() >= hasta) break;
      anadir(d.item.component, d.startDate, d.endDate);
    }
  }
  return res.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

if (globalThis.Deno?.serve) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let calendarios: { nombre: string; url: string }[];
    try {
      calendarios = JSON.parse(Deno.env.get('CALENDARIOS') ?? '[]');
    } catch {
      return json({ error: 'El secreto CALENDARIOS no es un JSON válido' }, 500);
    }
    if (!calendarios.length) return json({ error: 'Falta el secreto CALENDARIOS' }, 500);

    const desde = new Date();
    desde.setUTCHours(0, 0, 0, 0);
    desde.setUTCDate(desde.getUTCDate() - 1); // margen por zona horaria
    const hasta = new Date(desde.getTime() + (DIAS + 1) * 86400000);

    const errores: string[] = [];
    const listas = await Promise.all(
      calendarios.map(async (c, i) => {
        try {
          const r = await fetch(c.url, { headers: { 'User-Agent': 'panel-cocina' } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return eventosEntre(await r.text(), desde, hasta, i);
        } catch (e) {
          errores.push(`${c.nombre}: ${(e as Error).message}`);
          return [];
        }
      }),
    );
    return json({
      calendarios: calendarios.map((c) => c.nombre),
      eventos: listas.flat().sort((a, b) => a.inicio.localeCompare(b.inicio)),
      errores,
    });
  });
}
