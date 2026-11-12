#!/usr/bin/env node
// validate-records.js - Valida registros ChronosTerrae contra schemas/record.schema.json.
//
// Uso:  node scripts/validate-records.js [directorio ...]
// Sin argumentos valida schemas/examples y data/records (si existe).
// Cada fichero .json puede ser un Feature o una FeatureCollection de Features.
//
// Reglas que un esquema JSON no puede expresar y se comprueban aqui:
//   - start_ybp >= end_ybp (el inicio no puede ser mas reciente que el fin)
//   - scale.min_m <= scale.max_m
//   - los id son unicos en todo el conjunto validado

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/record.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const listJson = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listJson(full);
        // index.json y manifest.json de data/events describen los ficheros, no son registros
        if (/[\\/]data[\\/]events$/.test(dir) && ['index.json', 'manifest.json'].includes(entry.name)) return [];
        if (/[\\/](data[\\/]built|built-out)$/.test(dir) && ['manifest.json', 'built-map.json'].includes(entry.name)) return [];
        return entry.name.endsWith('.json') ? [full] : [];
    });
};

const dirs = process.argv.length > 2
    ? process.argv.slice(2).map((d) => path.resolve(d))
    : [path.join(root, 'schemas/examples'), path.join(root, 'data/records'), path.join(root, 'data/events'), path.join(root, 'data/built')];

const problems = [];
const seen = new Map();
let records = 0;

for (const file of dirs.flatMap(listJson)) {
    const rel = path.relative(process.cwd(), file);
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        problems.push(`${rel}: JSON invalido (${err.message})`);
        continue;
    }
    const features = parsed.type === 'FeatureCollection' && Array.isArray(parsed.features) ? parsed.features : [parsed];

    features.forEach((feature, i) => {
        const where = `${rel}${features.length > 1 ? `[${i}]` : ''}`;
        records += 1;

        if (!validate(feature)) {
            for (const err of validate.errors) problems.push(`${where}: ${err.instancePath || '/'} ${err.message}`);
            return;
        }

        const p = feature.properties;
        if (p.time.start_ybp < p.time.end_ybp) problems.push(`${where}: time.start_ybp (${p.time.start_ybp}) es mas reciente que end_ybp (${p.time.end_ybp})`);
        if (p.scale.min_m > p.scale.max_m) problems.push(`${where}: scale.min_m (${p.scale.min_m}) es mayor que scale.max_m (${p.scale.max_m})`);
        if (seen.has(p.id)) problems.push(`${where}: id duplicado "${p.id}" (ya en ${seen.get(p.id)})`);
        else seen.set(p.id, where);
    });
}

if (problems.length) {
    console.error(`FAIL ${problems.length} problema(s) en ${records} registro(s):`);
    problems.forEach((p) => console.error('  XX  ' + p));
    process.exit(1);
}
console.log(`OK  ${records} registro(s) validos.`);
