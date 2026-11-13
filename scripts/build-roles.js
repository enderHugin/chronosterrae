#!/usr/bin/env node
// build-roles.js - Papel de cada persona (rey, papa, escritor, compositor...) para su icono: data/people/roles.json
//
//   node scripts/build-roles.js --out <carpeta>
//
// Lo pide el creador (2026-11-12): "crear iconos para entender visualmente y al instante quien es cada personaje: corona para rey,
// mitra para papa, libreta y pluma para escritor, libreta y pluma con pentagramas para compositor, etc."
//
// Como (nada se inventa; regla 1):
//   1. Cada papel tiene clases raiz de Wikidata escritas de memoria: se VERIFICAN por su etiqueta inglesa en cada build; la que no
//      coincide no se usa (y se dice en el manifiesto).
//   2. Papeles candidatos de una persona: sus oficios (P106) y cargos (P39) que son esas clases o subclases (P279*), via QLever
//      (el cierre de subclases se pide raiz a raiz y se cruza aqui: la union directa agotaba el tiempo del servidor).
//   3. Quien fue papa lleva mitra; quien reino, corona si su descripcion lo nombra (aunque fuera tambien otra cosa). Si no, y tiene varios (Goethe: escritor y politico; Churchill: politico y escritor), gana el que su descripcion corta de Wikidata
//      nombra ANTES ("German writer and statesman" -> escritor; "British statesman, writer" -> politico). Sin pista en la
//      descripcion, el orden de prioridad de ROLES. Es una heuristica sobre datos de la fuente: el registro lo dice ("via").
// Solo personas de nuestros sucesos (nacimientos y muertes de data/events). Salida: roles.json { roles: {papel: [QID numerico]} } y manifest.json (verificacion, recuentos, conocidas).
'use strict';
const fs = require('fs');
const path = require('path');

