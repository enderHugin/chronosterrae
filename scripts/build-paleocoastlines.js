#!/usr/bin/env node
// build-paleocoastlines.js - Paleocostas reales del Fanerozoico (PaleoMAP PaleoCoastlines).
//
// Fuente: Kocsis, A. T. y Scotese, C. R., "PaleoMAP PaleoCoastlines data", Zenodo,
// doi:10.5281/zenodo.7994000, licencia CC BY 4.0. Articulo asociado: Earth-Science
// Reviews, doi:10.1016/j.earscirev.2020.103463.
//
// Modos:
//   inspect              Descarga el zip, verifica su md5 contra Zenodo y vuelca la estructura
//                        (ficheros, campos, geometrias, CRS). No se asume el formato.
//   convert <directorio> Convierte cada edad (capas CS = costas, CM = margenes continentales)
//                        a un GeoJSON ligero <edad>.json y escribe manifest.json con la
//                        procedencia, la licencia y la huella de cada fichero.
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


/* ------------------------------------------------------------------ */
/* Simplificacion de geometrias                                       */
/* ------------------------------------------------------------------ */
const TOLERANCE_DEG = 0.01;   // ~1,1 km: por debajo de la resolucion util de unas paleocostas
const PRECISION = 3;          // decimales de las coordenadas (~110 m)

const round = (n) => Number(n.toFixed(PRECISION));

