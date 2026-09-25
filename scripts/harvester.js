// harvester.js
/**
 * Motor de Ingesta Asíncrona - ChronosTerrae (AI Harvester Nodo Cero)
 * Sismógrafo de atención humana: Wikipedia Pageviews -> Wikidata SPARQL
 *
 * Contrato de salida (W1):
 *   stdout -> ÚNICO JSON válido (FeatureCollection). Nada más puede ir a stdout.
 *   stderr -> logs. Si un log llega a stdout, latest_harvest.json queda inservible.
 */

const WIKIPEDIA_LANG = 'en';
const MAX_ARTICLES_TO_PROCESS = 50;
const USER_AGENT = 'ChronosTerrae_Harvester/0.2 (https://github.com/enderhugin/chronosterrae)';
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

const log = (...args) => console.error(...args);

const getTargetDate = () => {
    // La API de métricas compila los datos con un día de retraso estructural
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return { yyyy, mm, dd, formatted: `${yyyy}/${mm}/${dd}` };
};

// Ruido estructural real de las listas de tops: portadas, páginas de sistema y
// subspace namespaces. No se filtran temas: el sesgo se corrige en el weights,
// no en la lista de candidatos.
const isStructuralNoise = (article) => {
    if (!article) return true;
    if (article.includes(':')) return true;
    const noise = new Set(['Main_Page', 'Special:Search', 'Wikipedia:Featured_articles']);
    return noise.has(article);
};

const fetchTrendingArticles = async (dateObj) => {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${WIKIPEDIA_LANG}.wikipedia.org/all-access/${dateObj.yyyy}/${dateObj.mm}/${dateObj.dd}`;
    log(`[SYS] Interceptando telemetria de atencion para: ${dateObj.formatted}`);

    try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const items = data.items && data.items[0] && data.items[0].articles;
        if (!Array.isArray(items)) throw new Error('respuesta sin items[0].articles');

        const filtered = items.filter(a => !isStructuralNoise(a.article)).slice(0, MAX_ARTICLES_TO_PROCESS);
        log(`[SYS] ${filtered.length}/${items.length} nodos semanticos tras purga estructural`);
        return filtered.map(a => a.article);
    } catch (error) {
        log(`[ERR] Fallo de conexion con la matriz de metricas: ${error.message}`);
        return [];
    }
};

const escapeSparqlLiteral = (value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/[<>{}|^`]/g, ' ');

const parseCoords = (raw) => {
    if (typeof raw !== 'string') return null;
    const match = raw.match(/Point\(([-\d.eE+]+)\s+([-\d.eE+]+)\)/);
    if (!match) return null;
    const lon = Number(match[1]);
    const lat = Number(match[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
};

// Wikidata devuelve precisiones distintas (0000-00-00 = milenio, +1174-01-01 = dia).
// Sin esto, la cronobarra trataria un milenio como un dia.
const datePrecision = (raw) => {
    if (!raw || raw === 'Indeterminado') return 'unknown';
    const value = String(raw);
    const match = value.match(/^([+-]?)(\d{1,9})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!match) return 'unknown';
    const [, , year, month, day] = match;
    if (/^0+$/.test(year) && !month) return 'millennium';
    if (day) return 'day';
    if (month) return 'month';
    if (year.length <= 2) return 'century';
    return 'year';
};

const sortByRecency = (a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    return vb - va;
};

const extractSpatialTemporalData = async (articleTitle) => {
    const title = escapeSparqlLiteral(articleTitle.replace(/_/g, ' '));
    const sparqlQuery = `
        SELECT ?item ?itemLabel ?coords ?date WHERE {
            ?sitelink schema:isPartOf <https://${WIKIPEDIA_LANG}.wikipedia.org/>;
                      schema:name "${title}"@${WIKIPEDIA_LANG};
                      schema:about ?item.
            ?item wdt:P625 ?coords.
            OPTIONAL {
                { ?item wdt:P585 ?date . } UNION
                { ?item wdt:P580 ?date . } UNION
                { ?item wdt:P569 ?date . }
            }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "${WIKIPEDIA_LANG},es". }
        } LIMIT 5
    `;

    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparqlQuery)}&format=json`;

    try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
        if (!response.ok) throw new Error(`SPARQL HTTP ${response.status}`);
        const data = await response.json();

        const bindings = data.results && data.results.bindings;
        if (!Array.isArray(bindings) || bindings.length === 0) return null;

        const candidates = [];
        for (const result of bindings) {
            const coordinates = parseCoords(result.coords && result.coords.value);
            if (!coordinates) continue;
            candidates.push({
                entityId: result.item.value.split('/').pop(),
                title: result.itemLabel ? result.itemLabel.value : articleTitle,
                coordinates,
                timestamp: result.date ? result.date.value : 'Indeterminado'
            });
        }
        if (candidates.length === 0) return null;

        candidates.sort(sortByRecency);
        return candidates[0];
    } catch (error) {
        return null;
    }
};

const executeHarvestCycle = async () => {
    const targetDate = getTargetDate();
    const trendingTitles = await fetchTrendingArticles(targetDate);

    const harvestDate = new Date().toISOString();
    const validVectors = [];
    const seenEntities = new Set();

    if (trendingTitles.length > 0) {
        log(`[SYS] Procesando ${trendingTitles.length} nodos semanticos...`);
    } else {
        log(`[WARN] Sin candidatos. Se emite una coleccion vacia y el front conserva su payload anterior.`);
    }

    for (const title of trendingTitles) {
        await new Promise(resolve => setTimeout(resolve, 800));

        const geoData = await extractSpatialTemporalData(title);
        if (!geoData) continue;
        if (seenEntities.has(geoData.entityId)) continue;
        seenEntities.add(geoData.entityId);

        validVectors.push({
            type: "Feature",
            properties: {
                name: geoData.title,
                timestamp: geoData.timestamp,
                date_precision: datePrecision(geoData.timestamp),
                harvest_date: harvestDate,
                source: `Wikidata:${geoData.entityId}`,
                tier: "Ingesta Cruda (Tier 2)",
                confidence: 0.6
            },
            geometry: {
                type: "Point",
                coordinates: geoData.coordinates
            }
        });
        log(`[+] Vector anclado: ${geoData.title} | Coord: ${geoData.coordinates} | Tiempo: ${geoData.timestamp}`);
    }

    const outputFeatureCollection = {
        type: "FeatureCollection",
        metadata: {
            harvest_date: harvestDate,
            source_date: targetDate.formatted,
            node_origin: "ChronosTerrae_Harvester_0.2",
            total_anomalies_detected: validVectors.length,
            status: validVectors.length > 0 ? 'ok' : 'empty'
        },
        features: validVectors
    };

    log(`[SYS] Ciclo finalizado. ${validVectors.length} vectores. Emitiendo JSON por stdout.`);
    process.stdout.write(JSON.stringify(outputFeatureCollection, null, 2) + '\n');
};

executeHarvestCycle().catch(error => {
    log(`[ERR] Ciclo abortado: ${error.message}`);
    process.stdout.write(JSON.stringify({
        type: "FeatureCollection",
        metadata: {
            harvest_date: new Date().toISOString(),
            node_origin: "ChronosTerrae_Harvester_0.2",
            total_anomalies_detected: 0,
            status: 'error'
        },
        features: []
    }, null, 2) + '\n');
    process.exitCode = 0;
});
