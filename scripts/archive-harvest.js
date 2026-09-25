// archive-harvest.js
/**
 * Valida el payload del harvester y lo archiva antes de tocar el repositorio.
 * Regla W1: si el JSON no parsea, el proceso falla y no se commitea nada.
 */
const fs = require('fs');
const path = require('path');

const source = process.argv[2] || '/tmp/harvest.json';
const raw = fs.readFileSync(source, 'utf8');

let payload;
try {
    payload = JSON.parse(raw);
} catch (err) {
    console.error(`[ERR] latest_harvest.json seria JSON invalido: ${err.message}`);
    console.error('[ERR] Se aborta el commit para no publicar datos corruptos.');
    process.exit(1);
}

const problems = [];
if (payload.type !== 'FeatureCollection') problems.push(`type esperado FeatureCollection, recibido ${payload.type}`);
if (!Array.isArray(payload.features)) problems.push('features no es un array');
if (!payload.metadata || typeof payload.metadata.harvest_date !== 'string') problems.push('metadata.harvest_date ausente');

payload.features.forEach((feature, i) => {
    if (feature.type !== 'Feature') problems.push(`features[${i}].type invalido`);
    if (!feature.geometry || feature.geometry.type !== 'Point') problems.push(`features[${i}] no es un Point`);
    const coords = feature.geometry && feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2 || coords.some(n => !Number.isFinite(n))) {
        problems.push(`features[${i}].coordinates invalidas`);
    }
    if (!feature.properties || typeof feature.properties.name !== 'string') problems.push(`features[${i}].properties.name ausente`);
});

if (problems.length > 0) {
    problems.forEach(p => console.error(`[ERR] ${p}`));
    process.exit(1);
}

const day = (payload.metadata.harvest_date || new Date().toISOString()).slice(0, 10);
const archiveDir = path.join(process.cwd(), 'data', 'harvests');
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(archiveDir, `${day}.json`), JSON.stringify(payload, null, 2) + '\n');

const total = payload.features.length;
if (total > 0) {
    fs.writeFileSync(path.join(process.cwd(), 'latest_harvest.json'), JSON.stringify(payload, null, 2) + '\n');
}

console.log(`[OK] JSON valido. ${total} vectores. Archivado en data/harvests/${day}.json`);
if (total === 0) console.log('[OK] latest_harvest.json se conserva intacto (ciclo vacio).');