// Distancia de un punto al segmento a-b (plano, en grados: suficiente para esta tolerancia)
function distToSegment(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker iterativo sobre un camino abierto; devuelve los puntos conservados
function simplifyPath(pts, tol) {
    if (pts.length <= 2) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [lo, hi] = stack.pop();
        let maxD = 0;
        let idx = -1;
        for (let i = lo + 1; i < hi; i++) {
            const d = distToSegment(pts[i], pts[lo], pts[hi]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (idx !== -1 && maxD > tol) { keep[idx] = 1; stack.push([lo, idx], [idx, hi]); }
    }
    return pts.filter((_, i) => keep[i]);
}

// Simplifica un anillo cerrado. Devuelve null si queda degenerado (< 3 puntos distintos).
function simplifyRing(ring, tol = TOLERANCE_DEG) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const open = ring.slice(0, -1);
    // Se parte el anillo por su punto mas lejano al primero: asi nunca colapsa a una linea
    let far = 0;
    let farD = -1;
    open.forEach((p, i) => { const d = Math.hypot(p[0] - open[0][0], p[1] - open[0][1]); if (d > farD) { farD = d; far = i; } });
    const first = simplifyPath(open.slice(0, far + 1), tol);
    const second = simplifyPath(open.slice(far).concat([open[0]]), tol);
    const merged = first.concat(second.slice(1, -1)).map((p) => [round(p[0]), round(p[1])]);
    const dedup = merged.filter((p, i) => i === 0 || p[0] !== merged[i - 1][0] || p[1] !== merged[i - 1][1]);
    if (dedup.length < 3) return null;
    dedup.push(dedup[0].slice());
    return dedup;
}

function simplifyGeometry(geom, tol = TOLERANCE_DEG) {
    if (!geom) return null;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : null;
    if (!polys) return null;
    const out = [];
    polys.forEach((poly) => {
        const outer = simplifyRing(poly[0], tol);
        if (!outer) return;   // sin anillo exterior valido no hay poligono
        const holes = poly.slice(1).map((r) => simplifyRing(r, tol)).filter(Boolean);
        out.push([outer, ...holes]);
    });
    if (!out.length) return null;
    return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

/* ------------------------------------------------------------------ */
/* Conversion                                                         */
/* ------------------------------------------------------------------ */
async function convert(outDir) {
    if (!outDir) throw new Error('uso: convert <directorio de salida>');
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'paleocoast-'));
    const { dir, provenance } = await download(workdir);
    fs.mkdirSync(outDir, { recursive: true });

    const ages = walk(dir)
        .map((f) => f.match(/CS\/(\d+)Ma_CS_v7\.shp$/i))
        .filter(Boolean)
        .map((m) => parseInt(m[1], 10))
        .sort((a, b) => a - b);
    if (!ages.length) throw new Error('no se encontraron edades CS/<n>Ma_CS_v7.shp');
    log(`[BUILD] ${ages.length} edades: ${ages[0]}..${ages[ages.length - 1]} Ma`);

    const entries = [];
    let totalBytes = 0;
    for (const age of ages) {
        const features = [];
        const counts = { coastline: 0, margin: 0, dropped: 0 };
        for (const [folder, kind, code] of [['CS', 'coastline', 'CS'], ['CM', 'margin', 'CM']]) {
            const shp = path.join(dir, folder, `${age}Ma_${code}_v7.shp`);
            if (!fs.existsSync(shp)) { log(`[WARN] falta ${folder}/${age}Ma`); continue; }
            const fc = await shapefile.read(shp, shp.replace(/\.shp$/i, '.dbf'));
            for (const f of fc.features) {
                const geometry = simplifyGeometry(f.geometry);
                if (!geometry) { counts.dropped += 1; continue; }
                const props = { kind, age_ma: age };
                if (f.properties && f.properties.NAME) props.name = f.properties.NAME;
                features.push({ type: 'Feature', properties: props, geometry });
                counts[kind] += 1;
            }
        }
        const body = JSON.stringify({ type: 'FeatureCollection', features });
        const file = `${age}.json`;
        fs.writeFileSync(path.join(outDir, file), body);
        const bytes = Buffer.byteLength(body);
        totalBytes += bytes;
        entries.push({ age_ma: age, file, bytes, sha256: crypto.createHash('sha256').update(body).digest('hex'), coastlines: counts.coastline, margins: counts.margin, dropped: counts.dropped });
        log(`[BUILD] ${String(age).padStart(3)} Ma -> ${(bytes / 1024).toFixed(0)} KB (${counts.coastline} costas, ${counts.margin} margenes, ${counts.dropped} descartados)`);
    }

    const manifest = {
        dataset: 'PaleoMAP PaleoCoastlines',
        creators: ['Kocsis, A. T.', 'Scotese, C. R.'],
        license: 'CC-BY-4.0',
        attribution: 'PaleoMAP PaleoCoastlines (Kocsis & Scotese), CC BY 4.0, doi:10.5281/zenodo.7994000. Simplificado y convertido a GeoJSON por ChronosTerrae.',
        source: provenance,
        related_article_doi: '10.1016/j.earscirev.2020.103463',
        related_article_note: 'DOI tomado de la descripcion del registro de Zenodo; pendiente de verificar en Crossref.',
        layers: { coastline: 'Costas paleogeograficas derivadas de los PaleoDEM (capa CS)', margin: 'Margenes continentales, isobata de -1400 m de los PaleoDEM (capa CM)' },
        evidence: 'reconstruction',
        processing: { script: 'scripts/build-paleocoastlines.js', simplify_tolerance_deg: TOLERANCE_DEG, coordinate_decimals: PRECISION, note: 'Douglas-Peucker por anillo; anillos degenerados descartados' },
        built_at: new Date().toISOString(),
        total_bytes: totalBytes,
        ages: entries
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    log(`[BUILD] listo: ${entries.length} ficheros, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
    const LIMIT = 40 * 1024 * 1024;
    if (totalBytes > LIMIT) throw new Error(`salida de ${(totalBytes / 1024 / 1024).toFixed(1)} MB: supera el limite de 40 MB, subir la tolerancia`);
    process.stdout.write(JSON.stringify({ ok: true, files: entries.length, total_bytes: totalBytes, ages: entries.map((e) => [e.age_ma, e.bytes]) }, null, 2) + '\n');
}

if (require.main === module) {
    const mode = process.argv[2] || 'inspect';
    const modes = { inspect, convert: () => convert(process.argv[3]) };
    if (!modes[mode]) { log('Modo desconocido: ' + mode); process.exit(2); }
    modes[mode]().catch((err) => {
        log('[ERR] ' + err.message);
        process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
        process.exitCode = 1;
    });
} else {
    module.exports = { simplifyRing, simplifyGeometry, simplifyPath, TOLERANCE_DEG, PRECISION };
}
