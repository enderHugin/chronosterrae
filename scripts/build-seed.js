#!/usr/bin/env node
// build-seed.js - Sucesos con HORA verificada a mano (data/events/seed.json).
//
// Cada entrada reproduce lo que dice la fuente citada, con su cita literal, y nada mas. Si una fuente no da
// la hora (p. ej. la muerte de Pio XII: la Wikipedia solo da el dia) el suceso NO va aqui: entra por Wikidata
// con precision de dia. Lugares: solo si la fuente da coordenadas.
//
//   node scripts/build-seed.js            -> escribe data/events/seed.json
// Las pruebas (check.js) vuelven a generarlo y comprueban que el fichero del repo es identico.

'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../sky/sky.js');

const JD_1950 = 2433282.5;
const RETRIEVED = '2026-11-01T17:30:00Z';

// utc: [Y, M, D, h, m, s] ya en UTC (la conversion de husos, si la hay, esta escrita en `note`)
const SEED = [
    {
        id: 'seed.vostok-1-launch', name: 'Vostok 1 launch (first human in space)', labels: { en: 'Vostok 1 launch (first human in space)', es: 'Lanzamiento de la Vostok 1 (primer humano en el espacio)' },
        kind: 'event', importance: 1, utc: [1961, 4, 12, 6, 7, 0], precision: 'minute', uncertainty_s: 60, basis: 'utc', clock_text: '06:07 UTC',
        place: [63.342, 45.920], position_uncertainty_m: 300,
        description: { en: 'Launch of Vostok 1 with Yuri Gagarin from Baikonur, Gagarin\'s Start. Time as published to the minute.', es: 'Lanzamiento de la Vostok 1 con Yuri Gagarin desde Baikonur (Rampa de Gagarin). Hora tal como se publica, al minuto.' },
        sources: [
            { id: 'https://en.wikipedia.org/wiki/Vostok_1', citation: 'Wikipedia, «Vostok 1», infobox: "April 12, 1961, 06:07 UTC"; "Baikonur, Site 1/5".' },
            { id: 'https://en.wikipedia.org/wiki/Baikonur_Cosmodrome', citation: 'Wikipedia, «Baikonur Cosmodrome»: "Pad 1/5 (Gagarin\'s Start)" 45°55′12″N 63°20′31″E / 45.920°N 63.342°E.' }
        ]
    },
    {
        id: 'seed.sputnik-1-launch', name: 'Sputnik 1 launch', labels: { en: 'Sputnik 1 launch', es: 'Lanzamiento del Sputnik 1' },
        kind: 'event', importance: 1, utc: [1957, 10, 4, 19, 28, 34], precision: 'second', uncertainty_s: 1, basis: 'utc', clock_text: '19:28:34 UTC',
        place: [63.342, 45.920], position_uncertainty_m: 300,
        description: { en: 'Launch of the first artificial satellite. The article notes it was already 5 October at the launch site.', es: 'Lanzamiento del primer satélite artificial. La fuente advierte que en el lugar de lanzamiento ya era 5 de octubre.' },
        sources: [
            { id: 'https://en.wikipedia.org/wiki/Sputnik_1', citation: 'Wikipedia, «Sputnik 1»: "4 October 1957", "19:28:34 UTC" (5 October at the launch site), "Baikonur Cosmodrome Site 1/5".' },
            { id: 'https://en.wikipedia.org/wiki/Baikonur_Cosmodrome', citation: 'Wikipedia, «Baikonur Cosmodrome»: "Pad 1/5 (Gagarin\'s Start)" 45°55′12″N 63°20′31″E / 45.920°N 63.342°E (el Sitio 1/5 del artículo del Sputnik es esa misma rampa).' }
        ]
    },
    {
        id: 'seed.titanic-sinking', name: 'Sinking of the Titanic (completely under)', labels: { en: 'Sinking of the Titanic', es: 'Hundimiento del Titanic' },
        kind: 'event', importance: 1, utc: [1912, 4, 15, 5, 18, 0], precision: 'minute', uncertainty_s: 120, basis: 'utc', clock_text: '02:20 hora de a bordo = 05:18 GMT',
        place: [-49.94694, 41.72556], position_uncertainty_m: 2000,
        description: { en: 'She sank at 02:20 ship\'s time on 15 April; the source gives the equivalent 05:18 GMT. The ship\'s clock zone is not defined by the source, so ±2 min is declared.', es: 'Se hundió a las 02:20 hora de a bordo del 15 de abril; la fuente da el equivalente 05:18 GMT. La fuente no define el huso del reloj del barco, por eso se declara ±2 min.' },
        sources: [
            { id: 'https://en.wikipedia.org/wiki/Sinking_of_the_Titanic', citation: 'Wikipedia, «Sinking of the Titanic»: "She sank two hours and forty minutes later at 02:20 ship\'s time"; infobox "23:40–02:20 (02:38–05:18 GMT)"; "41°43′32″N 49°56′49″W".' }
        ]
    },
    {
        id: 'seed.chernobyl-explosion', name: 'Chernobyl disaster (reactor 4 explosion)', labels: { en: 'Chernobyl disaster (reactor 4 explosion)', es: 'Desastre de Chernóbil (explosión del reactor 4)' },
        kind: 'event', importance: 1, utc: [1986, 4, 25, 21, 23, 0], precision: 'minute', uncertainty_s: 60, basis: 'local_civil', utc_offset_minutes: 240, clock_text: '01:23 MSD (UTC+04:00), 26 abril 1986',
        place: [30.09917, 51.38972], position_uncertainty_m: 500,
        description: { en: 'Infobox time 01:23 Moscow Summer Time (UTC+4) on 26 April, i.e. 21:23 UTC on 25 April. The article gives 01:23:04 as the start of the test and 01:23:40 as the AZ-5 press; the explosion followed within seconds, so minute precision is declared.', es: 'Hora del infobox 01:23 hora de verano de Moscú (UTC+4) del 26 de abril, es decir 21:23 UTC del 25 de abril. El artículo da 01:23:04 como inicio de la prueba y 01:23:40 como pulsación del AZ-5; la explosión siguió en segundos, por eso se declara precisión de minuto.' },
        sources: [
            { id: 'https://en.wikipedia.org/wiki/Chernobyl_disaster', citation: 'Wikipedia, «Chernobyl disaster», infobox: "26 April 1986", "01:23 MSD (UTC+04:00)"; coordenadas "51°23′23″N 30°05′57″E".' }
        ]
    },
    {
        id: 'seed.challenger-breakup', name: 'Space Shuttle Challenger disaster', labels: { en: 'Space Shuttle Challenger disaster', es: 'Desastre del transbordador Challenger' },
        kind: 'event', importance: 1, utc: [1986, 1, 28, 16, 39, 13], precision: 'second', uncertainty_s: 1, basis: 'utc', clock_text: '16:39:13 UTC (11:39:13 EST)',
        place: [-80.28, 28.64], position_uncertainty_m: 5000,
        description: { en: 'Breakup of the shuttle 73 seconds after launch, off the coast of Florida (position as given by the source).', es: 'Rotura del transbordador frente a la costa de Florida (posición tal como la da la fuente).' },
        sources: [
            { id: 'https://en.wikipedia.org/wiki/Space_Shuttle_Challenger_disaster', citation: 'Wikipedia, «Space Shuttle Challenger disaster», infobox: "16:39:13 UTC (11:39:13 EST)"; "28°38′24″N 80°16′48″W".' }
        ]
    }
];

