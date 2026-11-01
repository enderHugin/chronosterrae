#!/usr/bin/env node
// build-stars.js - Catalogo estelar propio de ChronosTerrae (data/sky/).
//
//   node scripts/build-stars.js --hyg <hygdata_v41.csv> --hyg-commit <sha> --d3 <carpeta data de d3-celestial> --out data/sky
//
// Fuentes (todas descargables sin cuentas; no se llama a ninguna API):
//   - HYG Database v4.1 (David Nash / astronexus), CC BY-SA 4.0: posiciones y movimientos propios J2000.0,
//     magnitud visual, color B-V, nombres propios IAU. Compilado a partir de Hipparcos, Yale BSC y Gliese.
//   - d3-celestial 0.7.35 (Olaf Frohn), BSD-3-Clause: SOLO las figuras de constelaciones (coordenadas J2000)
//     y los nombres de constelaciones en espanol. Aqui las figuras se enlazan a numeros Hipparcos.
//
// Reglas del proyecto: nada inventado. Una estrella sin numero Hipparcos no entra; un vertice de figura que no
// coincide con ninguna estrella (a menos de MATCH_DEG) se descarta y se cuenta en el manifiesto.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAG_LIMIT = 6.5;
const MATCH_DEG = 0.02;
const PM_SENTINEL = 9999;    // HYG usa 9999.99 cuando el movimiento propio no es utilizable

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (name) => { const v = arg(name); if (!v) throw new Error('falta --' + name); return v; };

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// CSV con comillas dobles (los campos de HYG no llevan saltos de linea).
function parseCsvLine(line) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out;
}

