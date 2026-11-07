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

// --- Cliente web: reglas que evitan errores ya vistos ---
check('index.html fija una version exacta de MapLibre', () => /maplibre-gl@\d+\.\d+\.\d+\//.test(readIndex()));

check('index.html no pinta datos recientes fuera del presente (anacronismo)', () => {
    const html = readIndex();
    return /const liveVisible\s*=/.test(html) && !/visibility',\s*state\.ybp\s*<\s*\d+/.test(html);
});

check('index.html no presenta contornos actuales desplazados como costas reales', () => {
    const html = readIndex();
    // el texto de la capa de placas debe advertir que no son las costas reales de la epoca
    return /No son las costas reales de la época/.test(html) && /not the real coastlines of that time/i.test(html);
});

// Funciones del slider evaluadas tal como estan en index.html (sin navegador).
const sliderFns = () => {
    const html = readIndex();
    const cfg = html.match(/const CFG = \{[\s\S]*?\n\};/)[0];
    const offset = html.match(/const OFFSET = [^\n]*\n/)[0];
    const toYbp = html.match(/const sliderToYbp = [^\n]*\n/)[0];
    const toSlider = html.match(/const ybpToSlider = [\s\S]*?\n\};\n/)[0];
    return new Function(`${cfg}\n${offset}\n${toYbp}\n${toSlider}\nreturn { CFG, OFFSET, sliderToYbp, ybpToSlider };`)();
};

check('slider: izquierda es el pasado remoto y derecha es hoy', () => {
    const { CFG, sliderToYbp } = sliderFns();
    const left = sliderToYbp(0);
    const right = sliderToYbp(CFG.sliderMax);
    if (Math.abs(left - CFG.maxYbp) > 1) throw new Error('el extremo izquierdo es ' + left + ' a. AP, se esperaba ' + CFG.maxYbp);
    if (right !== -(CFG.nowYear - CFG.present)) throw new Error('el extremo derecho es ' + right + ' a. AP, se esperaba hoy');
    return true;
});

check('slider: avanzar hacia la derecha nunca aleja del presente', () => {
    const { CFG, sliderToYbp } = sliderFns();
    let prev = Infinity;
    for (let s = 0; s <= CFG.sliderMax; s += 25) {
        const y = sliderToYbp(s);
        if (y > prev) throw new Error('no monotono en s=' + s);
        prev = y;
    }
    return true;
});

check('slider: pasar una fecha al slider y volver no la cambia', () => {
    // Cerca de hoy varios pasos del slider dan el mismo año (1 paso = ~0,16 años), así que
    // no se exige recuperar el paso, sino que la fecha no se mueva.
    const { CFG, sliderToYbp, ybpToSlider } = sliderFns();
    for (let s = 0; s <= CFG.sliderMax; s += 137) {
        const y = sliderToYbp(s);
        const back = sliderToYbp(ybpToSlider(y));
        if (back !== y) throw new Error('s=' + s + ': ' + y + ' vuelve como ' + back);
    }
    return true;
});

check('index.html no reenvia al mapa una capa que no ha cambiado', () => {
    const html = readIndex();
    return /state\.landData === L\.data\)\s*return/.test(html) && /state\.bordersData === data\)\s*\{[\s\S]{0,260}?return;/.test(html);
});

check('index.html pinta las costas que llegan mientras se arrastra (no solo la ultima peticion)', () => {
    const html = readIndex();
    // descartar con "token !== sceneToken" deja el mapa congelado mientras dura el arrastre con red lenta
    const body = html.slice(html.indexOf('async function updateScene'), html.indexOf('function scheduleBorders'));
    return /token < appliedToken/.test(body) && !/token !== sceneToken\)\s*return;\s*\/\/ ya hay/.test(body);
});

