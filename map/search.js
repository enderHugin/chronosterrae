/* search.js - Buscador con lista inmediata: personas, sucesos, construcciones y entidades politicas (y lo que se añada).
 *
 * Modulo puro (navegador y Node):
 *   - normalize(s): minusculas, sin tildes ni signos, espacios simples ("Ángel" -> "angel", "Russell–Einstein" -> "russell einstein").
 *   - prepare(table): la tabla de data/search/index.json ({ fields, rows }) -> entradas con sus textos normalizados.
 *   - query(entries, q, opts): las mejores coincidencias. Todas las palabras de la busqueda deben empezar alguna palabra del nombre
 *     ("einst" -> "Albert Einstein"); si no, vale como subcadena, con menos puntos. Despues pesan la notoriedad y lo corto del nombre.
 *   - highlight(name, q): trozos [{t, m}] para resaltar lo que coincide.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[‐-―'’`´.,;:()[\]{}"«»¿?¡!/\\|-]+/g, ' ').replace(/\s+/g, ' ').trim();

    /** id de un registro cuando el indice lo omite por ser el de siempre: wd.<qid>.<tipo> (tipo: el del suceso, birth/death o built). */
    const idOf = (e) => e.id || (e.qid ? 'wd.' + e.qid.toLowerCase() + '.' + (e.kind === 'built' ? 'built' : e.kind === 'person' ? e.icon : (e.ek || 'event')) : null);
    /** Tabla { fields, rows } -> entradas { ...campos, n: [nombres normalizados], w: [palabras de cada nombre] }. */
    function prepare(table) {
        const f = table.fields; const out = new Array(table.rows.length);
        table.rows.forEach((r, i) => {
            const e = {}; f.forEach((k, j) => { if (r[j] !== null && r[j] !== undefined) e[k] = r[j]; });
            e.id = idOf(e);
            const names = [e.en, e.es].filter(Boolean).map(normalize).filter((x, k, a) => x && a.indexOf(x) === k);
            e.n = names; e.w = names.map((x) => x.split(' '));
            out[i] = e;
        });
        return out;
    }
    /** Añade entradas sueltas (p. ej. las entidades politicas, que llegan en ejecucion) con la misma forma. */
    function entry(obj) {
        const e = Object.assign({}, obj); const names = [e.en, e.es].filter(Boolean).map(normalize).filter((x, k, a) => x && a.indexOf(x) === k);
        e.n = names; e.w = names.map((x) => x.split(' ')); return e;
    }

    // Puntos: nombre exacto > todas las palabras buscadas son palabras ENTERAS del nombre ("einstein" -> "Albert Einstein") > el nombre
    // empieza por lo buscado ("einsteinio") > todas son principio de palabra ("einst") > subcadena. Despues, notoriedad, tipo y brevedad.
    function score(e, q, toks, opts) {
        let best = 0;
        for (let i = 0; i < e.n.length; i++) {
            const n = e.n[i]; const words = e.w[i]; let s = 0;
            if (n === q) s = 1000;
            else if (toks.every((tk) => words.includes(tk))) s = 800 + (n.startsWith(q) ? 50 : 0);
            else if (n.startsWith(q)) s = 520;
            else if (toks.every((tk) => words.some((w) => w.startsWith(tk)))) s = 450 + (toks.slice(0, -1).every((tk) => words.includes(tk)) ? 40 : 0);
            else if (n.indexOf(q) >= 0) s = 160;
            if (s > best) best = s;
        }
        if (!best) return 0;
        const imp = typeof e.imp === 'number' ? e.imp : 0.5;
        const kindBoost = (opts.boost && opts.boost[e.kind]) || 0;
        const len = Math.min(...e.n.map((x) => x.length));
        return best + imp * 220 + kindBoost - Math.min(60, len * 0.6);
    }
    const BOOST = { person: 80, polity: 90, built: 30, event: 0 };

    /** Mejores `limit` entradas para `q` (al menos `min` caracteres). opts: { limit, min, boost: {kind: puntos} }. */
    function query(entries, raw, opts) {
        const o = Object.assign({ limit: 8, min: 2, boost: BOOST }, opts || {});
        const q = normalize(raw); if (q.length < o.min) return [];
        const toks = q.split(' ').filter(Boolean);
        const top = [];   // pequeño monticulo ordenado: con miles de entradas basta insertar en una lista corta
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            // filtro rapido: el primer trozo tiene que aparecer en algun nombre
            let hit = false; for (let k = 0; k < e.n.length; k++) if (e.n[k].indexOf(toks[0]) >= 0) { hit = true; break; }
            if (!hit) continue;
            const s = score(e, q, toks, o); if (!s) continue;
            if (top.length < o.limit || s > top[top.length - 1].s) {
                let j = top.length; top.push({ e, s });
                while (j > 0 && top[j - 1].s < s) { top[j] = top[j - 1]; j--; }
                top[j] = { e, s };
                if (top.length > o.limit) top.pop();
            }
        }
        return top.map((x) => x.e);
    }

    /** Trozos del nombre para resaltar: [{t: texto, m: coincide}], respetando las tildes del original. */
    function highlight(name, raw) {
        const s = String(name || ''); const toks = normalize(raw).split(' ').filter(Boolean);
        if (!toks.length) return [{ t: s, m: false }];
        // indice: posicion normalizada -> posicion original (una letra base por caracter original; los signos cuentan como espacio)
        const chars = [...s]; const base = chars.map((c) => normalize(c) || ' ');
        const flat = base.join('').toLowerCase();
        const mark = new Array(chars.length).fill(false);
        toks.forEach((tk) => {
            let from = 0; let at;
            while ((at = flat.indexOf(tk, from)) >= 0) {
                const startOk = at === 0 || flat[at - 1] === ' ';
                if (startOk) { for (let k = at; k < at + tk.length; k++) mark[k] = true; break; }
                from = at + 1;
            }
        });
        const out = []; chars.forEach((c, i) => { const m = mark[i]; if (out.length && out[out.length - 1].m === m) out[out.length - 1].t += c; else out.push({ t: c, m }); });
        return out;
    }

    return { normalize, prepare, entry, query, highlight, score, BOOST, idOf };
});