function main() {
    const hygPath = need('hyg'); const d3Dir = need('d3'); const outDir = need('out');
    const hygCommit = need('hyg-commit');
    const hygBuf = fs.readFileSync(hygPath);
    const lines = hygBuf.toString('utf8').split('\n').filter((l) => l.trim());
    const header = parseCsvLine(lines[0]);
    const ix = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error('HYG sin columna ' + n); return i; };
    const [iHip, iProper, iRa, iDec, iDist, iPmra, iPmdec, iMag, iCi, iCon] = ['hip', 'proper', 'ra', 'dec', 'dist', 'pmra', 'pmdec', 'mag', 'ci', 'con'].map(ix);

    const stats = { hyg_rows: lines.length - 1, mag_le_limit: 0, without_hip: 0, bad_proper_motion: 0, kept: 0, duplicate_hip: 0 };
    const stars = []; const names = {}; const seen = new Set();
    for (const line of lines.slice(1)) {
        const f = parseCsvLine(line);
        const mag = parseFloat(f[iMag]);
        if (!Number.isFinite(mag) || mag > MAG_LIMIT || f[0] === '0') continue;     // la fila 0 es el Sol
        stats.mag_le_limit++;
        const hip = parseInt(f[iHip], 10);
        if (!Number.isFinite(hip)) { stats.without_hip++; continue; }
        if (seen.has(hip)) { stats.duplicate_hip++; continue; }
        const pmra = parseFloat(f[iPmra]); const pmde = parseFloat(f[iPmdec]);
        if (!Number.isFinite(pmra) || !Number.isFinite(pmde) || Math.abs(pmra) >= PM_SENTINEL || Math.abs(pmde) >= PM_SENTINEL) { stats.bad_proper_motion++; continue; }
        const raH = parseFloat(f[iRa]); const dec = parseFloat(f[iDec]);
        if (!Number.isFinite(raH) || !Number.isFinite(dec)) continue;
        const dist = parseFloat(f[iDist]);
        const plx = Number.isFinite(dist) && dist > 0 && dist < 100000 ? 1000 / dist : 0;   // HYG: >= 100000 = paralaje dudosa
        const ci = parseFloat(f[iCi]);
        seen.add(hip);
        stars.push([hip, +(raH * 15).toFixed(6), +dec.toFixed(6), +pmra.toFixed(2), +pmde.toFixed(2), +plx.toFixed(2), +mag.toFixed(2), Number.isFinite(ci) ? +ci.toFixed(3) : null, f[iCon] || null]);
        if (f[iProper]) names[hip] = [f[iProper], null];
        stats.kept++;
    }
    stars.sort((a, b) => a[6] - b[6]);

    // Figuras de constelaciones: vertice (lng,lat J2000) -> estrella mas cercana del catalogo
    const cdir = path.join(d3Dir, 'data');
    const linesFile = fs.readFileSync(path.join(cdir, 'constellations.lines.json'));
    const namesFile = fs.readFileSync(path.join(cdir, 'constellations.json'));
    const lineJson = JSON.parse(linesFile); const nameJson = JSON.parse(namesFile);
    const rad = Math.PI / 180;
    const unit = stars.map((s) => { const a = s[1] * rad; const d = s[2] * rad; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; });
    const cosTol = Math.cos(MATCH_DEG * rad);
    const cstats = { vertices: 0, unmatched: 0, segments: 0, dropped_segments: 0 };
    const unmatched = [];
    const nearest = (lng, lat) => {
        const a = lng * rad; const d = lat * rad;
        const v = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
        let best = -1; let bestDot = cosTol;
        for (let i = 0; i < unit.length; i++) {
            const dot = unit[i][0] * v[0] + unit[i][1] * v[1] + unit[i][2] * v[2];
            if (dot > bestDot || (dot > cosTol && best >= 0 && Math.abs(dot - bestDot) < 1e-12 && stars[i][6] < stars[best][6])) { bestDot = dot; best = i; }
        }
        return best;
    };
    const nameById = new Map(nameJson.features.map((f) => [f.id, f.properties]));
    const constellations = lineJson.features.map((feat) => {
        const props = nameById.get(feat.id) || {};
        const segs = [];
        for (const strip of feat.geometry.coordinates) {
            let prev = null;
            for (const [lng, lat] of strip) {
                cstats.vertices++;
                const i = nearest(lng, lat);
                if (i < 0) { cstats.unmatched++; unmatched.push(feat.id + ' ' + lng + ',' + lat); prev = null; continue; }
                const hip = stars[i][0];
                if (prev !== null && prev !== hip) { segs.push([prev, hip]); cstats.segments++; }
                prev = hip;
            }
        }
        return { id: feat.id, la: props.la || null, en: props.en || null, es: props.es || null, lines: segs };
    });

    fs.mkdirSync(outDir, { recursive: true });
    const write = (name, obj) => { const buf = Buffer.from(JSON.stringify(obj) + '\n'); fs.writeFileSync(path.join(outDir, name), buf); return { file: name, bytes: buf.length, sha256: sha256(buf) }; };
    const starsOut = write('stars.json', {
        epoch_jyear: 2000,
        note: 'Posiciones ICRS/J2000.0 y movimientos propios (mas*a-1; pmra ya incluye cos(dec)) de HYG v4.1. Solo estrellas con numero Hipparcos y V <= ' + MAG_LIMIT + '.',
        fields: ['hip', 'ra_deg', 'dec_deg', 'pmra_mas_yr', 'pmde_mas_yr', 'plx_mas', 'vmag', 'bv', 'con'],
        names,
        stars
    });
    const conOut = write('constellations.json', { constellations });
    fs.writeFileSync(path.join(outDir, 'NOTICE.md'), [
        '# Catalogo estelar (data/sky/stars.json, constellations.json)',
        '',
        'Estos ficheros son datos derivados y llevan su propia licencia, distinta de la del codigo (MIT):',
        '',
        '- **HYG Database v4.1** (David Nash, astronexus.com; https://github.com/astronexus/HYG-Database, commit `' + hygCommit + '`),',
        '  licencia **Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)**. HYG compila Hipparcos (ESA 1997, SP-1200),',
        '  el Yale Bright Star Catalog y el catalogo Gliese. `stars.json` es una adaptacion (seleccion, redondeo, reordenacion):',
        '  se redistribuye bajo **CC BY-SA 4.0**; quien la reutilice debe atribuir a HYG y compartir bajo la misma licencia.',
        '- **d3-celestial 0.7.35** (Olaf Frohn), licencia BSD-3-Clause: figuras de constelaciones y sus nombres en espanol',
        '  (`constellations.json`). Copyright (c) 2015, Olaf Frohn.',
        '',
        'Los datos subyacentes (posiciones y movimientos propios) son mediciones astronomicas; la atribucion a ESA/Hipparcos se conserva.',
        ''
    ].join('\n'));
    const manifest = {
        generated_at: new Date().toISOString(),
        sources: [
            { id: 'hyg-v4.1', url: 'https://github.com/astronexus/HYG-Database', commit: hygCommit, file: 'hyg/CURRENT/hygdata_v41.csv', sha256: sha256(hygBuf), license: 'CC-BY-SA-4.0' },
            { id: 'd3-celestial-0.7.35', url: 'https://github.com/ofrohn/d3-celestial', files: { 'constellations.lines.json': sha256(linesFile), 'constellations.json': sha256(namesFile) }, license: 'BSD-3-Clause' }
        ],
        mag_limit: MAG_LIMIT, match_deg: MATCH_DEG, epoch_jyear: 2000,
        files: { [starsOut.file]: { bytes: starsOut.bytes, sha256: starsOut.sha256 }, [conOut.file]: { bytes: conOut.bytes, sha256: conOut.sha256 } },
        stars: stats, constellations: cstats, unmatched_vertices: unmatched.slice(0, 50)
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.error(JSON.stringify({ stats, cstats }, null, 1));
}

try { main(); } catch (err) { console.error('[ERR] ' + err.message); process.exitCode = 1; }
