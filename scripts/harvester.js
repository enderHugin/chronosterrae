// harvester.js
/**
 * Motor de Ingesta Asíncrona - ChronosTerrae (AI Harvester Nodo Cero)
 * Sismógrafo de atención humana: Wikipedia Pageviews -> Wikidata SPARQL
 */

const WIKIPEDIA_LANG = 'en';
const MAX_ARTICLES_TO_PROCESS = 50;

const getTargetDate = () => {
    // La API de métricas compila los datos con un día de retraso estructural
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return { yyyy, mm, dd, formatted: `${yyyy}/${mm}/${dd}` };
};

const fetchTrendingArticles = async (dateObj) => {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${WIKIPEDIA_LANG}.wikipedia.org/all-access/${dateObj.yyyy}/${dateObj.mm}/${dateObj.dd}`;
    console.log(`[SYS] Interceptando telemetría de atención para: ${dateObj.formatted}`);
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Purga de ruido estructural (portadas, búsquedas y páginas de sistema)
        const rawArticles = data.items[0].articles;
        const filtered = rawArticles.filter(a => 
            !a.article.includes(':') && 
            a.article !== 'Main_Page' &&
            a.article !== 'Cleopatra' // Ejemplo de filtro anti-sesgo algorítmico común
        ).slice(0, MAX_ARTICLES_TO_PROCESS);
        
        return filtered.map(a => a.article);
    } catch (error) {
        console.error(`[ERR] Fallo de conexión con la matriz de métricas: ${error.message}`);
        return [];
    }
};

const extractSpatialTemporalData = async (articleTitle) => {
    // Consulta a Wikidata para extraer coordenadas (P625) y fechas (P585: point in time, P569: date of birth, etc.)
    const sparqlQuery = `
        SELECT ?item ?itemLabel ?coords ?date WHERE {
            ?sitelink schema:isPartOf <https://${WIKIPEDIA_LANG}.wikipedia.org/>;
                      schema:name "${articleTitle.replace(/_/g, ' ')}"@${WIKIPEDIA_LANG};
                      schema:about ?item.
            ?item wdt:P625 ?coords.
            OPTIONAL { 
                { ?item wdt:P585 ?date . } UNION 
                { ?item wdt:P580 ?date . } UNION 
                { ?item wdt:P569 ?date . } 
            }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "${WIKIPEDIA_LANG}". }
        } LIMIT 1
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'ChronosTerrae_HarvesterNode_0.1' } });
        const data = await response.json();
        
        if (data.results.bindings.length > 0) {
            const result = data.results.bindings[0];
            return {
                entityId: result.item.value.split('/').pop(),
                title: result.itemLabel ? result.itemLabel.value : articleTitle,
                coordinates: result.coords.value.replace('Point(', '').replace(')', '').split(' ').map(Number),
                timestamp: result.date ? result.date.value : 'Indeterminado'
            };
        }
        return null;
    } catch (error) {
        return null;
    }
};

const executeHarvestCycle = async () => {
    const targetDate = getTargetDate();
    const trendingTitles = await fetchTrendingArticles(targetDate);
    
    if (trendingTitles.length === 0) return;

    console.log(`[SYS] Procesando ${trendingTitles.length} nodos semánticos...`);
    const validVectors = [];

    for (const title of trendingTitles) {
        // Retardo artificial (throttle) para evitar el bloqueo del nodo por límite de peticiones (Rate Limit)
        await new Promise(resolve => setTimeout(resolve, 800)); 
        
        const geoData = await extractSpatialTemporalData(title);
        if (geoData) {
            validVectors.push({
                type: "Feature",
                properties: {
                    name: geoData.title,
                    timestamp: geoData.timestamp,
                    source: `Wikidata:${geoData.entityId}`,
                    tier: "Ingesta Cruda (Tier 2)",
                    confidence: 0.6
                },
                geometry: {
                    type: "Point",
                    coordinates: geoData.coordinates // [Longitud, Latitud]
                }
            });
            console.log(`[+] Vector anclado: ${geoData.title} | Coord: ${geoData.coordinates} | Tiempo: ${geoData.timestamp}`);
        }
    }

    const outputFeatureCollection = {
        type: "FeatureCollection",
        metadata: {
            harvest_date: new Date().toISOString(),
            node_origin: "ChronosTerrae_Local_Alpha",
            total_anomalies_detected: validVectors.length
        },
        features: validVectors
    };

    console.log('\n[SYS] Ciclo de ingesta finalizado. Payload CRDT generado:');
    console.log(JSON.stringify(outputFeatureCollection, null, 2));
};

// Inicialización del nodo recolector
executeHarvestCycle();
