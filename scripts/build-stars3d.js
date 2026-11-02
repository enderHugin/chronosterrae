#!/usr/bin/env node
// build-stars3d.js - Datos para el movimiento ESPACIAL (3D) de las estrellas: velocidad radial y estrellas
// que hoy son demasiado debiles pero que, en algun momento de +/-100.000 anos, se ven a simple vista.
//
//   node scripts/build-stars3d.js --hyg <hygdata_v41.csv> --out data/sky
//
// Entrada: la MISMA copia de HYG v4.1 que build-stars.js (se comprueba su sha256 contra data/sky/manifest.json) y
// data/sky/stars.json (el catalogo ya publicado, V <= 6,5). Salida: data/sky/stars3d.json.
//
// Criterio del rigor (el motivo de este fichero):
//   - HYG escribe rv = 0 cuando NO conoce la velocidad radial (87.043 de 107.736 estrellas con paralaje). Un 0 exacto
//     es, por tanto, "desconocida", no "en reposo". Aqui se guarda solo la radial realmente medida.
//   - Una estrella sin rv se mueve con rv = 0 en el modelo y se marca; su incertidumbre se calcula con la dispersion
//     de las radiales conocidas DEL PROPIO catalogo (sin suponer ningun numero externo).
//   - Estrellas nuevas: solo las de rv conocida y paralaje valida (< 100000 pc en HYG) cuya magnitud, con movimiento
//     rectilineo, baja de 6,5 en algun momento de [-100000, 0]. Las de rv desconocida que PODRIAN llegar se cuentan
//     en el manifiesto como posible omision (no se pueden evaluar), no se incluyen.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAG_LIMIT = 6.5;
const T_MIN = -100000; const T_MAX = 0;           // anos respecto a J2000.0 en que se busca el brillo maximo
const D_MAX_PC = 200;                             // mas lejos no cambia el brillo apreciablemente en 100.000 anos
const PM_SENTINEL = 9999;
const K = 4.740470446;                            // km/s por (arcsec/ano * pc)
const KMS_TO_PCYR = 1.0227121650537077e-6;        // 1 km/s en pc/ano

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

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

/** Magnitud minima en [t0, t1] (anos) con movimiento rectilineo y sin tiempo de luz (basta para SELECCIONAR). */
function minMag(vmag, d, muArcsec, rv, t0, t1) {
    const vt = K * muArcsec * d * KMS_TO_PCYR; const vr = rv * KMS_TO_PCYR;
    const dist = (t) => Math.hypot(d + vr * t, vt * t);
    let tm = -(d * vr) / (vr * vr + vt * vt);            // minimo de la distancia
    if (!(tm >= t0 && tm <= t1)) tm = (dist(t0) < dist(t1)) ? t0 : t1;
    return vmag + 5 * Math.log10(dist(tm) / d);
}