check('index.html no hace esperar a las costas por las fronteras pesadas', () => {
    const html = readIndex();
    // las costas y las fronteras no se esperan entre si en un mismo Promise.allSettled
    return !/Promise\.allSettled\(\[\s*loadLand/.test(html) && /function scheduleBorders/.test(html);
});

// --- Preferencias en cookie y mapa ---
const prefsFns = () => {
    const html = readIndex();
    const cfg = html.match(/const CFG = \{[\s\S]*?\n\};/)[0];
    const offset = html.match(/const OFFSET = [^\n]*\n/)[0];
    const parse = html.match(/const parsePrefs = [\s\S]*?\n\};\n/)[0];
    return new Function(`${cfg}\n${offset}\n${parse}\nreturn { CFG, OFFSET, parsePrefs };`)();
};

check('cookie de preferencias: acepta valores validos', () => {
    const { parsePrefs } = prefsFns();
    const r = parsePrefs(JSON.stringify({ lang: 'en', dark: 1, ybp: 250000000, c: [15.5, -12], z: 3.4 }));
    return r.lang === 'en' && r.dark === true && r.ybp === 250000000 && r.c[0] === 15.5 && r.c[1] === -12 && r.z === 3.4;
});

check('cookie de preferencias: ignora basura sin romperse', () => {
    const { parsePrefs } = prefsFns();
    for (const raw of ['', 'no es json', 'null', '[1,2]', '"x"', '{"lang":"fr"}', '{"ybp":"250"}', '{"ybp":1e12}', '{"ybp":-1000}', '{"c":[999,0]}', '{"c":[0,89]}', '{"c":["1","2"]}', '{"z":99}', '{"z":-1}', '{"dark":"yes"}']) {
        const r = parsePrefs(raw);
        if (Object.keys(r).length) throw new Error('acepto ' + raw + ' -> ' + JSON.stringify(r));
    }
    return true;
});

check('cookie de preferencias: el paso de las flechas (ks) acepta un id corto y rechaza lo demas, sin romperse', () => {
    const { parsePrefs } = prefsFns();
    const ok = ['1h', '100M', '1mo'].every((v) => parsePrefs(JSON.stringify({ ks: v })).ks === v);
    const bad = ['', '1h; drop', '<b>', '123456', 7, null, [], {}, 'a b'].every((v) => !('ks' in parsePrefs(JSON.stringify({ ks: v }))));
    return ok && bad;
});

check('cookie de preferencias: bh (fronteras ocultas) acepta 0/1 y rechaza lo demas', () => {
    const { parsePrefs } = prefsFns();
    const ok = parsePrefs(JSON.stringify({ bh: 1 })).bh === true && parsePrefs(JSON.stringify({ bh: 0 })).bh === false;
    const bad = [2, -1, '1', true, null, [], {}].every((v) => !('bh' in parsePrefs(JSON.stringify({ bh: v }))));
    return ok && bad;
});

check('cookie de preferencias: cc (centrar al clic) acepta 0/1 y rechaza lo demas', () => {
    const { parsePrefs } = prefsFns();
    return parsePrefs(JSON.stringify({ cc: 1 })).cc === true && parsePrefs(JSON.stringify({ cc: 0 })).cc === false && [2, '1', true, null, {}].every((v) => !('cc' in parsePrefs(JSON.stringify({ cc: v }))));
});

check('cookie de preferencias: un campo malo no invalida los buenos', () => {
    const { parsePrefs } = prefsFns();
    const r = parsePrefs(JSON.stringify({ lang: 'es', ybp: 'x', z: 2 }));
    return r.lang === 'es' && r.z === 2 && !('ybp' in r);
});

check('index.html no ofrece modo plano (siempre globo)', () => {
    const html = readIndex();
    return !/mercator/i.test(html) && !/btn-proj/.test(html) && /projection:\s*\{\s*type:\s*'globe'\s*\}/.test(html);
});

check('pages.yml publica todo recurso local que index.html carga (./map, ./sky, ./vendor, ./data/...)', () => {
    const html = readIndex();
    const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
    const refs = new Set();
    for (const m of html.matchAll(/(?:src="|url:\s*'|Url:\s*')\.\/([A-Za-z0-9_-]+)\/(?:([A-Za-z0-9_-]+)\/)?/g)) refs.add(m[2] && m[1] === 'data' ? 'data/' + m[2] : m[1]);
    const missing = [...refs].filter((r) => !new RegExp('cp -r [^\\n]*\\b' + r.replace('/', '\\/') + '\\b').test(yml));
    if (missing.length) console.log('    sin copiar en pages.yml:', missing.join(', '));
    return refs.size >= 3 && missing.length === 0;
});

check('index.html centra con doble clic en vez de hacer zoom', () => {
    const html = readIndex();
    return /map\.doubleClickZoom\.disable\(\)/.test(html) && /map\.easeTo\(\{\s*center:\s*e\.lngLat/.test(html);
});

check('index.html carga el motor astronomico y el cielo desde el propio repositorio, no desde un CDN', () => {
    const html = readIndex();
    return /src="\.\/vendor\/astronomy-engine\/astronomy\.browser\.min\.js"/.test(html) && /src="\.\/sky\/sky\.js"/.test(html)
        && !/(unpkg|jsdelivr|cdnjs)[^"']*astronomy/i.test(html);
});

check('index.html no declara precision del cielo: el panel Cielo se retiro (decision del creador, 2026-11-07); la validacion sigue en CI', () => {
    const html = readIndex();
    // Sin panel no hay texto de precision. Si vuelve un panel, debe volver a leer data/sky/validation.json.
    const noPanel = !/id="btn-sky"|id="sky"|skyAccuracyText/.test(html);
    const claims = /noValidation|accuracy:\s*'/.test(html);
    return noPanel && !claims;
});

// --- Simplificacion de paleocostas: no debe perder ni deformar datos en silencio ---
const paleo = require('./build-paleocoastlines.js');
const square = (n) => {
    // cuadrado de lado 10 con n puntos colineales intermedios por lado, cerrado
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([10 * i / n, 0]);
    for (let i = 0; i < n; i++) pts.push([10, 10 * i / n]);
    for (let i = 0; i < n; i++) pts.push([10 - 10 * i / n, 10]);
    for (let i = 0; i < n; i++) pts.push([0, 10 - 10 * i / n]);
    pts.push(pts[0].slice());
    return pts;
};

check('paleocostas: simplificar quita puntos colineales y conserva las esquinas', () => {
    const out = paleo.simplifyRing(square(50));
    if (!out) throw new Error('anillo valido descartado');
    if (out.length !== 5) throw new Error('esperaba 5 puntos (4 esquinas + cierre), hay ' + out.length);
    const corners = [[0, 0], [10, 0], [10, 10], [0, 10]];
    return corners.every((c) => out.some((p) => p[0] === c[0] && p[1] === c[1]));
});

check('paleocostas: el anillo simplificado sigue cerrado', () => {
    const out = paleo.simplifyRing(square(30));
    return out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1] && out.length >= 4;
});

check('paleocostas: un anillo degenerado se descarta en vez de dejar una linea', () => {
    const sliver = [[0, 0], [5, 0.0001], [10, 0], [5, -0.0001], [0, 0]];
    return paleo.simplifyRing(sliver) === null;
});

check('paleocostas: no se desplaza el contorno mas que la tolerancia', () => {
    // circulo de radio 5 muestreado finamente
    const circle = [];
    for (let i = 0; i < 720; i++) { const a = i * Math.PI / 360; circle.push([5 * Math.cos(a), 5 * Math.sin(a)]); }
    circle.push(circle[0].slice());
    const out = paleo.simplifyRing(circle);
    const tol = paleo.TOLERANCE_DEG + 10 ** -paleo.PRECISION;
    // cada punto original debe estar a menos de la tolerancia de algun segmento del simplificado
    const dist = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    };
    return circle.every((p) => out.slice(0, -1).some((a, i) => dist(p, a, out[i + 1]) <= tol * 1.5)) && out.length < circle.length;
});

check('paleocostas: un poligono sin anillo exterior valido se descarta, un hueco degenerado no arrastra al poligono', () => {
    const sliver = [[0, 0], [5, 0.0001], [10, 0], [5, -0.0001], [0, 0]];
    const bad = paleo.simplifyGeometry({ type: 'Polygon', coordinates: [sliver] });
    const good = paleo.simplifyGeometry({ type: 'Polygon', coordinates: [square(20), sliver] });
    return bad === null && good && good.type === 'Polygon' && good.coordinates.length === 1;
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
