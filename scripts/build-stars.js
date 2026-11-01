#!/usr/bin/env node
// build-stars.js - Catalogo estelar propio de ChronosTerrae.
//
// Se ejecuta en el runner de GitHub (que tiene internet), nunca en el navegador:
//   node scripts/build-stars.js inspect            -> informe JSON de lo que devuelve VizieR (stdout)
//   node scripts/build-stars.js convert <outdir>   -> data/sky/{stars,constellations,manifest}.json
//
// Fuentes:
//   - Hipparcos (ESA 1997), a traves de VizieR (CDS): posiciones ICRS en epoca J1991.25,
//     movimientos propios, paralaje y magnitud. Es lo que permite mover las estrellas con los siglos.
//   - d3-celestial (O. Frohn, BSD-3-Clause), SOLO para nombres propios y figuras de constelaciones.
//     Las figuras vienen como coordenadas J2000; aqui se enlazan a numeros Hipparcos.
//
// Regla del proyecto: no se asume nada de una API externa. El modo "inspect" existe para ver
// los nombres de columna y las epocas reales antes de escribir la conversion.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Servidores TAP de VizieR (CDS y espejos). Se prueban en orden; el primero que responde se usa.
const TAP_SERVERS = [
    'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync',
    'https://vizier.cfa.harvard.edu/TAPVizieR/tap/sync',
    'https://vizier.china-vo.org/TAPVizieR/tap/sync'
];
let TAP = TAP_SERVERS[0];
const USER_AGENT = 'ChronosTerrae-Build/0.1 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 120000;
const MAG_LIMIT = 6.5;

const tap = async (query, format = 'json') => {
    const body = new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: format, QUERY: query });
    const res = await fetch(TAP, {
        method: 'POST',
        body,
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const text = await res.text();
    if (!res.ok) throw new Error('VizieR TAP HTTP ' + res.status + ': ' + text.slice(0, 300));
    return format === 'json' ? JSON.parse(text) : text;
};

// "fetch failed" no dice nada: la causa real esta en err.cause (DNS, conexion rechazada, TLS, tiempo...).
const describe = (err) => {
    const c = err && err.cause;
    return err.message + (c ? ' [' + (c.code || c.name || '') + ' ' + (c.message || '') + ']' : '');
};
const safe = async (label, fn) => {
    try { return await fn(); } catch (err) { return { error: label + ': ' + describe(err) }; }
};

// Comprueba cada servidor con una consulta trivial y se queda con el primero que responde.
async function pickServer() {
    const tried = [];
    for (const url of TAP_SERVERS) {
        TAP = url;
        try {
            const r = await tap('SELECT TOP 1 HIP FROM "I/239/hip_main"');
            tried.push({ url, ok: true, rows: r.data ? r.data.length : null });
            return { chosen: url, tried };
        } catch (err) {
            tried.push({ url, ok: false, error: describe(err) });
        }
    }
    TAP = null;
    return { chosen: null, tried };
}

// Interfaz ASU de VizieR (texto separado por tabuladores). El espejo del CfA (Harvard) responde
// desde GitHub aunque el servidor de Estrasburgo no.
const ASU = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv';
const asuRaw = async (params) => {
    const url = ASU + '?' + params;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) throw new Error('ASU HTTP ' + res.status + ': ' + text.slice(0, 200));
    return text;
};

async function inspectAsu(out) {
    out.asu = {};
    out.asu.sample = await safe('asu sample', async () => (await asuRaw('-source=I/239/hip_main&-out.max=3&-out.all=1')).split('\n').slice(0, 80));
    out.asu.brightest = await safe('asu brightest', async () => (await asuRaw('-source=I/239/hip_main&-out.max=12&-out=HIP,RAICRS,DEICRS,Plx,pmRA,pmDE,Vmag,B-V&Vmag=%3C0&-sort=Vmag')).split('\n').slice(0, 60));
    out.asu.count = await safe('asu count', async () => {
        const t = await asuRaw('-source=I/239/hip_main&-out.max=unlimited&-out=HIP&Vmag=%3C6.5');
        const rows = t.split('\n').filter((l) => /^\s*\d+\s*$/.test(l));
        return { bytes: t.length, hip_rows: rows.length };
    });
    out.asu.hip2 = await safe('asu hip2', async () => (await asuRaw('-source=I/311/hip2&-out.max=3&-out.all=1')).split('\n').slice(0, 60));
}

async function inspect() {
    const out = { probed_at: new Date().toISOString() };
    await inspectAsu(out);
    out.servers = await pickServer();
    out.tap = TAP;
    if (!TAP) { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); return; }
    for (const table of ['I/239/hip_main', 'I/311/hip2']) {
        out[table] = {};
        out[table].columns = await safe('columns', async () => {
            const r = await tap(`SELECT column_name, datatype, unit, description FROM TAP_SCHEMA.columns WHERE table_name = '${table}'`);
            return r.data.map((row) => row.join(' | '));
        });
        out[table].sample = await safe('sample', () => tap(`SELECT TOP 3 * FROM "${table}"`));
    }
    out.count_hip_main_v65 = await safe('count', () => tap(`SELECT COUNT(*) FROM "I/239/hip_main" WHERE Vmag < ${MAG_LIMIT}`));
    out.known = await safe('known', () => tap('SELECT * FROM "I/239/hip_main" WHERE HIP IN (32349, 91262, 11767, 69673, 68756)'));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

async function convert() {
    throw new Error('convert: pendiente de escribir tras ver el informe de inspect (columnas y epoca reales).');
}

const mode = process.argv[2];
(mode === 'inspect' ? inspect() : mode === 'convert' ? convert(process.argv[3]) : Promise.reject(new Error('uso: inspect | convert <outdir>')))
    .catch((err) => { console.error('[ERR] ' + err.message); process.exitCode = 1; });

module.exports = { MAG_LIMIT };
void fs; void path; void crypto;