function main() {
    const hygPath = arg('hyg'); const outDir = arg('out');
    if (!hygPath || !outDir) throw new Error('uso: --hyg <csv> --out <carpeta>');
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
    const src = manifest.sources.find((s) => s.id === 'hyg-v4.1');
    const hygBuf = fs.readFileSync(hygPath);
    if (sha256(hygBuf) !== src.sha256) throw new Error('el CSV de HYG no es el del manifiesto (sha256 distinto): ' + sha256(hygBuf));
    const cat = JSON.parse(fs.readFileSync(path.join(outDir, 'stars.json'), 'utf8'));
    const inCat = new Set(cat.stars.map((s) => s[0]));

    const lines = hygBuf.toString('utf8').split('\n').filter((l) => l.trim());
    const header = parseCsvLine(lines[0]);
    const ix = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error('HYG sin columna ' + n); return i; };
    const [iHip, iProper, iRa, iDec, iDist, iPmra, iPmdec, iRv, iMag, iCi, iCon] = ['hip', 'proper', 'ra', 'dec', 'dist', 'pmra', 'pmdec', 'rv', 'mag', 'ci', 'con'].map(ix);

    const rows = [];
    for (const line of lines.slice(1)) {
        const f = parseCsvLine(line);
        if (f[0] === '0') continue;
        const hip = parseInt(f[iHip], 10); if (!Number.isFinite(hip)) continue;
        const rv = parseFloat(f[iRv]);
        rows.push({
            hip, proper: f[iProper], ra: parseFloat(f[iRa]) * 15, dec: parseFloat(f[iDec]), dist: parseFloat(f[iDist]),
            pmra: parseFloat(f[iPmra]), pmde: parseFloat(f[iPmdec]), rv: Number.isFinite(rv) && rv !== 0 ? rv : null,
            mag: parseFloat(f[iMag]), ci: parseFloat(f[iCi]), con: f[iCon] || null
        });
    }

    // 1. Velocidad radial real de las estrellas ya publicadas
    const byHip = new Map(); for (const r of rows) if (!byHip.has(r.hip)) byHip.set(r.hip, r);
    const rv = {}; let withRv = 0; let sumSq = 0;
    for (const s of cat.stars) {
        const r = byHip.get(s[0]);
        if (r && r.rv !== null) { rv[s[0]] = +r.rv.toFixed(2); withRv++; sumSq += r.rv * r.rv; }
    }
    const rvRms = Math.sqrt(sumSq / withRv);   // dispersion de las radiales conocidas del propio catalogo (marca la incertidumbre de las desconocidas)

    // 2. Estrellas nuevas
    const extra = []; let possibleOmissions = 0; let candidates = 0;
    const seen = new Set();
    for (const r of rows) {
        if (inCat.has(r.hip) || seen.has(r.hip)) continue;
        seen.add(r.hip);
        if (!Number.isFinite(r.mag) || r.mag <= MAG_LIMIT) continue;                       // las de V <= 6,5 ya estan (o no tenian movimiento propio)
        if (!(r.dist > 0 && r.dist <= D_MAX_PC)) continue;
        if (!Number.isFinite(r.pmra) || !Number.isFinite(r.pmde) || Math.abs(r.pmra) >= PM_SENTINEL || Math.abs(r.pmde) >= PM_SENTINEL) continue;
        if (!Number.isFinite(r.ra) || !Number.isFinite(r.dec)) continue;
        candidates++;
        const mu = Math.hypot(r.pmra, r.pmde) / 1000;
        if (r.rv !== null) {
            if (minMag(r.mag, r.dist, mu, r.rv, T_MIN, T_MAX) <= MAG_LIMIT) {
                extra.push([r.hip, +r.ra.toFixed(6), +r.dec.toFixed(6), +r.pmra.toFixed(2), +r.pmde.toFixed(2), +(1000 / r.dist).toFixed(3), +r.mag.toFixed(2), Number.isFinite(r.ci) ? +r.ci.toFixed(3) : null, r.con, +r.rv.toFixed(2)]);
            }
        } else if (minMag(r.mag, r.dist, mu, rvRms, T_MIN, T_MAX) <= MAG_LIMIT || minMag(r.mag, r.dist, mu, -rvRms, T_MIN, T_MAX) <= MAG_LIMIT) {
            possibleOmissions++;
        }
    }
    extra.sort((a, b) => a[6] - b[6]);

    const withPlx = cat.stars.filter((s) => s[5] > 0).length;
    const body = {
        epoch_jyear: 2000,
        note: 'Velocidad radial (km/s) de las estrellas de stars.json que la tienen medida, y estrellas que hoy son mas debiles que V = ' + MAG_LIMIT + ' pero llegan a verse a simple vista en [-100000, 0] anos (rv conocida y paralaje valida). Datos de HYG v4.1 (CC BY-SA 4.0).',
        rv_unknown_means: 'ausente en "rv": no medida (HYG escribe 0 cuando no la conoce). El modelo usa 0 y la marca como incierta.',
        rv_rms_kms: +rvRms.toFixed(2),
        extra_fields: ['hip', 'ra_deg', 'dec_deg', 'pmra_mas_yr', 'pmde_mas_yr', 'plx_mas', 'vmag', 'bv', 'con', 'rv_kms'],
        rv, extra
    };
    const buf = Buffer.from(JSON.stringify(body) + '\n');
    fs.writeFileSync(path.join(outDir, 'stars3d.json'), buf);

    const stats = {
        catalogue_stars: cat.stars.length, with_parallax: withPlx, without_parallax: cat.stars.length - withPlx,
        with_radial_velocity: withRv, without_radial_velocity: cat.stars.length - withRv, rv_rms_kms: body.rv_rms_kms,
        extra_stars: extra.length, extra_candidates_evaluated: candidates, possible_omissions_unknown_rv: possibleOmissions
    };
    const m = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
    m.stars3d = { file: 'stars3d.json', bytes: buf.length, sha256: sha256(buf), hyg_sha256: src.sha256, window_years: [T_MIN, T_MAX], d_max_pc: D_MAX_PC, mag_limit: MAG_LIMIT, stats };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
    console.log(JSON.stringify(stats, null, 2));
}

main();
