// reliability.js - MEDALLA de fiabilidad de cada dato: bronce, plata, oro, diamante; y aparte, «en disputa». Logica pura (sin DOM).
//
// Pedido del creador (2026-11-14): «una forma clara, sencilla y visual… "rojo, naranja, amarillo, verde" o "bronce, plata, oro, diamante"
// de etiquetar y visualizar la fiabilidad de cada dato… estudiada por IAs, para que cada vez haya, sin esfuerzo de humanos, mas diamantes y
// oros». Se eligen medallas: el escalon mas bajo no es «falso» (lo que diria el rojo de un semaforo), es «una sola fuente sin contrastar»; y
// la contradiccion real va aparte, con su propio aviso, porque es otra cosa.
//
// La medalla NO es una opinion (ni humana ni de una IA): se CALCULA con reglas que cualquiera puede repetir.
//   bronce   : el dato tiene al menos una fuente citada.
//   plata    : esa fuente se apoya en una AUTORIDAD o fuente curada (p. ej. la fecha de Wikidata cita a la GND), o lo reviso una persona.
//   oro      : una fuente curada INDEPENDIENTE dice lo mismo (comprobado por un contraste automatico), o consenso de revisores.
//   diamante : dos o mas fuentes curadas independientes dicen lo mismo, y ninguna lo contradice.
//   en disputa: una fuente curada dice otra cosa. La medalla se queda en bronce hasta que se aclare, y se muestran las dos versiones.
//   (Ni suben ni bajan, pero se dicen: el mismo dia en otro calendario, y fechas que las fuentes dan como aproximadas.)
// Independiente = no copia a la otra: si Wikidata cita a la GND para esa fecha, que coincidan no prueba nada nuevo.
// Regla 2 del proyecto (lo generado por IA no pasa de `community`): sigue rigiendo el ESTADO de revision. Una IA puede proponer fuentes y
// contrastes; la medalla solo sube cuando el contraste (codigo, sin IA) encuentra el mismo valor en otra fuente.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosReliability = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MEDALS = ['none', 'bronze', 'silver', 'gold', 'diamond'];
    // Fuentes de contraste: id -> { name, curated }. curated = autoridad, archivo academico o agencia (docs/FUENTES.md).
    const SOURCES = {
        gnd: { name: 'GND (Deutsche Nationalbibliothek)', curated: true },
        hced: { name: 'HCED (Miller 2022)', curated: true },
        ucdp: { name: 'UCDP', curated: true },
        cliopatria: { name: 'Cliopatria (Seshat)', curated: true }
    };

    /**
     * p: properties del registro ({ sources, status }). checks: [{ source, result: 'a'|'d', value, independent, level }] (contrastes).
     * Devuelve { level 0..4, medal, disputed, reasons: [{ k, source?, value?, level? }] } (k = clave de texto para la ficha).
     */
    function medal(p, checks) {
        const reasons = []; let level = 0; let disputed = false;
        if (p && Array.isArray(p.sources) && p.sources.length) { level = 1; reasons.push({ k: 'one-source' }); }
        if (!level) return { level: 0, medal: 'none', disputed: false, reasons: [{ k: 'no-source' }] };
        const st = p.status;
        if (st === 'reviewed') { level = Math.max(level, 2); reasons.push({ k: 'reviewed' }); }
        if (st === 'consensus') { level = Math.max(level, 3); reasons.push({ k: 'consensus' }); }
        let indep = 0;
        for (const c of checks || []) {
            const s = SOURCES[c.source]; if (!s || !s.curated) continue;
            if (c.result === 'd') { disputed = true; reasons.push({ k: c.alt ? 'disputed-alt' : 'disputed', source: c.source, value: c.value, level: c.level }); continue; }
            if (c.result === 'c' || c.result === 'u') { reasons.push({ k: c.result === 'c' ? 'calendar' : 'approx', source: c.source, value: c.value, level: c.level }); continue; }
            if (c.result !== 'a') continue;
            if (c.independent) { indep++; reasons.push({ k: 'agrees', source: c.source, value: c.value, level: c.level }); }
            else { level = Math.max(level, 2); reasons.push({ k: 'cites', source: c.source, value: c.value, level: c.level }); }
        }
        if (indep >= 2) level = 4; else if (indep === 1) level = Math.max(level, 3);
        if (disputed) level = Math.min(level, 1);
        return { level, medal: MEDALS[level], disputed, reasons };
    }

    /** Fila compacta del fichero de contraste ([a|d, valor, id, nivel, independiente]) -> check. */
    function fromRow(source, row) {
        if (!Array.isArray(row) || !['a', 'd', 'c', 'u'].includes(row[0])) return null;
        return { source, result: row[0], value: row[1], ref: row[2], level: row[3], independent: row[4] === 1, alt: row[5] === 1 };
    }

    return { MEDALS, SOURCES, medal, fromRow };
}));