const QLEVER = process.env.CT_SPARQL_ENDPOINT || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'ChronosTerrae-Build/0.6 (https://github.com/enderHugin/chronosterrae)';
const PRE = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX schema: <http://schema.org/> ';
const root = path.join(__dirname, '..');
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Papel -> clases raiz [QID, etiqueta inglesa esperada] y palabras de la descripcion inglesa que lo delatan. Orden = prioridad de reserva.
const ROLES = [
    ['pope', [['Q19546', 'pope']], ['pope']],
    ['monarch', [['Q116', 'monarch']], ['king', 'queen', 'emperor', 'empress', 'monarch', 'sultan', 'tsar', 'tsarina', 'shah', 'pharaoh', 'caliph', 'khan', 'regnant']],
    ['composer', [['Q36834', 'composer']], ['composer']],
    ['painter', [['Q1028181', 'painter'], ['Q1281618', 'sculptor']], ['painter', 'sculptor', 'artist', 'engraver', 'illustrator']],
    ['writer', [['Q36180', 'writer'], ['Q49757', 'poet'], ['Q201788', 'historian']], ['writer', 'poet', 'novelist', 'playwright', 'author', 'essayist', 'dramatist', 'journalist',
        'historian', 'historiographer', 'chronicler', 'philologist', 'scholar', 'humanist', 'rhetorician', 'translator', 'educator', 'pedagogue', 'editor', 'publisher']],
    // Ciencia: «scientist» SOLO tal cual (sin subclases: su arbol, 2.770 clases, mete historiadores, fillogos, pedagogos... y Guru Nanak salia
    // con matraz) y las ciencias naturales y la medicina con sus subclases. Revisado con review.tsv el 2026-11-13. Sin «economist» (2026-11-13,
    // segunda revision): metia a Kofi Annan, a ministros de Hacienda y a banqueros con matraz.
    ['scientist', [['Q901', 'scientist', 'exact'], ['Q169470', 'physicist'], ['Q593644', 'chemist'], ['Q864503', 'biologist'], ['Q11063', 'astronomer'], ['Q170790', 'mathematician'],
        ['Q520549', 'geologist'], ['Q18805', 'naturalist'], ['Q2374149', 'botanist'], ['Q350979', 'zoologist'], ['Q39631', 'physician'], ['Q212980', 'psychologist'],
        ['Q82594', 'computer scientist']], ['scientist', 'physicist', 'chemist', 'biologist', 'astronomer', 'mathematician', 'naturalist', 'geologist', 'botanist', 'zoologist', 'physician',
        'cosmologist', 'astrophysicist', 'psychologist', 'psychiatrist', 'neurologist', 'neuroscientist', 'archaeologist', 'anthropologist', 'sociologist', 'linguist', 'geographer', 'biochemist', 'microbiologist', 'geneticist',
        'meteorologist', 'paleontologist', 'palaeontologist', 'ornithologist', 'entomologist', 'pharmacologist', 'immunologist', 'virologist', 'bacteriologist', 'surgeon']],
    ['philosopher', [['Q4964182', 'philosopher']], ['philosopher']],
    ['religious', [['Q42603', 'priest'], ['Q29182', 'bishop'], ['Q733786', 'monk'], ['Q133485', 'rabbi'], ['Q1234713', 'theologian'], ['Q2259532', 'cleric']], ['priest', 'bishop', 'archbishop', 'cardinal', 'monk', 'nun', 'friar', 'abbot', 'abbess', 'rabbi', 'imam', 'missionary', 'theologian', 'saint', 'prophet', 'preacher', 'pastor', 'cleric', 'clergyman',
        'evangelist', 'apostle', 'martyr', 'disciple', 'deacon', 'patriarch', 'hermit', 'mystic', 'ayatollah', 'mullah', 'mufti', 'lama', 'guru', 'reverend',
        'religious leader', 'islamic scholar', 'spiritual leader', 'reformation', 'protestant reformer', 'religious reformer']],   // «reformer» a secas no: «social reformer» (Florence Nightingale)
    ['explorer', [['Q11900058', 'explorer']], ['explorer', 'navigator', 'conquistador', 'astronaut', 'cosmonaut', 'mountaineer']],
    ['architect', [['Q42973', 'architect']], ['architect']],
    ['inventor', [['Q205375', 'inventor'], ['Q81096', 'engineer']], ['inventor', 'engineer']],
    ['military', [['Q47064', 'military personnel']], ['general', 'admiral', 'military', 'soldier', 'commander', 'marshal', 'officer', 'revolutionary', 'guerrilla']],
    ['politician', [['Q82955', 'politician']], ['politician', 'statesman', 'stateswoman', 'president', 'prime minister', 'diplomat', 'revolutionary', 'activist', 'lawyer',
        'leader', 'head of state', 'ruler', 'chancellor', 'premier', 'governor', 'senator', 'mayor', 'dictator', 'founding father', 'supreme leader',
        'secretarygeneral', 'directorgeneral', 'governorgeneral', 'attorneygeneral', 'secretary of', 'minister of', 'ambassador']],
    ['actor', [['Q33999', 'actor'], ['Q2526255', 'film director']], ['actor', 'actress', 'film director', 'filmmaker', 'director', 'comedian']],
    ['musician', [['Q639669', 'musician'], ['Q177220', 'singer']], ['singer', 'musician', 'pianist', 'violinist', 'guitarist', 'rapper', 'conductor', 'songwriter']],
    ['athlete', [['Q2066131', 'athlete']], ['footballer', 'athlete', 'player', 'cyclist', 'boxer', 'swimmer', 'racing driver', 'sprinter', 'chess', 'martialartist',
        'wrestler', 'runner', 'tennis', 'golfer', 'skier', 'gymnast', 'basketball', 'baseball', 'kickboxer', 'decathlete', 'jockey', 'fencer', 'rower', 'skater']]
];
// Personas conocidas para revisar el resultado a ojo en el manifiesto: QID escrito de memoria y VERIFICADO por su etiqueta en cada build
// (si la etiqueta no coincide, se dice y no cuenta). El papel esperado es lo que cualquiera diria; no es una prueba que haga fallar el build.
const KNOWN = [
    ['Q937', 'Albert Einstein', 'scientist'], ['Q5879', 'Johann Wolfgang von Goethe', 'writer'], ['Q254', 'Wolfgang Amadeus Mozart', 'composer'],
    ['Q989', 'John Paul II', 'pope'], ['Q5593', 'Pablo Picasso', 'painter'], ['Q692', 'William Shakespeare', 'writer'], ['Q9682', 'Elizabeth II', 'monarch'],
    ['Q517', 'Napoleon', 'monarch'], ['Q8016', 'Winston Churchill', 'politician'], ['Q7186', 'Marie Curie', 'scientist'], ['Q762', 'Leonardo da Vinci', 'painter'],
    ['Q255', 'Ludwig van Beethoven', 'composer'], ['Q1035', 'Charles Darwin', 'scientist'], ['Q868', 'Aristotle', 'philosopher'],
    ['Q57336', 'Ali Khamenei', 'politician'], ['Q2039', 'Titus Livius', 'writer'], ['Q83322', 'Guru Nanak', 'religious'],   // salio «ciencia» (el creador, 2026-11-13): descripcion sin oficio y reserva que ponia ciencia antes que politica
    // segunda revision del 2026-11-13 (QID tomados de review.tsv, con su descripcion; la etiqueta se comprueba en el build)
    ['Q1254', 'Kofi Annan', 'politician'], ['Q5809', 'Che Guevara', 'military'], ['Q174979', 'Alan Shepard', 'explorer']
];

