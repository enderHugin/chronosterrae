# ChronosTerrae: instrucciones para agentes

**Antes de nada, lee `docs/VISION.md`.** Es la visión del creador y la memoria del
proyecto. No la recortes ni la reinterpretes a la baja: el rumbo técnico se puede cambiar,
el objetivo no.

## Autorización del creador

El dueño del repositorio (`enderHugin`) ha autorizado explícitamente a los agentes a
escribir en `main` y a cambiar la dirección técnica si eso acerca el proyecto a su visión.
Aun así, antes de cada push: `git pull --rebase origin main` (el bot de ingesta también
escribe en `main`).

## Reglas

1. **Nunca inventes** DOI, identificadores de Wikidata, coordenadas, fechas ni citas. Si no
   puedes verificarlo, déjalo fuera y dilo.
2. Todo dato nuevo debe cumplir `schemas/record.schema.json` (fecha con incertidumbre,
   calendario, escala, fuente, tipo de evidencia, estado). Un dato generado por IA no puede
   superar `community`.
3. Distingue siempre evidencia de reconstrucción en lo que se muestra al usuario.
4. No copies datos GPL al repositorio (MIT); cárgalos en ejecución con atribución.
5. No pidas ni almacenes claves o cuentas de colaboradores.
6. El entorno del agente solo alcanza GitHub y npm. **No supongas el comportamiento de una
   API externa**: pruébala con `scripts/probe.js` (workflow `probe.yml`, resultado en la
   rama `probe-results`).
7. Una prueba que comprueba un rechazo debe distinguir «rechazado» de «roto».
8. **Un arreglo visual no está arreglado hasta verlo en el render real.** Las pruebas con mapa simulado no ven
   lo que ve el usuario. El workflow `probe-shot.yml` fotografía la web publicada (serie fija `SUITE` en
   `scripts/probe-shot.js`, claro y oscuro) tras cada publicación; el resultado va a la rama `probe-shot`. Mira las
   imágenes antes de decir que algo está arreglado. Para una vista concreta: ejecútalo a mano con `lng`, `lat`, `zoom`
   (devuelve además qué capa dibuja cada punto y variantes con capas apagadas).

## Comandos

```bash
npm ci
npm test            # check.js (regresiones) + validate (registros contra el esquema)
node scripts/probe.js > probe.json   # solo útil con internet completo
```

## Mapa del repo

- `index.html`: cliente web (MapLibre).
- `schemas/`: esquema de registros y ejemplos.
- `scripts/`: harvester, archivo, validación, sonda, comprobaciones.
- `data/harvests/` y `latest_harvest.json`: ingesta diaria automática (bot).
- `.github/workflows/`: `ci.yml`, `harvest.yml`, `probe.yml`.
- `docs/VISION.md`: visión y hoja de ruta.
- `docs/FUENTES.md`: inventario de fuentes (licencia verificada o pendiente) y contrastes entre fuentes (`sources.yml`, rama `sources`).