function build() {
    const features = SEED.map((e) => {
        const [Y, M, D, h, m, s] = e.utc;
        const { jd, calendar } = S.calendarToJD({ year: Y, month: M, day: D, hour: h, minute: m, second: s }, 'auto');
        const ybp = +((JD_1950 - jd) / 365.25).toFixed(9);
        const instant = { jd_ut: +jd.toFixed(8), basis: e.basis, clock_text: e.clock_text, uncertainty_s: e.uncertainty_s };
        if (e.basis === 'local_civil') instant.utc_offset_minutes = e.utc_offset_minutes;
        return {
            type: 'Feature',
            geometry: e.place ? { type: 'Point', coordinates: e.place } : null,
            properties: {
                id: e.id, name: e.name, labels: e.labels, description: e.description, layer: 'event', kind: e.kind, importance: e.importance,
                evidence: 'documentary',
                ...(e.position_uncertainty_m ? { position_uncertainty_m: e.position_uncertainty_m } : {}),
                time: {
                    start_ybp: ybp, end_ybp: ybp, uncertainty_yr: +(e.uncertainty_s / 31557600).toExponential(3) * 1, precision: e.precision,
                    iso: new Date(Date.UTC(Y, M - 1, D, h, m, s)).toISOString().replace('.000Z', 'Z'), calendar, instant
                },
                scale: { min_m: 50, max_m: 20000000 },
                sources: e.sources.map((src) => ({ kind: 'url', id: src.id, citation: src.citation, retrieved_at: RETRIEVED })),
                status: 'community'
            }
        };
    });
    return { type: 'FeatureCollection', features };
}

if (require.main === module) {
    const out = path.resolve(__dirname, '..', 'data/events/seed.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(build(), null, 1) + '\n');
    console.log('escrito ' + out + ' (' + SEED.length + ' sucesos)');
}
module.exports = { build, SEED };