// Reserva cuando nada lo decide (ni la descripcion ni el orden de sus ocupaciones en Wikidata): los papeles publicos (gobernar, una iglesia,
// la guerra) antes que los de oficio. Antes era el orden de ROLES, con ciencia muy arriba: el cierre de «scientist» tiene 2.770 clases (todo
// tipo de estudiosos) y gente como Ali Jamenei salia con matraz (lo vio el creador, 2026-11-13).
const FALLBACK = ['pope', 'monarch', 'religious', 'politician', 'military', 'explorer', 'composer', 'painter', 'writer', 'philosopher', 'architect', 'actor', 'musician', 'athlete', 'scientist', 'inventor'];
// Cargos que mandan sobre todo lo demas: quien fue papa se reconoce por eso (Pedro: «apostle of Jesus Christ», pero primer papa). Monarca manda
// solo si ademas la descripcion lo nombra (Napoleon: «French military leader, French Emperor»): el presidente de Francia es copríncipe de
// Andorra por su cargo y salia con corona (Poincare, build del 2026-11-12).
const DOMINANT = ['pope'];
const MONARCH_WORDS = ROLES.find((r) => r[0] === 'monarch')[2];
// Realeza que no reino (consortes, principes): su descripcion la nombra aunque no tengan cargo de monarca. El papel se llama «Realeza».
const ROYAL_WORDS = MONARCH_WORDS.concat(['prince', 'princess', 'consort']);
// Religion por la descripcion aunque no tenga cargo u oficio religioso en Wikidata (Guru Nanak: «First Sikh Guru and founder of Sikhism»)
const RELIGIOUS_DESC = ['cleric', 'guru', 'prophet', 'apostle', 'saint', 'ayatollah', 'imam', 'rabbi', 'bishop', 'archbishop', 'cardinal', 'monk', 'nun', 'priest', 'theologian', 'religious leader', 'spiritual leader', 'mystic', 'reformation'];
// Exploradores por la descripcion (astronautas: Mae Jemison, «American doctor and NASA astronaut», no tiene la ocupacion «explorer»)
const EXPLORER_DESC = ['explorer', 'navigator', 'conquistador', 'astronaut', 'cosmonaut', 'mountaineer'];
// Palabras de papel demasiado genericas para decir «es otra cosa» (Geronimo, «leader of the Bedonkohe Apache», es militar; un «comic book
// artist», escritor): cuentan para elegir entre lo que tiene, no para quitarle el papel. Papa, tampoco: «Pope of Alexandria» es religion.
const WEAK_WORDS = ['leader', 'activist', 'lawyer', 'officer', 'player', 'artist', 'scholar', 'educator', 'director', 'commander', 'author', 'ruler', 'pope', 'editor', 'publisher'];
// Oficios que no son ninguno de nuestros papeles. Si la descripcion nombra uno (y ningun papel que tenga), NO se adivina el papel por sus
// ocupaciones: Bezos, Nadella o Buffett salian «ciencia» por «computer scientist» o «economist»; un asesino en serie y Snowden, tambien
// (revision del 2026-11-13). Se queda el icono de nacer/morir de siempre: mejor generico que equivocado (regla 3).
const OTHER_WORDS = ['businessman', 'businesswoman', 'businessperson', 'business magnate', 'magnate', 'tycoon', 'entrepreneur', 'executive', 'ceo',
    'investor', 'banker', 'financier', 'industrialist', 'manufacturer', 'merchant', 'philanthropist', 'economist', 'accountant', 'serial killer', 'murderer',
    'criminal', 'gangster', 'mobster', 'whistleblower', 'socialite', 'television personality', 'media personality', 'internet personality', 'youtuber', 'co founder'];
