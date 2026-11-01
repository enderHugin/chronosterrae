#!/usr/bin/env node
// check.js - Verificaciones de regresión de W1: cada test cubre un fallo real ya ocurrido.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

const check = (name, fn) => {
    try {
        const result = fn();
        if (result === false) failures.push(name);
        else passes.push(name);
    } catch (err) {
        failures.push(`${name} -> ${err.message}`);
    }
};

const readIndex = () => fs.readFileSync(path.join(root, 'index.html'), 'utf8');

check('latest_harvest.json es JSON valido', () => {
    const raw = fs.readFileSync(path.join(root, 'latest_harvest.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.type === 'FeatureCollection' && Array.isArray(parsed.features);
});

check('latest_harvest.json no contiene logs de stdout', () => {
    const raw = fs.readFileSync(path.join(root, 'latest_harvest.json'), 'utf8');
    return !raw.trimStart().startsWith('[') && !raw.includes('[SYS]');
});

check('index.html no pasa var(--accent) a paint de MapLibre', () => {
    const html = readIndex();
    return !/'fill-color'\s*:\s*'var\(--/.test(html) && !/'line-color'\s*:\s*'var\(--/.test(html);
});

check('index.html da altura explicita al contenedor del mapa', () => {
    const html = readIndex();
    const block = html.match(/#map\s*\{([^}]*)\}/);
    if (!block) throw new Error('no se encuentra la regla CSS de #map');
    return /height\s*:/.test(block[1]) || /inset\s*:/.test(block[1]);
});

check('index.html no inyecta datos externos con innerHTML', () => {
    const html = readIndex();
    const offenders = html.split('\n').filter(l => /innerHTML/.test(l) && /feature\.properties|props\.|harvest_date|\.name|\.tier|\.timestamp/.test(l));
    if (offenders.length) throw new Error(offenders.join(' | '));
    return true;
});

check('harvester.js escribe solo JSON en stdout', () => {
    const src = fs.readFileSync(path.join(root, 'scripts/harvester.js'), 'utf8');
    const stdoutWrites = src.split('\n').filter(l => /process\.stdout\.write|console\.log/.test(l) && !/^\s*\/\//.test(l));
    const bad = stdoutWrites.filter(l => /console\.log/.test(l));
    if (bad.length) throw new Error('console.log escribe en stdout: ' + bad.join(' | '));
    return /process\.stdout\.write\(JSON\.stringify/.test(src);
});

check('archive-harvest.js rechaza JSON corrupto (regresion del fallo original)', () => {
    const dir = fs.mkdtempSync('/tmp/ct-check-');
    const broken = path.join(dir, 'broken.json');
    fs.writeFileSync(broken, '[SYS] Interceptando telemetria...\n{ "type": "FeatureCollection" }\n');
    let code = 0;
    try {
        execFileSync('node', [path.join(root, 'scripts/archive-harvest.js'), broken], { cwd: dir, stdio: 'pipe' });
    } catch (err) {
        code = err.status;
    }
    const wrote = fs.existsSync(path.join(dir, 'latest_harvest.json'));
    fs.rmSync(dir, { recursive: true, force: true });
    if (code === 0) throw new Error('acepto un payload corrupto: deberia salir con codigo != 0');
    if (wrote) throw new Error('escribio latest_harvest.json pese al fallo');
    return true;
});

check('archive-harvest.js acepta un payload valido y conserva el anterior si esta vacio', () => {
    const dir = fs.mkdtempSync('/tmp/ct-check-');
    const previous = JSON.stringify({ type: 'FeatureCollection', metadata: { harvest_date: '2026-01-01T00:00:00.000Z' }, features: [{ tipo: 'previo' }] });
    fs.writeFileSync(path.join(dir, 'latest_harvest.json'), previous);

    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, JSON.stringify({ type: 'FeatureCollection', metadata: { harvest_date: '2026-02-02T00:00:00.000Z' }, features: [] }));
    execFileSync('node', [path.join(root, 'scripts/archive-harvest.js'), empty], { cwd: dir, stdio: 'pipe' });

    const after = fs.readFileSync(path.join(dir, 'latest_harvest.json'), 'utf8');
    if (after !== previous) throw new Error('un ciclo vacio destruyo el payload anterior');
    if (!fs.existsSync(path.join(dir, 'data/harvests/2026-02-02.json'))) throw new Error('no archivo el ciclo vacio en data/harvests');
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
});

check('el workflow valida el JSON antes de commitear', () => {
    const yml = fs.readFileSync(path.join(root, '.github/workflows/harvest.yml'), 'utf8');
    return /archive-harvest\.js/.test(yml) && /data\/harvests/.test(yml);
});

// --- Esquema de registros: debe rechazar lo que no es verificable ---
const exampleRecord = () => JSON.parse(fs.readFileSync(path.join(root, 'schemas/examples/chicxulub-impact.json'), 'utf8'));

const runValidator = (record) => {
    const dir = fs.mkdtempSync('/tmp/ct-schema-');
    fs.writeFileSync(path.join(dir, 'r.json'), JSON.stringify(record));
    let code = 0;
    let stderr = '';
    try {
        execFileSync('node', [path.join(root, 'scripts/validate-records.js'), dir], { stdio: 'pipe' });
    } catch (err) {
        code = err.status;
        stderr = String(err.stderr || '');
    }
    fs.rmSync(dir, { recursive: true, force: true });
    // Un rechazo legitimo sale con codigo 1 y el informe "FAIL n problema(s)".
    // Cualquier otra salida distinta de 0 es un validador roto, no un rechazo.
    if (code !== 0 && !(code === 1 && /^FAIL \d+ problema/m.test(stderr))) {
        throw new Error('el validador se ha roto en vez de rechazar: ' + stderr.split('\n').slice(0, 3).join(' '));
    }
    return code;
};

check('esquema: acepta el registro de ejemplo', () => runValidator(exampleRecord()) === 0);

check('esquema: rechaza un registro sin fuentes', () => {
    const r = exampleRecord();
    r.properties.sources = [];
    return runValidator(r) !== 0;
});

check('esquema: rechaza un DOI mal formado', () => {
    const r = exampleRecord();
    r.properties.sources = [{ kind: 'doi', id: 'no-es-un-doi' }];
    return runValidator(r) !== 0;
});

check('esquema: rechaza inicio mas reciente que fin', () => {
    const r = exampleRecord();
    r.properties.time.start_ybp = 10;
    r.properties.time.end_ybp = 5000;
    return runValidator(r) !== 0;
});

check('esquema: rechaza status "reviewed" sin revisor', () => {
    const r = exampleRecord();
    r.properties.status = 'reviewed';
    return runValidator(r) !== 0;
});

check('esquema: rechaza escala invertida', () => {
    const r = exampleRecord();
    r.properties.scale = { min_m: 1e7, max_m: 1e3 };
    return runValidator(r) !== 0;
});

check('esquema: rechaza un registro sin tipo de evidencia', () => {
    const r = exampleRecord();
    delete r.properties.evidence;
    return runValidator(r) !== 0;
});

check('esquema: rechaza fecha de dia sin calendario', () => {
    const r = exampleRecord();
    r.properties.time = { start_ybp: 160, end_ybp: 160, uncertainty_yr: 0, precision: 'day' };
    return runValidator(r) !== 0;
});

check('esquema: acepta fecha de dia con calendario', () => {
    const r = exampleRecord();
    r.properties.time = { start_ybp: 160, end_ybp: 160, uncertainty_yr: 0, precision: 'day', calendar: 'gregorian' };
    return runValidator(r) === 0;
});

check('esquema: acepta fuente con huella, fecha de recuperacion y copia de archivo', () => {
    const r = exampleRecord();
    r.properties.sources[0].retrieved_at = '2026-11-01T14:00:00Z';
    r.properties.sources[0].sha256 = 'a'.repeat(64);
    r.properties.sources[0].archive_url = 'https://web.archive.org/web/2026/https://doi.org/10.1126/science.1230492';
    return runValidator(r) === 0;
});

check('esquema: rechaza una huella sha256 mal formada', () => {
    const r = exampleRecord();
    r.properties.sources[0].sha256 = 'no-es-una-huella';
    return runValidator(r) !== 0;
});

check('esquema: rechaza margen de posicion negativo', () => {
    const r = exampleRecord();
    r.properties.position_uncertainty_m = -5;
    return runValidator(r) !== 0;
});

console.log('\nPASS ' + passes.length);
passes.forEach(p => console.log('  ok  ' + p));
if (failures.length) {
    console.log('\nFAIL ' + failures.length);
    failures.forEach(f => console.log('  XX  ' + f));
    process.exit(1);
}
console.log('\nTodo verde.');
