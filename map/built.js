/* built.js - Capa «Construcciones»: catedrales, piramides, castillos, puentes... con fecha de construccion (data/built, desde Wikidata).
 *
 * Modulo puro (navegador y Node): dibujos de linea por familia (mismo estilo que los sucesos: trazo de color con borde negro, via
 * ChronosEventIcons.draw con `parts`), datos compactos para el mapa y el estado de una construccion en una fecha:
 *   - antes de su fecha de construccion (la mas antigua que da la fuente): no se muestra;
 *   - despues: se muestra; si la fuente da un fin (Wikidata P576, que mezcla demolicion y abandono) y ya ha pasado, se ATENUA
 *     ("fin segun la fuente"), no se borra: Machu Picchu "termina" en 1572 y sigue en pie como ruina.
 * ESTILO PROPIO, a proposito distinto del de los sucesos (2026-11-12, el creador: "no puede ser el mismo diseño que el tipo evento"):
 *   - sucesos: trazo de color intenso con borde NEGRO grueso (insignia que llama la atencion);
 *   - construcciones: simbolo de mapa, TINTA oscura con un halo CLARO fino, trazo mas fino y tamaño menor (~2/3), como un grabado;
 *     pasado su fin, tinta gris y halo apagado, semitransparente.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./event-icons.js'));
    else root.ChronosBuilt = factory(root.ChronosEventIcons);
})(typeof self !== 'undefined' ? self : this, function (EI) {
    'use strict';
    const W = 1.75;                   // trazo mas fino que el de los sucesos (2,05)
    const COLOR = '#2e241a';          // tinta sepia oscura (los sucesos son colores vivos)
    const HALO = '#f4ecdc';           // halo de papel (los sucesos llevan borde negro)
    const BORDER_W = 1.9;             // halo mas fino que el borde de los sucesos (2,6)
    const ENDED_COLOR = '#746d62';    // ya paso el fin que da la fuente: tinta gris...
    const ENDED_HALO = '#d8d2c6';     // ...con halo apagado
    const ENDED_OPACITY = 0.6;
    const CHIP = '#f4ecdc';           // fondo de la etiqueta al pasar el raton (papel, no el color de un suceso)
    const FAMILIES = [
        { id: 'pyramid', es: 'Pirámide o zigurat', en: 'Pyramid or ziggurat' },
        { id: 'religious', es: 'Templo, iglesia, mezquita, monasterio…', en: 'Temple, church, mosque, monastery…' },
        { id: 'palace', es: 'Palacio o museo', en: 'Palace or museum' },
        { id: 'fortification', es: 'Castillo o fortificación', en: 'Castle or fortification' },
        { id: 'monument', es: 'Monumento, mausoleo o megalito', en: 'Monument, mausoleum or megalith' },
        { id: 'venue', es: 'Anfiteatro, estadio o teatro', en: 'Amphitheatre, stadium or theatre' },
        { id: 'tower', es: 'Torre, rascacielos o faro', en: 'Tower, skyscraper or lighthouse' },
        { id: 'infrastructure', es: 'Puente, presa, acueducto, estación o aeropuerto', en: 'Bridge, dam, aqueduct, station or airport' },
        { id: 'archaeological', es: 'Yacimiento arqueológico', en: 'Archaeological site' },
        { id: 'other', es: 'Otra construcción', en: 'Other structure' }
    ];
    const IDS = FAMILIES.map((f) => f.id);
    // Rejilla de 24x24 como los sucesos. 's' = trazo del color; 'f' = relleno del color.
    // (trazos secundarios al 85 % de los del primer diseño: todo mas fino que en los sucesos)
    const GLYPHS = {
        // piramide escalonada
        pyramid: [{ d: 'M2.4 20.6 H21.6 L12 3.6 Z', t: 's', w: W }, { d: 'M6.4 13.6 H17.6', t: 's', w: 1.36 }, { d: 'M4.4 17.1 H19.6', t: 's', w: 1.36 }],
        // edificio con cupula y aguja: neutro entre religiones (sin cruz ni media luna)
        religious: [{ d: 'M5 21 V12.4 H19 V21 Z', t: 's', w: W }, { d: 'M7.2 12.4 a4.8 4.8 0 0 1 9.6 0', t: 's', w: W }, { d: 'M12 7.6 V2.8', t: 's', w: 1.53 },
            { d: 'M10.3 21 V17.6 a1.7 1.7 0 0 1 3.4 0 V21', t: 's', w: 1.27 }],
        // fronton y columnas
        palace: [{ d: 'M2.8 8.6 L12 3.4 L21.2 8.6 Z', t: 's', w: W }, { d: 'M6 11 V18.4 M10 11 V18.4 M14 11 V18.4 M18 11 V18.4', t: 's', w: 1.53 }, { d: 'M2.8 20.8 H21.2', t: 's', w: W }],
        // torre con almenas y puerta
        fortification: [{ d: 'M5 21 V7.6 H7.8 V10.2 H10.6 V7.6 H13.4 V10.2 H16.2 V7.6 H19 V21 Z', t: 's', w: W }, { d: 'M10 21 V16.8 a2 2 0 0 1 4 0 V21', t: 's', w: 1.36 }],
        // obelisco sobre su base
        monument: [{ d: 'M9.8 19 L10.8 6.2 L12 3.4 L13.2 6.2 L14.2 19 Z', t: 's', w: W }, { d: 'M6.4 21 H17.6', t: 's', w: W + 0.3 }],
        // anfiteatro: dos elipses
        venue: [{ d: 'M2.4 13 a9.6 6.2 0 1 0 19.2 0 a9.6 6.2 0 1 0 -19.2 0', t: 's', w: W }, { d: 'M7.6 13 a4.4 2.4 0 1 0 8.8 0 a4.4 2.4 0 1 0 -8.8 0', t: 's', w: 1.36 }],
        // torre alta con remate
        tower: [{ d: 'M8.8 21 L10 7.4 H14 L15.2 21 Z', t: 's', w: W }, { d: 'M8.4 7.4 H15.6', t: 's', w: W }, { d: 'M12 7.4 V2.6', t: 's', w: 1.36 }, { d: 'M10.8 12.6 H13.2', t: 's', w: 1.19 }],
        // puente de arco con tablero y pilas
        infrastructure: [{ d: 'M2 9.6 H22', t: 's', w: W }, { d: 'M2.8 20.4 C6.4 12.4 17.6 12.4 21.2 20.4', t: 's', w: W }, { d: 'M7.2 9.6 V14.6 M12 9.6 V12.6 M16.8 9.6 V14.6', t: 's', w: 1.27 }],
        // columna rota sobre su base
        archaeological: [{ d: 'M8.2 20.6 V9.4 L10.2 7.4 L12.2 9.2 L14 6.6 L15.8 8.6 V20.6', t: 's', w: W }, { d: 'M5.4 21 H18.6', t: 's', w: W + 0.3 }, { d: 'M11.1 11.4 V18.6 M13 11.4 V18.6', t: 's', w: 1.1 }],
        // casa generica
        other: [{ d: 'M4.4 21 V10.4 L12 4 L19.6 10.4 V21 Z', t: 's', w: W }, { d: 'M10.2 21 V16 H13.8 V21', t: 's', w: 1.36 }]
    };

    /** Dibuja el icono de la familia en un cuadrado de `size` px. o: { x, y, ended (gris), Path2D }. */
    function draw(ctx, family, size, o) {
        const parts = GLYPHS[family] || GLYPHS.other;
        const ended = !!(o && o.ended);
        return EI.draw(ctx, 'built-' + family, size, Object.assign({}, o || {}, { parts, color: ended ? ENDED_COLOR : COLOR, halo: ended ? ENDED_HALO : HALO, border: BORDER_W }));
    }

    /**
     * Desde que fecha (años BP) se dibuja. La fecha del mapa va por años (setTime): con una fecha al año, mes o dia se dibuja desde el
     * COMIENZO de ese año (si no, Notre-Dame, de 1163, no saldria en 1163); con decada, siglo o milenio, desde el centro del intervalo.
     * Igual para el fin: desde el comienzo del año del fin.
     */
    function yearStart(ybp, iso, precision) {
        if (precision === 'year' || precision === 'month' || precision === 'day') { const y = parseInt((String(iso || '').match(/^-?\d+/) || [])[0], 10); if (Number.isFinite(y)) return 1950 - y; }
        return ybp;
    }

    /** Nombre en el idioma (si no, ingles). */
    const nameOf = (p, lang) => (p.labels && (p.labels[lang] || p.labels.en)) || p.name;

    /**
     * Registros (data/built/built.json) -> GeoJSON compacto para la fuente del mapa: id, familia (f), inicio (s, años BP), fin (e, años BP,
     * solo si la fuente da fin), importancia (i) y nombre (n). Los registros sin punto se quedan fuera.
     */
    function compact(features, lang) {
        const out = [];
        for (const f of features || []) {
            const p = f.properties; if (!f.geometry || f.geometry.type !== 'Point') continue;
            const d0 = p.built.dates[0];
            const q = { id: p.id, f: IDS.includes(p.built && p.built.family) ? p.built.family : 'other', s: yearStart(p.time.start_ybp, d0.iso, d0.precision), i: p.importance || 0, n: nameOf(p, lang), d: d0.iso, p: d0.precision };
            if (p.built && p.built.end) q.e = yearStart(p.time.end_ybp, p.built.end.iso, p.built.end.precision);
            out.push({ type: 'Feature', geometry: f.geometry, properties: q });
        }
        return { type: 'FeatureCollection', features: out };
    }

    /**
     * Tabla compacta (data/built/built-map.json: { fields, rows }) -> GeoJSON para la fuente del mapa, con los mismos campos que compact()
     * y ademas la primera fecha (d: iso, p: precision) para la etiqueta al pasar el raton. vf(status, evidence) -> bool filtra (todo es raw/documentary).
     */
    function fromTable(table, lang, keep) {
        const ix = {}; (table.fields || []).forEach((k, i) => { ix[k] = i; });
        const need = ['qid', 'lng', 'lat', 'family', 'start_ybp', 'end_ybp', 'importance', 'en', 'es', 'iso', 'precision'];
        if (!need.every((k) => k in ix)) throw new Error('tabla de construcciones sin los campos esperados');
        const out = [];
        for (const r of table.rows || []) {
            if (keep && !keep(r)) continue;
            const q = { id: 'wd.' + String(r[ix.qid]).toLowerCase() + '.built', f: IDS.includes(r[ix.family]) ? r[ix.family] : 'other', s: yearStart(r[ix.start_ybp], r[ix.iso], r[ix.precision]), i: r[ix.importance] || 0,
                n: (lang === 'es' && r[ix.es]) || r[ix.en], d: r[ix.iso], p: r[ix.precision] };
            // (la tabla no trae la precision del fin: se usa su centro, a lo sumo medio año tarde con fechas al año)
            if (r[ix.end_ybp] !== null && r[ix.end_ybp] !== undefined) q.e = r[ix.end_ybp];
            out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r[ix.lng], r[ix.lat]] }, properties: q });
        }
        return { type: 'FeatureCollection', features: out };
    }

    /** Estado de una construccion (propiedades compactas o registro) en la fecha `ybp` (años BP): 'future' | 'standing' | 'ended'. */
    function stateAt(p, ybp) {
        const d0 = p.built && p.built.dates && p.built.dates[0];
        const s = p.s !== undefined ? p.s : d0 ? yearStart(p.time.start_ybp, d0.iso, d0.precision) : p.time.start_ybp;
        const e = p.e !== undefined ? p.e : (p.built && p.built.end ? yearStart(p.time.end_ybp, p.built.end.iso, p.built.end.precision) : undefined);
        if (ybp > s) return 'future';
        return e !== undefined && ybp < e ? 'ended' : 'standing';
    }

    // Cuantas se ven segun la distancia (capas por tramos de zoom): con la Tierra lejos solo las mas notorias, de cerca todas.
    // importancia = log10(Wikipedias)/2,2: 0,85 ~ 75 Wikipedias (128 en el mundo); 0,75 ~ 45 (731); de cerca, las 5 137.
    const TIERS = [
        { id: 'built-icons-far', minzoom: 1.6, maxzoom: 3.5, min: 0.85 },
        { id: 'built-icons-mid', minzoom: 3.5, maxzoom: 5.5, min: 0.75 },
        { id: 'built-icons', minzoom: 5.5, maxzoom: 24, min: 0 }
    ];
    const LAYER_IDS = TIERS.map((x) => x.id);
    // Expresiones de MapLibre con la fecha como literal (se rehacen al cambiar la fecha: setFilter / setLayoutProperty, baratos con miles de puntos)
    const filterAt = (ybp, min) => (min ? ['all', ['>=', ['get', 's'], ybp], ['>=', ['get', 'i'], min]] : ['>=', ['get', 's'], ybp]);
    const endedExpr = (ybp) => ['all', ['has', 'e'], ['<', ybp, ['get', 'e']]];
    const imageAt = (ybp) => ['case', endedExpr(ybp), ['concat', 'bui-', ['get', 'f'], '-x'], ['concat', 'bui-', ['get', 'f']]];
    // tamaño con el zoom como los sucesos (encogen con la Tierra lejos) pero ~2/3 del suyo: son fondo del mapa, no noticia
    const sizeExpr = () => EI.zoomScaled(['interpolate', ['linear'], ['get', 'i'], 0.5, 0.56, 1, 0.72]);

    /** Texto de una fecha del registro ({iso, precision}) con un formateador de años astronomicos (fmtYear(y) -> "2560 a. C."). */
    function dateText(d, fmtYear) {
        if (!d || !d.iso) return '';
        const m = /^(-?\d{1,})(?:-(\d{2}))?(?:-(\d{2}))?(?:\/(-?\d{1,}))?$/.exec(d.iso); if (!m) return d.iso;
        const a = parseInt(m[1], 10); const b = m[4] !== undefined ? parseInt(m[4], 10) : null;
        if (b !== null && b !== a) return fmtYear(a) + ' – ' + fmtYear(b);
        if (m[3]) return m[3].replace(/^0/, '') + '/' + m[2] + '/' + fmtYear(a);
        if (m[2]) return m[2] + '/' + fmtYear(a);
        return fmtYear(a);
    }

    return { COLOR, HALO, BORDER_W, CHIP, ENDED_COLOR, ENDED_HALO, ENDED_OPACITY, TIERS, LAYER_IDS, FAMILIES, IDS, GLYPHS, draw, nameOf, yearStart, compact, fromTable, stateAt, filterAt, endedExpr, imageAt, sizeExpr, dateText };
});
