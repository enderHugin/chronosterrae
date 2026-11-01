#!/usr/bin/env node
// build-paleocoastlines.js - Paleocostas reales del Fanerozoico (PaleoMAP PaleoCoastlines).
//
// Fuente: Kocsis, A. T. y Scotese, C. R., "PaleoMAP PaleoCoastlines data", Zenodo,
// doi:10.5281/zenodo.7994000, licencia CC BY 4.0. Articulo asociado: Earth-Science
// Reviews, doi:10.1016/j.earscirev.2020.103463.
//
// Modos:
//   inspect   Descarga el zip, verifica su md5 contra Zenodo y vuelca la estructura
//             (ficheros, campos, geometrias, CRS). Necesario antes de convertir: no
//             se asume el formato.
//
// stdout = JSON con el informe. stderr = progreso. Requiere `unzip` y red completa
// (se ejecuta en el runner de GitHub, no en el entorno del agente).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const shapefile = require('shapefile');

const RECORD = '7994000';
const FILE = 'paleocoastlines_v7_shapefiles.zip';
const UA = 'ChronosTerrae-Build/0.1 (https://github.com/enderHugin/chronosterrae)';
const log = (...a) => console.error(...a);

const getBuffer = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return Buffer.from(await res.arrayBuffer());
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
});

async function download(workdir) {
    log('[BUILD] consultando registro de Zenodo ' + RECORD);
    const meta = JSON.parse((await getBuffer(`https://zenodo.org/api/records/${RECORD}`)).toString('utf8'));
    const entry = (meta.files || []).find((f) => f.key === FILE);
    if (!entry) throw new Error(`el registro no contiene ${FILE}`);

    const urls = [
        `https://zenodo.org/api/records/${RECORD}/files/${FILE}/content`,
        `https://zenodo.org/records/${RECORD}/files/${FILE}?download=1`
    ];
    let buf = null;
    let used = null;
    for (const u of urls) {
        try { log('[BUILD] descargando ' + u); buf = await getBuffer(u); used = u; break; } catch (err) { log('[WARN] ' + err.message); }
    }
    if (!buf) throw new Error('no se pudo descargar el zip');

    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const expected = String(entry.checksum || '').replace(/^md5:/, '');
    log(`[BUILD] md5 recibido ${md5} / esperado ${expected}`);
    if (expected && md5 !== expected) throw new Error('el md5 no coincide con el de Zenodo: descarga corrupta o alterada');

    const zip = path.join(workdir, FILE);
    fs.writeFileSync(zip, buf);
    const dir = path.join(workdir, 'unzipped');
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: ['ignore', 'ignore', 'inherit'] });
    return {
        dir,
        provenance: {
            record: `https://doi.org/10.5281/zenodo.${RECORD}`,
            title: meta.metadata && meta.metadata.title,
            license: meta.metadata && meta.metadata.license,
            publication_date: meta.metadata && meta.metadata.publication_date,
            file: FILE, bytes: buf.length, md5, sha256, downloaded_from: used,
            retrieved_at: new Date().toISOString()
        }
    };
}

async function inspectShp(shp) {
    const dbf = shp.replace(/\.shp$/i, '.dbf');
    const prj = shp.replace(/\.shp$/i, '.prj');
    const source = await shapefile.open(shp, fs.existsSync(dbf) ? dbf : undefined);
    const geomTypes = {};
    const fieldValues = {};
    const samples = [];
    let count = 0;
    for (;;) {
        const r = await source.read();
        if (r.done) break;
        count += 1;
        const g = r.value.geometry ? r.value.geometry.type : 'null';
        geomTypes[g] = (geomTypes[g] || 0) + 1;
        const props = r.value.properties || {};
        if (samples.length < 3) samples.push(props);
        Object.entries(props).forEach(([k, v]) => {
            const set = fieldValues[k] || (fieldValues[k] = new Set());
            if (set.size < 40) set.add(v);
        });
    }
    return {
        file: shp,
        features: count,
        bbox: source.bbox || null,
        geometry_types: geomTypes,
        fields: Object.fromEntries(Object.entries(fieldValues).map(([k, set]) => [k, { distinct_sampled: set.size, values: [...set].slice(0, 25) }])),
        sample_properties: samples,
        prj: fs.existsSync(prj) ? fs.readFileSync(prj, 'utf8').slice(0, 400) : null
    };
}

async function inspect() {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'paleocoast-'));
    const { dir, provenance } = await download(workdir);
    const files = walk(dir).map((f) => ({ path: path.relative(dir, f), bytes: fs.statSync(f).size }));
    const shps = files.filter((f) => /\.shp$/i.test(f.path));
    log(`[BUILD] ${files.length} ficheros, ${shps.length} shapefiles`);
    const layers = [];
    for (const f of shps) {
        try { layers.push(await inspectShp(path.join(dir, f.path))); } catch (err) { layers.push({ file: f.path, error: err.message }); }
        log('[BUILD] leido ' + f.path);
    }
    layers.forEach((l) => { if (l.file) l.file = path.relative(dir, l.file); });
    process.stdout.write(JSON.stringify({ provenance, files, layers }, null, 2) + '\n');
}

const mode = process.argv[2] || 'inspect';
const modes = { inspect };
if (!modes[mode]) { log('Modo desconocido: ' + mode); process.exit(2); }
modes[mode]().catch((err) => {
    log('[ERR] ' + err.message);
    process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
    process.exitCode = 1;
});
