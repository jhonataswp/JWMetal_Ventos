(function (root) {
  "use strict";

  const NB = typeof module !== "undefined" && module.exports ? require("./normas.js") : root.NormaABNT;
  const { roughness, frByClass, groups, wallTable, gableRoofTable, shedRoofTable } = NB;

  function geometry(state) {
    const b = Math.max(Number(state.b) || 0, .01);
    const a = Math.max(Number(state.a) || 0, .01);
    const h = Math.max(Number(state.h) || 0, 0);
    const alpha = Number(state.alpha) || 0;
    const roof = state.roof === "Duas águas" ? "gable"
      : state.roof === "Uma água" ? "shed"
        : state.roof === "Abóbada" ? "arch" : state.roof;
    const rise = roof === "gable" ? b / 2 * Math.tan(alpha * Math.PI / 180)
      : roof === "shed" ? b * Math.tan(alpha * Math.PI / 180)
        : roof === "arch" ? Math.min(Math.max(Number(state.flecha) || 0, 0), b / 2)
          : 0;
    return {
      a, b, h, alpha, roof, rise, totalHeight: h + rise,
      aOverB: a / b,
      hOverB: h / b,
    };
  }

  function lerp(x, x0, x1, y0, y1) {
    if (Math.abs(x1 - x0) < 1e-12) return y0;
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
  }

  function tableInterpolate(rows, x, valueIndex) {
    if (x <= rows[0][0]) return rows[0][valueIndex];
    const last = rows[rows.length - 1];
    if (x >= last[0]) return last[valueIndex];
    for (let i = 0; i < rows.length - 1; i++) {
      const low = rows[i], high = rows[i + 1];
      if (x <= high[0]) return lerp(x, low[0], high[0], low[valueIndex], high[valueIndex]);
    }
    return last[valueIndex];
  }


  function dominantOpening(effectiveAreas) {
    const entries = Object.entries(effectiveAreas).map(([face, area]) => [face, Number(area) || 0]);
    const total = entries.reduce((sum, [, area]) => sum + area, 0);
    const max = Math.max(...entries.map(([, area]) => area));
    if (!(max > 1e-9)) return null;
    const top = entries.filter(([, area]) => Math.abs(area - max) < 1e-12);
    if (top.length !== 1) return null;
    const others = total - max;
    if (max < others - 1e-9) return null;
    return { face: top[0][0], ratio: others > 1e-9 ? max / others : 99 };
  }

  function dominantCpi(kind, ratio) {
    return tableInterpolate(kind === "suction" ? dominantSuctionTable : dominantBarlaventoTable, ratio, 1);
  }

  const { archSeries, dominantBarlaventoTable, dominantSuctionTable } = NB;

  function archSerieFor(state) {
    return ["I", "II"].includes(state.category) ? "S1" : "S2";
  }

  function nearestArchModel(g, serie) {
    const fb = Math.max(g.rise / g.b, 1e-6), hb = Math.max(g.h / g.b, 1e-6), ab = Math.max(g.aOverB, 1e-6);
    let best = null, bestDistance = Infinity;
    for (const model of archSeries.filter(item => item.serie === serie)) {
      const distance = Math.abs(Math.log(fb / model.fb)) + Math.abs(Math.log(hb / model.hb)) + .5 * Math.abs(Math.log(ab / model.ab));
      if (distance < bestDistance) { best = model; bestDistance = distance; }
    }
    return best;
  }

  function cpeArch(state, direction = state.direction == null ? 90 : Number(state.direction)) {
    const g = geometry(state);
    if (g.roof !== "arch") return null;
    const model = nearestArchModel(g, archSerieFor(state));
    const { shortSpan, wall } = cpeWalls(g);
    if (Number(direction) === 0) {
      const c1x = Math.min(Math.max(shortSpan / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
      const part = g.b / 3;
      return [
        { id: "A", name: "Empena barlavento", cpe: wall.C },
        { id: "B", name: "Empena sotavento", cpe: wall.D },
        { id: "C", name: `Fachadas — 1º trecho (${c1x.toFixed(2)} m)`, cpe: wall.A1B1 },
        { id: "D", name: "Fachadas — até o meio", cpe: wall.A2B2 },
        { id: "G", name: "Fachadas — metade de sotavento (A3/B3)", cpe: wall.A3B3 },
        { id: "E1", name: `Abóbada — 1º trecho (b/3 = ${part.toFixed(2)} m)`, cpe: model.paral[0] },
        { id: "E2", name: `Abóbada — 2º trecho (b/3 = ${part.toFixed(2)} m)`, cpe: model.paral[1] },
        { id: "E3", name: `Abóbada — 3º trecho (b/3 = ${part.toFixed(2)} m)`, cpe: model.paral[2] },
        { id: "E4", name: "Abóbada — restante", cpe: model.paral[3] },
      ];
    }
    const c1 = Math.min(2 * g.h, shortSpan / 2);
    return [
      { id: "A", name: "Fachada barlavento", cpe: wall.A },
      { id: "B", name: "Fachada sotavento", cpe: wall.B },
      { id: "C", name: `Empenas — 1º trecho (${c1.toFixed(2)} m)`, cpe: wall.C1D1 },
      { id: "D", name: "Empenas — demais trechos", cpe: wall.C2D2 },
      ...model.perp.map((cpe, i) => ({ id: `E${i + 1}`, name: `Abóbada — parte ${i + 1}`, cpe })),
    ];
  }

  function normalWarnings(state) {
    const g = geometry(state);
    const shortSpan = Math.min(g.a, g.b);
    const aOverB = Math.max(g.a, g.b) / shortSpan;
    const hOverB = g.h / shortSpan;
    const out = [];
    if (g.roof === "gable" || g.roof === "shed") {
      if (hOverB > 6) out.push("h/b acima de 6: as Tabelas 6 e 7 não cobrem esta relação (6.1.1).");
      if (aOverB > 4) out.push("a/b acima de 4: as Tabelas 6 e 7 não cobrem esta relação (6.1.1).");
    }
    if (g.roof === "shed") {
      if (hOverB >= 2) out.push("A Tabela 8 vale apenas para h/b < 2 (6.1.1).");
      if (g.alpha < 5) out.push("A Tabela 8 começa em θ = 5°; para θ menor, a norma usa a Tabela 7 com θ = 0° (Nota 2 da Tabela 8).");
      if (g.alpha > 30) out.push("A Tabela 8 vai até θ = 30°.");
    }
    if (g.roof === "arch") {
      const series = archSeries.filter(item => item.serie === archSerieFor(state));
      const serieName = archSerieFor(state);
      const range = (key, value) => {
        const values = series.map(item => item[key]);
        return value >= Math.min(...values) - 1e-9 && value <= Math.max(...values) + 1e-9
          ? null : `${key === "ab" ? "a/b" : key === "fb" ? "f/b" : "h/b"} = ${value.toFixed(2)} fora da faixa dos ensaios da série ${serieName} (Tabelas 18 a 20); o modelo mais próximo é extrapolado.`;
      };
      [range("ab", g.aOverB), range("fb", g.rise / g.b), range("hb", g.h / g.b)].forEach(item => { if (item) out.push(item); });
    }
    return out;
  }

  function cpeWalls(g) {
    const shortSpan = Math.min(g.a, g.b);
    const ab = Math.max(g.a, g.b) / shortSpan;
    const hb = g.h / shortSpan;
    const hbRef = hb <= .5 ? .5 : hb <= 1.5 ? 1.5 : 6;
    const wallRows = wallTable.filter(row => row.hb === hbRef).sort((a, b) => a.ab - b.ab);
    const ratio = Math.min(1, Math.max(0, (ab - 1.5) / .5));
    const wall = {};
    for (const key of ["A1B1", "A2B2", "C", "D", "A", "B", "C1D1", "C2D2", "medio"]) {
      wall[key] = lerp(ratio, 0, 1, wallRows[0][key], wallRows[1][key]);
    }
    wall.A3B3 = ab <= 1 ? wall.A2B2 : ab >= 2 ? -.2 : lerp(ab, 1, 2, wall.A2B2, -.2);
    return { shortSpan, ab, hbRef, wall };
  }

  // Parâmetros de tabela e coeficientes efetivamente aplicados (usado no memorial).
  function cpeBasis(state, direction = state.direction == null ? 90 : Number(state.direction)) {
    const g = geometry(state);
    const { shortSpan, ab, hbRef, wall } = cpeWalls(g);
    const basis = { hb: g.h / shortSpan, ab, hbRef, shortSpan, walls: { table: "6", ...wall }, roof: null };
    if (g.roof === "gable") {
      const rows = gableRoofTable.find(row => row.hb === hbRef)?.rows || gableRoofTable[0].rows;
      const theta = Math.min(60, Math.max(0, g.alpha));
      const roof = [1, 2, 3, 4].map(index => tableInterpolate(rows, theta, index));
      basis.roof = {
        table: "7", theta,
        efi: roof[0], ghj: roof[1], eg: roof[2], fh: roof[3],
        j: ab <= 1 ? roof[3] : ab >= 2 ? -.2 : lerp(ab, 1, 2, roof[3], -.2),
      };
    } else if (g.roof === "shed") {
      const theta = Math.min(30, Math.max(5, g.alpha));
      const at = key => tableInterpolate(shedRoofTable.map(row => [row.theta, row[key]]), theta, 1);
      basis.roof = {
        table: "8", theta,
        h: Math.min(at("n90Hi"), at("n45H"), at("m45H"), at("m90Hi")),
        l: Math.min(at("n90Lj"), at("n45L"), at("m45L"), at("m90Lj")),
        z0a: at("z0a"), z0b: at("z0b"),
        middle: ab <= 1 ? at("z0a") : ab >= 2 ? -.2 : lerp(ab, 1, 2, at("z0a"), -.2),
      };
    } else if (g.roof === "arch") {
      const serie = archSerieFor(state);
      basis.roof = { table: "18 a 20", serie, model: nearestArchModel(g, serie) };
    }
    return basis;
  }

  function cpeGable(state, direction = state.direction == null ? 90 : Number(state.direction)) {
    const g = geometry(state);
    if (g.roof !== "gable") return null;
    const basis = cpeBasis(state, direction);
    const { shortSpan, walls: wall } = basis;
    const roof = [basis.roof.efi, basis.roof.ghj, basis.roof.eg, basis.roof.fh];
    const roofJ = basis.roof.j;
    const direction90 = Number(direction) !== 0;
    if (direction90) {
      const c1 = Math.min(2 * g.h, shortSpan / 2);
      return [
        { id: "A", name: "Fachada barlavento", cpe: wall.A },
        { id: "B", name: "Fachada sotavento", cpe: wall.B },
        { id: "C", name: `Empenas — 1º trecho (${c1.toFixed(2)} m)`, cpe: wall.C1D1 },
        { id: "D", name: "Empenas — demais trechos", cpe: wall.C2D2 },
        { id: "E", name: "Cobertura barlavento (EFI)", cpe: roof[0] },
        { id: "F", name: "Cobertura sotavento (GHJ)", cpe: roof[1] },
      ];
    }
    const c1x = Math.min(Math.max(shortSpan / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
    return [
      { id: "A", name: "Empena barlavento", cpe: wall.C },
      { id: "B", name: "Empena sotavento", cpe: wall.D },
      { id: "C", name: `Fachadas — 1º trecho (${c1x.toFixed(2)} m)`, cpe: wall.A1B1 },
      { id: "D", name: "Fachadas — até o meio", cpe: wall.A2B2 },
      { id: "G", name: "Fachadas — metade de sotavento (A3/B3)", cpe: wall.A3B3 },
      { id: "E", name: `Cobertura — 1º trecho (${c1x.toFixed(2)} m)`, cpe: roof[2] },
      { id: "F", name: "Cobertura — até o meio (a/2)", cpe: roof[3] },
      { id: "J", name: "Cobertura — metade de sotavento (I/J)", cpe: roofJ },
    ];
  }

  function cpeShed(state, direction = state.direction == null ? 90 : Number(state.direction)) {
    const g = geometry(state);
    if (g.roof !== "shed") return null;
    const basis = cpeBasis(state, direction);
    const { shortSpan, walls: wall } = basis;
    const hEnvelope = basis.roof.h;
    const lEnvelope = basis.roof.l;
    const middle0 = basis.roof.middle;
    if (Number(direction) !== 0) {
      const c1 = Math.min(2 * g.h, shortSpan / 2);
      return [
        { id: "A", name: "Fachada barlavento", cpe: wall.A },
        { id: "B", name: "Fachada sotavento", cpe: wall.B },
        { id: "C", name: `Empenas — 1º trecho (${c1.toFixed(2)} m)`, cpe: wall.C1D1 },
        { id: "D", name: "Empenas — demais trechos", cpe: wall.C2D2 },
        { id: "E", name: "Cobertura — H (envoltória ±90°/±45°)", cpe: hEnvelope },
        { id: "F", name: "Cobertura — L (envoltória ±90°/±45°)", cpe: lEnvelope },
      ];
    }
    const c1x = Math.min(Math.max(shortSpan / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
    return [
      { id: "A", name: "Empena barlavento", cpe: wall.C },
      { id: "B", name: "Empena sotavento", cpe: wall.D },
      { id: "C", name: `Fachadas — 1º trecho (${c1x.toFixed(2)} m)`, cpe: wall.A1B1 },
      { id: "D", name: "Fachadas — até o meio", cpe: wall.A2B2 },
      { id: "G", name: "Fachadas — metade de sotavento (A3/B3)", cpe: wall.A3B3 },
      { id: "E", name: "Cobertura — grupo 0° a", cpe: basis.roof.z0a },
      { id: "F", name: "Cobertura — grupo 0° b", cpe: basis.roof.z0b },
      { id: "J", name: "Cobertura — trecho intermediário I0/J0", cpe: middle0 },
    ];
  }

  function s1AtHeight(state, z) {
    if (state.topography === "valley") return .90;
    if (state.topography !== "slope" && state.topography !== "manual") return 1;
    const theta = Number(state.thetaT) || 0;
    const dt = Number(state.dt) || 0;
    if (dt <= 0 || theta <= 3) return 1;
    const x = 2.5 - z / dt;
    const helper = angle => 1 + x * Math.tan((angle - 3) * Math.PI / 180);
    let value;
    if (theta <= 6) value = 1 + (theta - 3) / 3 * (helper(6) - 1);
    else if (theta <= 17) value = helper(theta);
    else if (theta < 45) value = helper(17) + (theta - 17) / 28 * ((1 + x * .31) - helper(17));
    else value = 1 + x * .31;
    return Math.max(1, value);
  }

  function calculate(state, direction = state.direction == null ? 90 : Number(state.direction)) {
    const g = geometry(state);
    const category = roughness.find(x => x.id === state.category) || roughness[1];
    const frontDimension = direction === 90 ? g.a : g.b;
    const classIndex = state.manualClass === "" || state.manualClass == null || state.manualClass === "auto"
      ? (Math.max(frontDimension, g.totalHeight) <= 20 ? 0 : Math.max(frontDimension, g.totalHeight) <= 50 ? 1 : 2)
      : Number(state.manualClass);
    const [b_m, p] = category.rows[classIndex] || category.rows[0];
    const fr = frByClass[classIndex];
    const s2At = z => b_m * fr * Math.pow(Math.max(z, category.zMin) / 10, p);
    let z = g.totalHeight;
    if ((state.topography === "slope" || state.topography === "manual") && g.totalHeight > 0) {
      let best = -Infinity;
      for (let i = 0; i <= 32; i++) {
        const candidate = g.totalHeight * i / 32;
        const product = s1AtHeight(state, candidate) * s2At(candidate);
        if (product > best) { best = product; z = candidate; }
      }
    }
    const s1 = s1AtHeight(state, z);
    const s2 = s2At(z);
    const group = groups.find(x => x.id === Number(state.group)) || groups[1];
    const vk = Number(state.v0) * s1 * s2 * group.factor;
    const q = .613 * vk * vk / 1000;
    const vkVedacao = Number(state.v0) * s1 * s2 * .92 * group.factor;
    const qVedacao = .613 * vkVedacao * vkVedacao / 1000;
    return {
      category, classIndex, cls: classIndex, b_m, b: b_m, fr, p, z, s1, s2, s3: group.factor,
      vk, q, qVedacao, group, geometry: g, direction,
    };
  }

  function balanceValue(openings, cpi) {
    return openings.reduce((sum, opening) => {
      const difference = opening.ce - cpi;
      return sum + opening.area * Math.sign(difference) * Math.sqrt(Math.abs(difference));
    }, 0);
  }

  function solveBalance(openings) {
    const active = openings.filter(x => Number(x.area) > 1e-9 && Number.isFinite(Number(x.ce)));
    if (!active.length) return null;
    const coefficients = active.map(x => Number(x.ce));
    let low = Math.min(...coefficients) - 10;
    let high = Math.max(...coefficients) + 10;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (balanceValue(active, mid) > 0) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  function solveBalanceScenarios(openingsByFace) {
    const scenarios = [[]];
    for (const opening of openingsByFace) {
      if (!(Number(opening.area) > 1e-9)) continue;
      const ces = [...new Set((opening.coefficients || []).map(Number).filter(Number.isFinite))];
      if (!ces.length) return null;
      const previous = scenarios.splice(0, scenarios.length);
      for (const scenario of previous) for (const ce of ces) scenarios.push([...scenario, { area: Number(opening.area), ce }]);
    }
    const roots = scenarios.map(solveBalance).filter(Number.isFinite);
    if (!roots.length) return null;
    return { roots, minimum: Math.min(...roots), maximum: Math.max(...roots) };
  }

  const api = { roughness, frByClass, groups, geometry, s1AtHeight, calculate, cpeBasis, cpeGable, cpeShed, cpeArch, normalWarnings, dominantOpening, dominantCpi, solveBalanceScenarios };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SteelHubWindEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
