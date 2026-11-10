# Panel de cocina

Web app (PWA) para la tablet de la cocina:

- **Agenda** con los eventos de vuestros calendarios de Google (hoy y próximos días).
- **Tareas**, con responsable y **repetición** (diaria, cada 2–3 días, semanal, quincenal o mensual).
- **Reparto**: a quién le toca cada tarea, quién ha hecho qué, recuento por persona y evolución semanal.
- **Notas** rápidas.
- **Menú de la semana**, enlazado con las recetas.
- **Recetas**: recetario propio, importación desde webs de recetas e **ingredientes de la semana** listos para dictárselos a Alexa.
- **Modo cocina**: paso a paso en grande, con temporizadores detectados en cada paso.
- **Temporizadores**, reloj, tiempo y modo noche.
- Botones a **Alexa (compra)** y **Ver**: YouTube, Prime Video, Disney+, HBO Max y Movistar Plus+.

Sin configurar funciona en *modo local* (solo en ese dispositivo, sin agenda ni importar recetas). Con **Supabase** se sincroniza al instante entre la tablet y vuestros móviles.

Todos los archivos van juntos en la raíz del repositorio:

```
index.html · styles.css · manifest.webmanifest · sw.js · iconos (.png)
config.js                    ← lo único que tienes que editar
app.js · agenda.js · recetas.js · temporizadores.js · store.js · util.js
schema.sql                   tablas para Supabase
funcion-calendario.ts        función "calendario" de Supabase
funcion-importar-receta.ts   función "importar-receta" de Supabase
```

---

## 1. Publicar en GitHub Pages (gratis)

1. Crea un repositorio en GitHub, por ejemplo `panel-cocina`. Los datos **no** van en el repositorio, solo el código.
2. *Add file → Upload files* y sube todos los archivos de esta carpeta.
3. *Settings → Pages*: Source **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. En un minuto estará en `https://TU-USUARIO.github.io/panel-cocina/`.

## 2. Instalar en la tablet

1. Abre esa dirección en **Chrome** → menú ⋮ → **Instalar aplicación**.
2. Ábrela desde el icono: pantalla completa y pantalla siempre encendida mientras está abierta.
3. Opcional: busca **"Fijar"** en Ajustes para bloquear la tablet en el panel (si quieres saltar a YouTube o Alexa, mejor no).

## 3. Supabase: sincronizar entre dispositivos

1. Crea una cuenta en [supabase.com](https://supabase.com) → *New project* (región Europa).
2. **SQL Editor → New query** → pega `schema.sql` → **Run**. Se puede volver a ejecutar sin problema cuando haya versiones nuevas.
3. **Authentication → Users → Add user**: una cuenta para cada uno (marca *Auto confirm*).
4. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**.
5. **Project Settings → API**: copia la **Project URL** y la clave **anon public** (o *publishable*) en `config.js` y súbelo a GitHub.

La primera vez, cada dispositivo pedirá email y contraseña.

> La clave *anon* está pensada para ir en el navegador; lo que protege los datos son las políticas de la base de datos y que no se puedan crear cuentas nuevas. En el plan gratuito, Supabase pausa los proyectos que pasan una semana sin uso: con el panel a diario no ocurre.

## 4. Agenda de Google Calendar

El panel lee vuestros calendarios a través de su **dirección secreta en formato iCal**, mediante una función de Supabase (el navegador no puede leerla directamente, y así la dirección secreta no queda en el código público).

**a) Copiar la dirección de cada calendario** (el tuyo, el de Sara y el compartido), desde calendar.google.com en el navegador:
Configuración ⚙ → en *Configuración de mis calendarios*, el calendario → **Integrar el calendario** → **Dirección secreta en formato iCal** → copiar. Es privada: quien la tenga ve el calendario.

Cada uno copia la de su calendario personal. La del **compartido** solo la ve quien lo creó (o quien tenga permiso para *hacer cambios y gestionar el uso compartido*).

**b) Crear la función** en Supabase → **Edge Functions → Deploy a new function → Via Editor**:
- Nombre: `calendario` (exactamente así).
- Pega el contenido de `funcion-calendario.ts` y pulsa **Deploy**.

**c) Guardar las direcciones** en **Edge Functions → Secrets → Add new secret**:
- Nombre: `CALENDARIOS`
- Valor (en este orden, para que los colores coincidan con las tareas: Rodrigo verde azulado, Sara morado y el compartido dorado):

```json
[{"nombre":"Rodrigo","url":"https://calendar.google.com/calendar/ical/.../basic.ics"},
 {"nombre":"Sara","url":"https://calendar.google.com/calendar/ical/.../basic.ics"},
 {"nombre":"Casa","url":"https://calendar.google.com/calendar/ical/.../basic.ics"}]
```

Si preferís ver solo el compartido, pon solo esa entrada (saldrá con el primer color).

La agenda se actualiza cada 10 minutos. Google puede tardar unos minutos en reflejar un evento nuevo en esa dirección. Los eventos se siguen creando desde el móvil, como siempre.

## 5. Importar recetas desde webs

Igual que antes: **Deploy a new function → Via Editor**, nombre `importar-receta`, pega `funcion-importar-receta.ts` → **Deploy**. No necesita secretos.

Funciona con la mayoría de webs de recetas (las que publican la receta en formato estructurado, que son casi todas). Si alguna no funciona, se puede escribir a mano.

## 6. Personalizar (`config.js`)

- `personas`: vuestros nombres (toca la etiqueta **Quién** de una tarea para ir cambiando).
- `compraUrl`: el botón **Compra** abre la app de Alexa; si no está instalada, la lista de la compra de Alexa en amazon.es.
- `apps`: las apps del botón **Ver**. Cada una abre su app de Android y, si no está instalada, su web. Puedes quitar, añadir o reordenar.
- `ciudad`, `latitud`, `longitud`: para el tiempo.
- `nocheDesde` / `nocheHasta`: horas del tema oscuro.

## Cómo se usa

- **Tareas que se repiten:** elige la frecuencia en el desplegable al crearla. Al marcarla desaparece y vuelve cuando toca (la verás en *Próximamente*). Las diarias y "cada X días" cuentan desde que se hacen; las semanales y mensuales mantienen su día. Para borrar una tarea: **Editar**.
- **¿Quién lo ha hecho?** Al marcar una tarea, elige Rodrigo, Sara o Los dos (se resalta a quien le tocaba). Si te equivocas, desmárcala o quítala del historial en *Reparto*.
- **Reparto:** en la tarjeta de Tareas, **Reparto ›**. Cambia entre esta semana, este mes y los últimos 3 meses. Toca una tarea en *A quién le toca* para pasársela al otro.
- **Menú y recetas:** escribe en el menú el nombre de una receta guardada (te lo sugiere al escribir) y aparece 📖 para abrirla.
- **Ingredientes de la semana:** en Recetas. Marca lo que ya tenéis y lee en voz alta la frase de Alexa que se genera con lo que falta.
- **Modo cocina:** en una receta, **▶ Cocinar**. Primero la lista de ingredientes, luego un paso por pantalla. Desliza o usa los botones para avanzar; los tiempos del paso ("hornea 25 minutos") aparecen como botones de temporizador.
- **Temporizadores:** cuando suena, toca el aviso para pararlo.

## Actualizar la app

Al cambiar archivos, sube en `sw.js` el número de `VERSION` (`panel-cocina-v3`, `v4`…). Si la tablet no coge la versión nueva, cierra la app y vuelve a abrirla.