// «drag queen», «beauty queen»: no es realeza. «Secretary-General», «attorney general»: no es un general. «Chief executive officer»: no es militar.
const words = (description) => (' ' + String(description || '').toLowerCase().replace(/[^a-z\u00c0-\u024f ]+/g, ' ') + ' ').replace(/ (drag|beauty|dancing|homecoming) queens? /g, ' ')
    .replace(/ (secretary|director|governor|attorney|solicitor|surgeon|inspector|postmaster) generals? /g, ' $1general ').replace(/ chief (executive|operating|financial|technology) officers? /g, ' ceo ')
    .replace(/ (recording|hip hop|r b) artists? /g, ' musician ')
    .replace(/ (sitar|sarangi|sarod|tabla|veena|shehnai|oud|piano|guitar|violin|cello|flute|saxophone|trumpet|drum|drums|bass|harp|organ|keyboard|banjo|harmonica|clarinet|oboe) players? /g, ' musician ')
    .replace(/ director of /g, ' directorof ').replace(/ martial artists? /g, ' martialartist ').replace(/ con artists? /g, ' criminal ');   // «artist» a secas es pintura
// cualquier «-ologo» es ciencia (fisiologo, oftalmologo, sismologo...), menos el teologo
const OLOGIST = / (?!theolog)[a-z]+ologists? /;
const hasWord = (d, w) => d.indexOf(' ' + w + ' ') >= 0 || d.indexOf(' ' + w + 's ') >= 0;
/**
 * Elige el papel: papa si lo fue; monarca si lo fue y su descripcion lo dice; si no, entre los candidatos (y la realeza que nombra la descripcion),
 * el que la descripcion nombra antes (palabra entera). Sin pista en la descripcion: `firstOcc` (papeles en el orden de sus ocupaciones en
 * Wikidata, si se conoce) y, al final, el orden de ROLES.
 */
function pickRole(candidates0, description, firstOcc) {
    const d = words(description);
    const own = new Set(candidates0 || []); const candidates = new Set(own);
    if (ROYAL_WORDS.some((w) => hasWord(d, w))) candidates.add('monarch');
    if (RELIGIOUS_DESC.some((w) => hasWord(d, w))) candidates.add('religious');
    if (EXPLORER_DESC.some((w) => hasWord(d, w))) candidates.add('explorer');
    const cand = ROLES.filter(([r]) => candidates.has(r));
    if (!cand.length) return null;
    const dom = DOMINANT.find((r) => candidates.has(r)); if (dom) return { role: dom, via: 'cargo' };
    if (own.has('monarch') && MONARCH_WORDS.some((w) => hasWord(d, w))) return { role: 'monarch', via: 'cargo' };
    let best = null;
    for (const [r, , ws] of cand) {
        for (const w of (r === 'monarch' ? ROYAL_WORDS : ws)) {
            const at = d.indexOf(' ' + w + ' ') >= 0 ? d.indexOf(' ' + w + ' ') : d.indexOf(' ' + w + 's ');
            // a igualdad (la misma palabra en dos papeles: «revolutionary»), politica: militar solo si no tiene papel politico (Che Guevara)
            if (at >= 0 && (!best || at < best.at || (at === best.at && r === 'politician'))) best = { role: r, at, via: 'descripcion' };
        }
        if (r === 'scientist') { const at = d.search(OLOGIST); if (at >= 0 && (!best || at < best.at)) best = { role: r, at, via: 'descripcion' }; }
    }
    if (best) return best;
    // La descripcion dice OTRA cosa: un oficio que no es de los nuestros, o un papel que no consta en sus ocupaciones. No se adivina.
    if (OTHER_WORDS.some((w) => hasWord(d, w)) || ROLES.some(([r, , ws]) => !candidates.has(r) && ws.some((w) => !WEAK_WORDS.includes(w) && hasWord(d, w)))) return null;
    const occ = (firstOcc || []).find((r) => candidates.has(r)); if (occ) return { role: occ, via: 'primera ocupacion' };
    return { role: FALLBACK.find((r) => candidates.has(r)) || cand[0][0], via: 'prioridad' };
}

function personQids() {
    const q = new Set(); const dir = path.join(root, 'data', 'events');
    for (const f of fs.readdirSync(dir).filter((x) => /^c\d+\.json$/.test(x))) {
        for (const ft of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features || []) {
            const p = ft.properties; if (p.kind !== 'birth' && p.kind !== 'death') continue;
            (p.sources || []).forEach((s) => { if (s.kind === 'wikidata' && /^Q\d+$/.test(s.id)) q.add(s.id); });
        }
    }
    return [...q];
}
async function post(query) {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' }, body: PRE + query, signal: AbortSignal.timeout(240000) });
            const text = await res.text();
            if (res.status === 429 && attempt < 4) { await sleep(10000 * (attempt + 1)); continue; }
            if (!res.ok) throw new Error('SPARQL ' + res.status + ': ' + text.slice(0, 200));
            return JSON.parse(text).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
        } catch (e) { if (attempt >= 3) throw e; log('reintento:', e.message); await sleep(5000 * (attempt + 1)); }
        finally { await sleep(1200); }
    }
}
async function main() {
    const out = arg('out'); if (!out) throw new Error('falta --out');
    const man = { generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: 'Wikidata (CC0) via QLever: P106 (ocupacion), P39 (cargo), descripcion inglesa', verify: {}, counts: {} };
    // 1. verificar clases raiz
    const ids = ROLES.flatMap(([, roots]) => roots.map((x) => x[0]));
    const res = await fetch(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels', languages: 'en', format: 'json' }), { headers: { 'User-Agent': UA } });
    const ents = (await res.json()).entities; if (!ents) throw new Error('no se pudieron verificar las clases (roto, no rechazado)');
    const ok = {};
    ROLES.forEach(([r, roots]) => { ok[r] = roots.filter(([id, want]) => { const got = ents[id] && ents[id].labels && ents[id].labels.en && ents[id].labels.en.value; man.verify[id] = { role: r, want, got: got || null, ok: !!got && got.toLowerCase() === want.toLowerCase() }; return man.verify[id].ok; }); });
    // 2. candidatos por persona
    const people = personQids(); log('personas:', people.length);
    const cand = new Map(); const desc = new Map();
    // 2a. Cierre de subclases de cada raiz (P279*), raiz a raiz: unir el camino P279* con miles de personas a la vez agotaba el tiempo de
    //     QLever (429 «Operation timed out ... Sort on ?root», build del 2026-11-12). Aqui solo se recorre el arbol de clases.
    const classRole = new Map(); man.closure = {};
    for (const [r] of ROLES) {
        for (const [id, , how] of ok[r]) {
            const rows = how === 'exact' ? [{ c: 'http://www.wikidata.org/entity/' + id }] : await post(`SELECT DISTINCT ?c WHERE { ?c wdt:P279* wd:${id} }`);
            man.closure[id] = rows.length;
            rows.forEach((b) => { const c = b.c.split('/').pop(); if (!classRole.has(c)) classRole.set(c, new Set()); classRole.get(c).add(r); });
        }
    }
    log('clases en los cierres:', classRole.size);
    // 2b. Ocupaciones (P106) y cargos (P39) de cada persona, y su descripcion inglesa; se cruzan aqui con los cierres
    for (let i = 0; i < people.length; i += 2000) {
        const batch = people.slice(i, i + 2000); const V = batch.map((x) => 'wd:' + x).join(' ');
        const rows = await post(`SELECT DISTINCT ?p ?o WHERE { VALUES ?p { ${V} } { ?p wdt:P106 ?o } UNION { ?p wdt:P39 ?o } }`);
        let pairs = 0;
        rows.forEach((b) => {
            const q = b.p.split('/').pop(); const rs = classRole.get(b.o.split('/').pop()); if (!rs) return;
            if (!cand.has(q)) cand.set(q, new Set()); rs.forEach((r) => { cand.get(q).add(r); pairs++; });
        });
        const d = await post(`SELECT ?p ?d WHERE { VALUES ?p { ${V} } ?p schema:description ?d . FILTER(LANG(?d) = "en") }`);
        d.forEach((b) => desc.set(b.p.split('/').pop(), b.d));
        log('  lote', i, ':', rows.length, 'ocupaciones/cargos,', pairs, 'pares persona-papel,', d.length, 'descripciones');
    }
    // 3. elegir
    const roles = {}; const via = {};
    // 3a. Sin pista en la descripcion: el orden de las ocupaciones (P106) y cargos (P39) en Wikidata (el SPARQL no lo da: se pide la entidad)
    const noClue = people.filter((q) => { const p = pickRole(cand.get(q), desc.get(q)); return p && p.via === 'prioridad' && cand.get(q) && cand.get(q).size > 1; });
    const order = new Map();
    for (let i = 0; i < noClue.length; i += 40) {
        const ids = noClue.slice(i, i + 40);
        const res = await fetch(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims', format: 'json' }), { headers: { 'User-Agent': UA } });
        const ents = res.ok ? (await res.json()).entities || {} : {};
        ids.forEach((q) => {
            const cl = ents[q] && ents[q].claims; if (!cl) return;
            const vals = [].concat(cl.P106 || [], cl.P39 || []).filter((c) => c.rank !== 'deprecated').map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id).filter(Boolean);
            const rs = []; vals.forEach((v) => (classRole.get(v) || new Set()).forEach((r) => { if (rs.indexOf(r) < 0) rs.push(r); }));
            order.set(q, rs);
        });
        await sleep(500);
    }
    log('sin pista en la descripcion:', noClue.length, '; orden de ocupaciones leido de', order.size);
    for (const q of people) {
        const pick = pickRole(cand.get(q), desc.get(q), order.get(q)); if (!pick) continue;
        roles[q] = pick.role; via[pick.via] = (via[pick.via] || 0) + 1;
    }
    man.counts = { people: people.length, with_role: Object.keys(roles).length, with_description: desc.size, via, by_role: Object.values(roles).reduce((o, r) => { o[r] = (o[r] || 0) + 1; return o; }, {}) };
    // conocidas: etiqueta verificada, papel elegido, candidatos y descripcion
    const kq = [...new Set(KNOWN.map((k) => k[0]))];
    const kr = await fetch(API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: kq.join('|'), props: 'labels', languages: 'en', format: 'json' }), { headers: { 'User-Agent': UA } });
    const ke = (await kr.json()).entities || {};
    man.known = KNOWN.filter((k, i, a) => a.findIndex((x) => x[0] === k[0]) === i).map(([q, want, expect]) => {
        const got = ke[q] && ke[q].labels && ke[q].labels.en && ke[q].labels.en.value;
        return { qid: q, label_ok: got === want, label: got || null, in_data: people.includes(q), expect, role: roles[q] || null, candidates: cand.has(q) ? [...cand.get(q)] : [], order: order.get(q) || null, description: desc.get(q) || null };
    });
    man.sample = people.filter((q) => roles[q]).slice(0, 40).map((q) => [q, roles[q], [...(cand.get(q) || [])].join('+'), (desc.get(q) || '').slice(0, 80)]);
    fs.mkdirSync(out, { recursive: true });
    // compacto: papel -> lista de QID numericos (ordenados)
    const byRole = {}; ROLES.forEach(([r]) => { byRole[r] = []; });
    Object.entries(roles).forEach(([q, r]) => byRole[r].push(parseInt(q.slice(1), 10)));
    Object.values(byRole).forEach((a) => a.sort((x, y) => x - y));
    fs.writeFileSync(path.join(out, 'roles.json'), JSON.stringify({ note: 'Papel de cada persona de data/events para su icono (scripts/build-roles.js): papel -> QID de Wikidata (numero). Heuristica sobre Wikidata (CC0): ocupacion (P106) o cargo (P39) de clases verificadas y, si hay varios, el que antes nombra su descripcion inglesa.', generated_at: man.generated_at, roles: byRole }) + '\n');
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(man, null, 1) + '\n');
    // para revisar a mano (solo en la rama roles-build): QID, papel, por que, candidatos, orden de ocupaciones, descripcion
    fs.writeFileSync(path.join(out, 'review.tsv'), people.map((q) => { const pk = pickRole(cand.get(q), desc.get(q), order.get(q)); return [q, pk ? pk.role : '', pk ? pk.via : '', [...(cand.get(q) || [])].join('+'), (order.get(q) || []).join('>'), (desc.get(q) || '').replace(/\s+/g, ' ')].join('\t'); }).join('\n') + '\n');
    log('hecho:', JSON.stringify(man.counts));
}
module.exports = { ROLES, DOMINANT, ROYAL_WORDS, FALLBACK, pickRole, KNOWN };
if (require.main === module) main().catch((e) => { log('fallo:', e && e.stack || e); process.exit(1); });
