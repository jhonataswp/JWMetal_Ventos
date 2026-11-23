/* ==========================================================================
   JW Metálica — core
   Estado, persistência, helpers, cálculo de vento, validação, inspetor e vista 3D.
   ========================================================================== */
(function (global) {
  "use strict";

  const JW = global.JW = global.JW || {};
  const engine = global.SteelHubWindEngine;
  const NB = global.NormaABNT;
  const { roughness, groups } = engine;

  const APP = {
    name: "JW Metálica",
    module: "Módulo Cálculo de Vento",
    norm: "ABNT NBR 6123:2023",
    version: "2.0.0",
    storageKey: "jw-metalica-wind-state",
    legacyKey: "steelhub-wind-state",
    schema: "jw-metalica.vjw",
  };

  const STEPS = [
    { key: "project", short: "Obra e cliente", title: "Dados da Obra e Cliente", icon: "building", description: "Identifique o empreendimento, o cliente e o responsável técnico que assinará o memorial." },
    { key: "location", short: "Localização", title: "Dados Gerais e Localização", icon: "map", description: "Localize a obra, selecione o município na base e confirme a velocidade básica V₀ pela isopleta." },
    { key: "factors", short: "Fatores S₁ · S₂ · S₃", title: "Fatores Topográficos, Rugosidade e Estatístico", icon: "wind", description: "Defina topografia, categoria do terreno, classe da edificação e grupo de utilização." },
    { key: "geometry", short: "Geometria", title: "Geometria da Edificação / Galpão", icon: "ruler", description: "Escolha a tipologia da cobertura e informe as dimensões que alimentam as tabelas normativas e a vista 3D." },
    { key: "coefficients", short: "Cpe · Cpi · Ca", title: "Coeficientes de Pressão e Forma", icon: "layers", description: "Revise as zonas de pressão externa, descreva as aberturas para o Cpi e consulte a força global Ca." },
    { key: "results", short: "Resultados", title: "Resultados e Combinações", icon: "chart", description: "Consulte pressões por zona, envoltórias de vento a 90° e 0° e gere o memorial descritivo." },
  ];

  const defaults = {
    project: "Edificação sem título",
    client: "", address: "", responsible: "", crea: "", date: "", code: "", revision: "R00", notes: "",
    fileName: "",
    city: "", uf: "", lat: "", lon: "", v0: 40, v0Table: false,
    roof: "gable", a: 30, b: 15, h: 6, alpha: 10, flecha: 0,
    topography: "plain", thetaT: 20, dt: 10, s1: 1,
    category: "III", manualClass: "",
    group: 3, cpi: 0, direction: 90, resultMode: "table", coefTab: "cpe",
    openingMode: "leak", estanque: false,
    faces: {
      long1: { permeability: "leak", area: 0 },
      long2: { permeability: "leak", area: 0 },
      end1: { permeability: "leak", area: 0 },
      end2: { permeability: "leak", area: 0 },
      roof: { permeability: "impermeable", area: 0 },
    },
    zones: [
      { id: "A", name: "Fachada barlavento", cpe: .7 },
      { id: "B", name: "Fachada sotavento", cpe: -.5 },
      { id: "C", name: "Empenas — 1º trecho", cpe: -.9 },
      { id: "D", name: "Empenas — demais trechos", cpe: -.5 },
      { id: "E", name: "Cobertura barlavento (EFI)", cpe: -1.2 },
      { id: "F", name: "Cobertura sotavento (GHJ)", cpe: -.4 },
    ],
    zoneCpeSource: "auto",
    zones0: [
      { id: "A", name: "Empena barlavento", cpe: null },
      { id: "B", name: "Empena sotavento", cpe: null },
      { id: "C", name: "Fachadas — 1º trecho", cpe: null },
      { id: "D", name: "Fachadas — até o meio", cpe: null },
      { id: "G", name: "Fachadas — metade de sotavento (A3/B3)", cpe: null },
      { id: "E", name: "Cobertura — 1º trecho", cpe: null },
      { id: "F", name: "Cobertura — até o meio", cpe: null },
      { id: "J", name: "Cobertura — metade de sotavento (I/J)", cpe: null },
    ],
    zoneCpeSource0: "auto",
    lengthUnit: "m",
    pressureUnit: "kN/m²",
    theme: "light",
    showNorm: true,
    modelYaw: -0.6,
  };

  function todayISO() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function defaultState() {
    const copy = structuredClone(defaults);
    copy.date = todayISO();
    return copy;
  }

  function migrateState(raw) {
    const saved = raw && typeof raw === "object" ? raw : {};
    const merged = { ...structuredClone(defaults), ...saved };
    merged.faces = structuredClone(defaults.faces);
    if (saved.faces) {
      Object.keys(defaults.faces).forEach(key => {
        merged.faces[key] = { ...defaults.faces[key], ...(saved.faces[key] || {}) };
      });
    }
    if (saved.roof === "Duas águas") merged.roof = "gable";
    if (saved.roof === "Uma água") merged.roof = "shed";
    if (saved.roof === "Abóbada") merged.roof = "arch";
    if (saved.topography === "manual") merged.topography = "slope";
    if (!["gable", "shed", "arch"].includes(merged.roof)) merged.roof = "gable";
    if (!["plain", "slope", "valley"].includes(merged.topography)) merged.topography = "plain";

    const oldPlaceholderZones = Array.isArray(saved.zones) && saved.zones.length === 5 &&
      saved.zones[0]?.name === "Parede — barlavento" && saved.zones[2]?.name === "Parede lateral" &&
      Math.abs(Number(saved.zones[0]?.cpe) - .8) < 1e-9 && Math.abs(Number(saved.zones[2]?.cpe) + .7) < 1e-9;
    if (oldPlaceholderZones) {
      merged.zones = structuredClone(defaults.zones);
      merged.zoneCpeSource = "reference-example";
    } else if (Array.isArray(saved.zones) && !saved.zoneCpeSource) {
      merged.zoneCpeSource = "manual";
    }
    merged.zones0 = Array.isArray(saved.zones0) && saved.zones0.length === 8
      ? saved.zones0 : structuredClone(defaults.zones0);
    if (!Array.isArray(merged.zones) || merged.zones.length === 0) merged.zones = structuredClone(defaults.zones);

    if (engine.geometry(merged).roof === "gable") {
      const sameCoefficients = (existing, calculated) => Array.isArray(existing) && existing.length === calculated.length &&
        existing.every((zone, i) => zone.cpe != null && Math.abs(Number(zone.cpe) - calculated[i].cpe) < 1e-6);
      const matchesLegacyPreset = (existing, geometryKeys, presets) => {
        const g = engine.geometry(merged);
        const geometryValues = [g.a, g.b, g.h, g.alpha];
        return geometryKeys.some(keys => geometryValues.every((value, i) => Math.abs(value - keys[i]) < 1e-6)) &&
          presets.some(values => Array.isArray(existing) && existing.length === values.length &&
            existing.every((zone, i) => zone.cpe != null && Math.abs(Number(zone.cpe) - values[i]) < 1e-6));
      };
      const auto90 = engine.cpeGable(merged, 90);
      const auto0 = engine.cpeGable(merged, 0);
      const knownGableGeometries = [[30, 15, 6, 10], [35, 12, 6, 12], [30, 12, 5, 12]];
      const legacyCpe90Presets = [
        [.7, -.5, -.9, -.5, -1.2, -.4],
        [.7, -.5, -.9, -.5, -1.122, -.4],
        [.7, -.5, -.9, -.5, -1.1, -.4],
      ];
      const legacyCpe0Presets = [[.7, -.3, -.8, -.4, -.2, -.8, -.6, -.2]];
      if (sameCoefficients(merged.zones, auto90) ||
        (merged.zoneCpeSource === "manual" && matchesLegacyPreset(merged.zones, knownGableGeometries, legacyCpe90Presets))) {
        merged.zones = auto90;
        merged.zoneCpeSource = "auto";
      }
      if (sameCoefficients(merged.zones0, auto0) ||
        (merged.zoneCpeSource0 === "manual" && matchesLegacyPreset(merged.zones0, knownGableGeometries, legacyCpe0Presets))) {
        merged.zones0 = auto0;
        merged.zoneCpeSource0 = "auto";
      }
      if (["reference-example", "video-example", "screen-example", "invalidated", "unset"].includes(merged.zoneCpeSource)) merged.zoneCpeSource = "auto";
      if (["reference-example", "video-example", "screen-example", "invalidated", "unset"].includes(merged.zoneCpeSource0)) merged.zoneCpeSource0 = "auto";
    }

    merged.lengthUnit = ["m", "cm", "mm"].includes(merged.lengthUnit) ? merged.lengthUnit : "m";
    merged.pressureUnit = ["kN/m²", "kgf/m²", "N/m²"].includes(merged.pressureUnit) ? merged.pressureUnit : "kN/m²";
    merged.theme = merged.theme === "dark" ? "dark" : "light";
    merged.showNorm = merged.showNorm !== false;
    merged.coefTab = ["cpe", "cpi", "ca"].includes(merged.coefTab) ? merged.coefTab : "cpe";
    merged.resultMode = ["table", "map", "local", "combinations"].includes(merged.resultMode) ? merged.resultMode : "table";
    merged.date = merged.date || todayISO();
    merged.revision = merged.revision || "R00";
    merged.fileName = merged.fileName || "";
    merged.notes = merged.notes || "";
    return merged;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(APP.storageKey) || localStorage.getItem(APP.legacyKey) || "{}";
      return migrateState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  let currentStep = 0;
  let municipalities = [];
  let cityLoadMessage = "Carregando base local de municípios…";
  let toastTimer;
  let modelYaw = Number.isFinite(Number(state.modelYaw)) ? Number(state.modelYaw) : -0.6;
  let modelDragX = null;

  function replaceState(next) {
    const normalized = migrateState(next);
    Object.keys(state).forEach(key => { delete state[key]; });
    Object.assign(state, normalized);
    modelYaw = Number.isFinite(Number(state.modelYaw)) ? Number(state.modelYaw) : -0.6;
  }

  const byId = id => document.getElementById(id);
  const fmt = (n, d = 2) => {
    if (n === null || n === undefined || n === "" || !Number.isFinite(Number(n))) return "—";
    const value = Object.is(Number(n), -0) ? 0 : Number(n);
    return value.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const numericValue = n => n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "" : String(Number(n));
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const slug = text => String(text || "projeto").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 64) || "projeto";

  function icon(name, className = "") {
    return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }
  function tip(text) {
    return `<button type="button" class="tip" data-tip="${escapeHtml(text)}" aria-label="Ajuda: ${escapeHtml(text)}">?</button>`;
  }
  function field(label, key, value, unit = "", hint = "", options = {}) {
    const type = options.type || "number";
    const attrs = [];
    if (type === "number") {
      if (options.min !== undefined) attrs.push(`min="${options.min}"`);
      if (options.max !== undefined) attrs.push(`max="${options.max}"`);
      attrs.push(`step="${options.step !== undefined ? options.step : "any"}"`);
    }
    if (options.placeholder) attrs.push(`placeholder="${escapeHtml(options.placeholder)}"`);
    if (options.validate) attrs.push(`data-validate="${escapeHtml(options.validate)}"`);
    if (options.list) attrs.push(`list="${escapeHtml(options.list)}"`);
    if (options.disabled) attrs.push("disabled");
    if (options.readonly) attrs.push("readonly");
    if (options.autocomplete) attrs.push(`autocomplete="${escapeHtml(options.autocomplete)}"`);
    const cls = [unit ? "with-unit" : "", options.className || ""].filter(Boolean).join(" ");
    return `<div class="field" data-field-key="${escapeHtml(key)}">
      <label for="${escapeHtml(key)}"><span>${label}${options.tip ? tip(options.tip) : ""}</span>${options.badge ? `<small>${options.badge}</small>` : ""}</label>
      <div class="control-wrap"><input id="${escapeHtml(key)}" class="${cls}" type="${type}" value="${escapeHtml(value)}" ${attrs.join(" ")}>
      ${unit ? `<span class="unit">${unit}</span>` : ""}</div>
      ${hint ? `<div class="hint">${hint}</div>` : ""}
      <div class="field-error" data-error-for="${escapeHtml(options.validate || key)}"></div>
    </div>`;
  }
  function selectField(label, key, value, options, hint = "", extra = {}) {
    return `<div class="field" data-field-key="${escapeHtml(key)}">
      <label for="${escapeHtml(key)}"><span>${label}${extra.tip ? tip(extra.tip) : ""}</span>${extra.badge ? `<small>${extra.badge}</small>` : ""}</label>
      <div class="control-wrap"><select id="${escapeHtml(key)}"${extra.validate ? ` data-validate="${escapeHtml(extra.validate)}"` : ""}>
        ${options.map(o => `<option value="${escapeHtml(o.value)}" ${String(value) === String(o.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
      </select></div>${hint ? `<div class="hint">${hint}</div>` : ""}
      <div class="field-error" data-error-for="${escapeHtml(extra.validate || key)}"></div>
    </div>`;
  }
  function textareaField(label, key, value, hint = "") {
    return `<div class="field" data-field-key="${escapeHtml(key)}">
      <label for="${escapeHtml(key)}">${label}</label>
      <textarea id="${escapeHtml(key)}" placeholder="${escapeHtml(hint)}">${escapeHtml(value)}</textarea>
    </div>`;
  }
  function sectionCard(iconName, title, subtitle, body, options = {}) {
    return `<article class="card ${options.className || ""}">
      <div class="card-head"><div class="card-icon">${icon(iconName)}</div><div><h2>${title}</h2><p>${subtitle}</p></div></div>
      <div class="card-body ${options.tight ? "tight" : ""}">${body}</div>
    </article>`;
  }
  function metricCard(label, value, unit = "", tone = "") {
    return `<div class="metric-card ${tone}"><span>${label}</span><strong>${value}${unit ? ` <em>${unit}</em>` : ""}</strong></div>`;
  }
  function row(label, value) {
    return `<div class="inspector-row"><span>${label}</span><b>${value}</b></div>`;
  }

  function notify(message, type = "") {
    const el = byId("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 3200);
  }

  function persistState() {
    try { localStorage.setItem(APP.storageKey, JSON.stringify(state)); } catch { /* armazenamento indisponível */ }
  }

  const lengthFactors = { m: 1, cm: 100, mm: 1000 };
  function displayLength(value) { return Number(value) * (lengthFactors[state.lengthUnit || "m"] || 1); }
  function toMeters(value) { return Number(value) / (lengthFactors[state.lengthUnit || "m"] || 1); }
  function pressureUnit() { return state.pressureUnit || "kN/m²"; }
  function pressureValue(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    const unit = pressureUnit();
    if (unit === "kgf/m²") return fmt(Number(value) * 101.97162, 1);
    if (unit === "N/m²") return fmt(Number(value) * 1000, 0);
    return fmt(Number(value), 3);
  }
  function displayPressure(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return `${pressureValue(value)} ${pressureUnit()}`;
  }

  /* ------------------------------------------------------------------------
     Cálculo — mantido do motor original
     ------------------------------------------------------------------------ */
  function geometry() { return engine.geometry(state); }
  function activeDirection() { return Number(state.direction) === 0 ? 0 : 90; }
  function windResult(direction = activeDirection()) { return engine.calculate(state, direction); }
  function roofLabel() {
    return ({ gable: "Duas águas", shed: "Uma água (shed)", arch: "Arco (abóbada)" })[geometry().roof] || "Duas águas";
  }
  function surfaceAreas() {
    const g = geometry();
    let endRoofArea = g.roof === "gable" || g.roof === "shed" ? g.b * g.rise / 2 : 0;
    const slopedLength = Math.hypot(g.b / 2, g.rise);
    let roofArea = 2 * g.a * slopedLength;
    if (g.roof === "shed") roofArea = g.a * Math.hypot(g.b, g.rise);
    if (g.roof === "arch" && g.rise > 0) {
      const radius = g.b * g.b / (8 * g.rise) + g.rise / 2;
      const arcAngle = 2 * Math.asin(Math.min(1, g.b / (2 * radius)));
      roofArea = g.a * radius * arcAngle;
      endRoofArea = radius * radius * (arcAngle - Math.sin(arcAngle)) / 2;
    }
    return {
      long1: g.a * g.h,
      long2: g.a * g.h,
      end1: g.b * g.h + endRoofArea,
      end2: g.b * g.h + endRoofArea,
      roof: roofArea,
    };
  }
  function openingArea(id, areas) {
    const face = state.faces[id] || defaults.faces[id];
    if (id === "roof") return face.permeability === "permeable" ? areas.roof : 0;
    if (face.permeability === "open") return areas[id] || 0;
    if (face.permeability === "leak") return Math.max(0, Number(face.area) || 0);
    return 0;
  }
  function cpiBalanceCase(direction, windwardFace, areas) {
    let ce;
    if (direction === 90) {
      const coefficients = zonesFor(90).map(zone => zone?.cpe == null ? NaN : Number(zone.cpe));
      if (coefficients.length < 6 || coefficients.some(value => !Number.isFinite(value))) return null;
      const long1Windward = windwardFace === "long1";
      ce = {
        long1: [long1Windward ? coefficients[0] : coefficients[1]],
        long2: [long1Windward ? coefficients[1] : coefficients[0]],
        end1: [coefficients[2], coefficients[3]],
        end2: [coefficients[2], coefficients[3]],
        roof: coefficients.slice(4),
      };
    } else {
      const coefficients = zonesFor(0).map(zone => zone?.cpe == null ? NaN : Number(zone.cpe));
      if (coefficients.length < 8 || coefficients.some(value => !Number.isFinite(value))) return null;
      const end1Windward = windwardFace === "end1";
      const cpeLong = [coefficients[2], coefficients[3], coefficients[4]];
      ce = {
        long1: cpeLong,
        long2: cpeLong,
        end1: [end1Windward ? coefficients[0] : coefficients[1]],
        end2: [end1Windward ? coefficients[1] : coefficients[0]],
        roof: coefficients.slice(5),
      };
    }
    const openings = ["long1", "long2", "end1", "end2", "roof"]
      .map(id => ({ area: openingArea(id, areas), coefficients: ce[id] || [] }))
      .filter(item => item.area > 1e-9);
    if (!openings.length || openings.some(item => !item.coefficients.length)) return null;
    return engine.solveBalanceScenarios(openings);
  }
  function cpiResult(direction = activeDirection()) {
    const faces = state.faces || defaults.faces;
    const walls = ["long1", "long2", "end1", "end2"].map(id => faces[id] || defaults.faces[id]);
    const openCount = walls.filter(face => face.permeability === "open").length;
    const areas = surfaceAreas();
    const allWallsImpermeable = walls.every(face => face.permeability === "impermeable") && faces.roof?.permeability !== "permeable";
    const simpleCase = (candidates, clause, description) => {
      const cases = direction === 90
        ? ["90° sobre a fachada F1", "90° sobre a fachada F2"]
        : ["0° sobre a empena E1", "0° sobre a empena E2"];
      return {
        automatic: true, candidates, selected: Math.max(...candidates), clause, description,
        cases: cases.map(name => ({ name, candidates, selected: Math.max(...candidates), clause, description })),
      };
    };
    if (state.estanque || allWallsImpermeable) {
      return simpleCase([-.2, 0], "6.3.2.2", "Edificação efetivamente estanque; considerar o mais nocivo entre −0,2 e 0.");
    }
    const wallIds = ["long1", "long2", "end1", "end2"];
    const leakageRatios = walls.map((face, i) => {
      if (face.permeability === "open") return 1;
      if (face.permeability === "impermeable") return 0;
      return areas[wallIds[i]] > 0 ? Number(face.area || 0) / areas[wallIds[i]] : 0;
    });
    const equalLeakage = walls.every(face => face.permeability !== "impermeable") &&
      leakageRatios.every(ratio => Math.abs(ratio - leakageRatios[0]) < 1e-6);
    const effective = {
      long1: openingArea("long1", areas), long2: openingArea("long2", areas),
      end1: openingArea("end1", areas), end2: openingArea("end2", areas), roof: openingArea("roof", areas),
    };
    const dominant = engine.dominantOpening(effective);
    const incidenceName = windward => direction === 90
      ? `90° sobre a fachada ${windward === "long1" ? "F1" : "F2"}`
      : `0° sobre a empena ${windward === "end1" ? "E1" : "E2"}`;
    if (dominant) {
      const incidences = direction === 90 ? [["long1", "long2"], ["long2", "long1"]] : [["end1", "end2"], ["end2", "end1"]];
      const parallelFaces = direction === 90 ? ["end1", "end2"] : ["long1", "long2"];
      const zones = zonesFor(direction);
      const leewardCpe = Number(zones[1]?.cpe);
      const restCpe = Number(zones[3]?.cpe);
      const domCases = incidences.map(([windward, leeward]) => {
        let values = null, description = "";
        if (dominant.face === windward) {
          values = [engine.dominantCpi("barlavento", dominant.ratio)];
          description = "Abertura dominante na face de barlavento; Cpi pela proporção de aberturas (6.3.2.1-c).";
        } else if (dominant.face === leeward && Number.isFinite(leewardCpe)) {
          values = [leewardCpe];
          description = "Abertura dominante na face de sotavento; adota-se o Ce desta face (6.3.2.1-c).";
        } else if (dominant.face === "roof") {
          values = [engine.dominantCpi("suction", dominant.ratio)];
          description = "Abertura dominante na cobertura, em zona de alta sucção; Cpi pela tabela 6.3.2.1-c.";
        } else if (parallelFaces.includes(dominant.face) && Number.isFinite(restCpe)) {
          values = [engine.dominantCpi("suction", dominant.ratio), restCpe];
          description = "Abertura dominante em face paralela ao vento; posição não informada: avaliada na zona de alta sucção e fora dela (6.3.2.1-c).";
        }
        return values == null ? null : { name: incidenceName(windward), candidates: values, selected: Math.max(...values), clause: "6.3.2.1-c", description };
      });
      if (domCases.every(Boolean)) {
        const all = domCases.flatMap(item => item.candidates);
        return { automatic: true, candidates: [Math.min(...all), Math.max(...all)], selected: Math.max(...all), clause: "6.3.2.1-c", ratio: dominant.ratio, description: "Abertura dominante; Cpi pela proporção entre aberturas.", cases: domCases };
      }
    }
    const pairPermeable = (pair, others) => pair.every(id => faces[id].permeability !== "impermeable") &&
      Math.abs(leakageRatios[wallIds.indexOf(pair[0])] - leakageRatios[wallIds.indexOf(pair[1])]) < 1e-6 &&
      others.every(id => faces[id].permeability === "impermeable") && effective.roof <= 1e-9;
    const oppositePair = pairPermeable(["long1", "long2"], ["end1", "end2"]) ? ["long1", "long2"]
      : pairPermeable(["end1", "end2"], ["long1", "long2"]) ? ["end1", "end2"] : null;
    if (!dominant && oppositePair) {
      const windward = direction === 90 ? ["long1", "long2"] : ["end1", "end2"];
      const pairCases = windward.map(face => {
        const value = faces[face].permeability !== "impermeable" ? .2 : -.3;
        return {
          name: incidenceName(face), candidates: [value], selected: value, clause: "6.3.2.1-a",
          description: value > 0 ? "Duas faces opostas igualmente permeáveis; vento perpendicular a uma face permeável." : "Duas faces opostas igualmente permeáveis; vento perpendicular a uma face impermeável.",
        };
      });
      const values = pairCases.flatMap(item => item.candidates);
      return { automatic: true, candidates: [Math.min(...values), Math.max(...values)], selected: Math.max(...values), clause: "6.3.2.1-a", description: "Duas faces opostas igualmente permeáveis; as demais impermeáveis.", cases: pairCases };
    }
    if (equalLeakage && (faces.roof?.permeability || "impermeable") === "impermeable") {
      return simpleCase([-.3, 0], "6.3.2.1-b", "Quatro faces igualmente permeáveis; considerar o caso mais nocivo por zona.");
    }
    const windwardFaces = direction === 90 ? ["long1", "long2"] : ["end1", "end2"];
    const cases = dominant ? [] : windwardFaces.map(face => {
      const result = cpiBalanceCase(direction, face, areas);
      if (!result) return null;
      return {
        name: direction === 90 ? `90° sobre a fachada ${face === "long1" ? "F1" : "F2"}` : `0° sobre a empena ${face === "end1" ? "E1" : "E2"}`,
        candidates: [result.minimum, result.maximum],
        selected: result.maximum,
        clause: "6.3.3",
        description: "Balanço de vazão resolvido para as aberturas; posição não informada, avaliados os trechos possíveis.",
      };
    });
    if (cases.length && cases.every(Boolean)) {
      const candidates = [Math.min(...cases.map(item => Math.min(...item.candidates))), Math.max(...cases.map(item => Math.max(...item.candidates)))];
      return { automatic: true, candidates, selected: candidates[1], clause: "6.3.3", description: "Arranjo fora das alíneas a) e b); balanço de vazão resolvido.", cases };
    }
    const selected = Number(state.cpi) || 0;
    return {
      automatic: false, candidates: [selected], selected, clause: "Verificação manual",
      description: "Não foi possível resolver automaticamente este arranjo com os coeficientes disponíveis; confira o balanço de permeabilidade da NBR 6123.",
      cases: windwardFaces.map(face => ({
        name: direction === 90 ? `90° sobre a fachada ${face === "long1" ? "F1" : "F2"}` : `0° sobre a empena ${face === "end1" ? "E1" : "E2"}`,
        candidates: [selected], selected, clause: "Verificação manual",
        description: "Informe Cpi após verificar a seção 6.3.3.",
      })),
    };
  }
  function unavailableCpeZones(direction, roof) {
    const names = direction === 90
      ? ["Parede barlavento", "Parede sotavento", `${roof === "shed" ? "Cobertura uma água" : "Cobertura curva"} — zona 1`, `${roof === "shed" ? "Cobertura uma água" : "Cobertura curva"} — zona 2`]
      : ["Superfície barlavento", "Superfície sotavento", "Superfície paralela — zona 1", "Superfície paralela — zona 2"];
    return names.map((name, i) => ({ id: String.fromCharCode(65 + i), name, cpe: null }));
  }
  function autoZones(direction) {
    const roof = geometry().roof;
    if (roof === "gable") return { zones: engine.cpeGable(state, direction), source: "auto" };
    if (roof === "shed") return { zones: engine.cpeShed(state, direction), source: "auto" };
    if (roof === "arch") {
      const zones = engine.cpeArch(state, direction);
      return zones ? { zones, source: "auto" } : { zones: unavailableCpeZones(direction, roof), source: "unavailable" };
    }
    return null;
  }
  function zonesFor(direction = activeDirection()) {
    const key = direction === 90 ? "zoneCpeSource" : "zoneCpeSource0";
    const fieldName = direction === 90 ? "zones" : "zones0";
    if (state[key] !== "manual") {
      const auto = autoZones(direction);
      if (auto) {
        state[fieldName] = auto.zones;
        state[key] = auto.source;
      }
    }
    if (!Array.isArray(state[fieldName]) || state[fieldName].length === 0) {
      state[fieldName] = structuredClone(direction === 90 ? defaults.zones : defaults.zones0);
    }
    return state[fieldName];
  }
  function cpeNote(dir) {
    const roof = geometry().roof;
    const source = dir === 90 ? state.zoneCpeSource : state.zoneCpeSource0;
    if (source === "manual") return "Cpe informado manualmente. Registre a tabela, geometria e direção usadas para a verificação.";
    if (source === "unavailable") return roof === "arch"
      ? "Geometria fora da faixa dos ensaios das Tabelas 18 a 20: confira o Cpe do modelo extrapolado."
      : "Tipologia sem tabela automática: informe coeficientes verificados.";
    if (roof === "gable") return "Cpe de duas águas: Tabelas 6 e 7, interpoladas por a/b, h/b e θ.";
    if (roof === "shed") return "Cpe de uma água: paredes pela Tabela 6; cobertura pela Tabela 8 (em 90°, H e L usam a envoltória ±90°/±45°).";
    if (roof === "arch") return dir === 90
      ? "Cpe de abóbada, vento perpendicular à geratriz: paredes pela Tabela 6 e cobertura pelo modelo de ensaio mais próximo (Tabelas 18 a 20), em 6 partes."
      : "Cpe de abóbada, vento paralelo à geratriz: paredes pela Tabela 6 e cobertura em 4 regiões do mesmo modelo (Tabelas 18 a 20). Verifique a força de atrito quando aplicável (6.1.5).";
    return "";
  }
  function normativeWarnings() {
    const areas = surfaceAreas();
    const warnings = [...engine.normalWarnings(state)];
    ["long1", "long2", "end1", "end2", "roof"].forEach(id => {
      const ratio = areas[id] > 0 ? openingArea(id, areas) / areas[id] : 0;
      if (ratio > .3) warnings.push(`Permeabilidade acima de 30 % na ${id === "roof" ? "cobertura" : "face " + id} (6.3.1): a aplicação de 6.3.2 e 6.3.3 exige índice de até 30 %, salvo abertura dominante.`);
    });
    return warnings;
  }
  function warningBox(list) {
    if (!list.length) return "";
    return `<div class="info-box warn"><span class="info-symbol">!</span><span>${list.map(escapeHtml).join("<br>")}</span></div>`;
  }

  /* ------------------------------------------------------------------------
     Validação amigável
     ------------------------------------------------------------------------ */
  function collectValidation() {
    const issues = {};
    const g = geometry();
    if (!String(state.project || "").trim()) issues.project = "Informe o nome da obra para o cabeçalho do memorial.";
    if (!(Number(state.v0) > 0)) issues.v0 = "V₀ deve ser maior que zero.";
    else if (Number(state.v0) > 100) issues.v0 = "V₀ acima de 100 m/s: confira a isopleta da Figura 1.";
    if (!(Number(state.a) > 0)) issues.a = "O comprimento a deve ser maior que zero.";
    if (!(Number(state.b) > 0)) issues.b = "O vão b deve ser maior que zero.";
    if (!(Number(state.h) >= 0)) issues.h = "O pé-direito H não pode ser negativo.";
    const alphaLimit = g.roof === "shed" ? 30 : 60;
    if (g.roof === "arch") {
      if (Number(state.flecha) < 0 || Number(state.flecha) > g.b / 2 + 1e-9) {
        issues.flecha = `A flecha deve estar entre 0 e b/2 (${fmt(displayLength(g.b / 2), 2)} ${state.lengthUnit || "m"}).`;
      }
    } else if (Number(state.alpha) < 0 || Number(state.alpha) > alphaLimit) {
      issues.alpha = `A inclinação deve estar entre 0° e ${alphaLimit}°.`;
    }
    if (state.topography === "slope") {
      if (Number(state.thetaT) < 0 || Number(state.thetaT) > 60) issues.thetaT = "θt deve estar entre 0° e 60°.";
      if (!(Number(state.dt) > 0)) issues.dt = "Informe a dimensão topográfica d maior que zero.";
    }
    if (state.cpi !== null && state.cpi !== "" && (Number(state.cpi) < -2 || Number(state.cpi) > 2)) {
      issues.cpi = "Cpi deve estar entre −2 e +2.";
    }
    const areas = surfaceAreas();
    ["long1", "long2", "end1", "end2", "roof"].forEach(id => {
      const face = state.faces[id];
      const area = Number(face.area) || 0;
      if (area < 0) issues[`area-${id}`] = "A área de abertura não pode ser negativa.";
      else if (face.permeability === "leak" && areas[id] > 0 && area > areas[id] + 1e-6) {
        issues[`area-${id}`] = `A área de abertura (${fmt(area, 1)} m²) supera a área da face (${fmt(areas[id], 1)} m²).`;
      }
    });
    if (!String(state.date || "").trim()) issues.date = "Informe a data do projeto.";
    return issues;
  }
  function applyValidation() {
    const issues = collectValidation();
    document.querySelectorAll("[data-validate]").forEach(el => {
      const key = el.dataset.validate;
      const issue = issues[key];
      el.classList.toggle("is-invalid", Boolean(issue));
      if (issue) el.setAttribute("title", issue); else el.removeAttribute("title");
      el.setAttribute("aria-invalid", issue ? "true" : "false");
    });
    document.querySelectorAll("[data-error-for]").forEach(el => {
      el.textContent = issues[el.dataset.errorFor] || "";
    });
    return issues;
  }

  /* ------------------------------------------------------------------------
     Navegação / progresso
     ------------------------------------------------------------------------ */
  function stepCompletion(index) {
    const g = geometry();
    const issues = collectValidation();
    if (index === 0) return Boolean(String(state.project || "").trim()) && !issues.project && !issues.date;
    if (index === 1) return Boolean(String(state.city || "").trim()) && Number(state.v0) > 0 && !issues.v0;
    if (index === 2) {
      const r = windResult();
      return [r.s1, r.s2, r.s3].every(Number.isFinite) && r.s2 > 0 && !issues.thetaT && !issues.dt;
    }
    if (index === 3) return g.a > 0 && g.b > 0 && Number(state.h) >= 0 && !issues.a && !issues.b && !issues.h && !issues.alpha && !issues.flecha;
    if (index === 4) {
      const areaIssues = Object.keys(issues).some(key => key.startsWith("area-") || key === "cpi");
      return !areaIssues &&
        zonesFor(90).every(zone => zone.cpe != null && Number.isFinite(Number(zone.cpe))) &&
        zonesFor(0).every(zone => zone.cpe != null && Number.isFinite(Number(zone.cpe)));
    }
    if (index === 5) return [0, 1, 2, 3, 4].every(stepCompletion);
    return false;
  }
  function stepHasIssue(index) {
    const issues = collectValidation();
    if (index === 4) return Object.keys(issues).some(key => key.startsWith("area-") || key === "cpi");
    const map = { 0: ["project", "date"], 1: ["v0"], 2: ["thetaT", "dt"], 3: ["a", "b", "h", "alpha", "flecha"], 5: [] };
    return (map[index] || []).some(key => issues[key]);
  }
  function summaryForStep(index) {
    const g = geometry();
    const unit = state.lengthUnit || "m";
    if (index === 0) return state.client || "Cliente não informado";
    if (index === 1) return state.city ? `${state.city}${state.uf ? ` — ${state.uf}` : ""} · V₀ ${fmt(state.v0, 1)} m/s` : "Selecione o município e V₀";
    if (index === 2) {
      const r = windResult();
      return `S₁ ${fmt(r.s1, 3)} · S₂ ${fmt(r.s2, 3)} · S₃ ${fmt(r.s3, 2)}`;
    }
    if (index === 3) return `${roofLabel()} · b ${fmt(displayLength(g.b), 1)} × a ${fmt(displayLength(g.a), 1)} ${unit}`;
    if (index === 4) {
      const cpi = cpiResult(90);
      return `Cpi ${cpi.selected == null ? "—" : fmt(cpi.selected, 2)} · ${zonesFor(90).length} zonas`;
    }
    if (index === 5) {
      const r = windResult();
      return `Vk ${fmt(r.vk, 1)} m/s · q ${displayPressure(r.q)}`;
    }
    return "";
  }
  function renderNav() {
    const nav = byId("step-nav");
    if (!nav) return;
    nav.innerHTML = STEPS.map((step, i) => {
      const done = stepCompletion(i);
      const warn = !done && stepHasIssue(i);
      return `<button type="button" class="step-link ${i === currentStep ? "active" : ""} ${done ? "done" : ""} ${warn ? "warn" : ""}" data-step="${i}" ${i === currentStep ? 'aria-current="step"' : ""}>
        <span class="step-number">${done ? icon("check") : String(i + 1).padStart(2, "0")}</span>
        <span class="step-copy"><strong>${step.title}</strong><small data-step-summary="${i}">${escapeHtml(summaryForStep(i))}</small></span>
        <span class="step-flag">${warn ? icon("alert") : ""}</span>
      </button>`;
    }).join("");
    nav.querySelectorAll(".step-link").forEach(el => {
      el.addEventListener("click", () => goToStep(Number(el.dataset.step)));
    });
  }
  function updateNavProgress() {
    const done = STEPS.map((_, i) => stepCompletion(i));
    const count = done.filter(Boolean).length;
    const percent = Math.round(count / STEPS.length * 100);
    const title = byId("progress-title");
    const percentEl = byId("progress-percent");
    const bar = byId("progress-bar");
    if (title) title.textContent = `${count} de ${STEPS.length} etapas completas`;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
    document.querySelectorAll(".step-link").forEach(el => {
      const i = Number(el.dataset.step);
      el.classList.toggle("done", done[i]);
      const warn = !done[i] && stepHasIssue(i);
      el.classList.toggle("warn", warn);
      const summary = el.querySelector("[data-step-summary]");
      if (summary) summary.textContent = summaryForStep(i);
      const flag = el.querySelector(".step-flag");
      if (flag) flag.innerHTML = warn ? icon("alert") : "";
    });
  }
  function goToStep(index) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
    if (JW.closeDrawers) JW.closeDrawers();
    if (JW.render) JW.render();
    const main = byId("main-area");
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------------
     Chrome / status / inspetor
     ------------------------------------------------------------------------ */
  function currentFileName() {
    if (state.fileName) return state.fileName;
    return `${slug(state.project || "projeto")}${state.revision ? `-${slug(state.revision)}` : ""}.vjw`;
  }
  function updateHeader() {
    const projectName = state.project || "Edificação sem título";
    if (byId("project-name")) byId("project-name").textContent = projectName;
    if (byId("project-card-name")) byId("project-card-name").textContent = projectName;
    if (byId("project-card-client")) byId("project-card-client").textContent = state.client || "Cliente não informado";
    if (byId("project-code")) byId("project-code").textContent = state.code ? `${state.code} · ${state.revision || "R00"}` : (state.revision || "R00");
    if (byId("status-file")) byId("status-file").textContent = currentFileName();
    document.title = `${projectName} — ${APP.name} · ${APP.module}`;
  }
  function updateStatusBar() {
    const warnings = normativeWarnings();
    const issues = collectValidation();
    const issueCount = Object.keys(issues).length;
    const warnEl = byId("status-warnings");
    if (warnEl) {
      warnEl.textContent = warnings.length ? `${warnings.length} aviso${warnings.length > 1 ? "s" : ""} normativo${warnings.length > 1 ? "s" : ""}` : "Sem avisos normativos";
      warnEl.classList.toggle("status-warn", warnings.length > 0);
      warnEl.title = warnings.join("\n");
    }
    if (byId("status-text")) byId("status-text").textContent = issueCount ? `Cálculo atualizado · ${issueCount} campo${issueCount > 1 ? "s" : ""} a revisar` : "Cálculo atualizado";
    if (byId("status-file")) byId("status-file").textContent = currentFileName();
  }
  function updateUnitButtons() {
    document.querySelectorAll("[data-unit-kind]").forEach(button => {
      const active = button.dataset.unitKind === "length" ? (state.lengthUnit || "m") : (state.pressureUnit || "kN/m²");
      button.classList.toggle("selected", button.dataset.unitValue === active);
    });
  }
  function updateThemeButton() {
    const button = byId("theme-toggle");
    if (!button) return;
    const dark = state.theme === "dark";
    button.title = dark ? "Ativar tema claro" : "Ativar tema escuro";
    button.setAttribute("aria-label", button.title);
  }
  function applyTheme() {
    document.body.dataset.theme = state.theme === "dark" ? "dark" : "light";
    updateThemeButton();
  }
  function updateInspector() {
    const host = byId("inspector-body");
    if (!host) return;
    const scroll = host.scrollTop;
    const r = windResult();
    const dir = activeDirection();
    const zones = zonesFor(dir);
    const cpi = cpiResult(dir);
    const warnings = normativeWarnings();
    const issues = collectValidation();
    const issueList = Object.values(issues);
    const suctionValues = zones
      .filter(zone => zone.cpe != null && Number.isFinite(Number(zone.cpe)))
      .map(zone => Math.min(...cpi.candidates.map(value => Number(zone.cpe) - value)) * r.q)
      .filter(value => value < 0);
    const suctionMax = suctionValues.length ? Math.min(...suctionValues) : null;
    const zoneRows = zones.map(zone => {
      const cpe = zone.cpe == null ? null : Number(zone.cpe);
      if (cpe == null || !Number.isFinite(cpe)) {
        return `<tr><td><span class="zone-badge neutral">${escapeHtml(zone.id || "?")}</span></td><td>—</td><td>—</td><td>—</td></tr>`;
      }
      const cps = cpi.candidates.map(value => cpe - value);
      const suction = Math.min(...cps) * r.q;
      const over = Math.max(...cps) * r.q;
      return `<tr><td><span class="zone-badge ${suction < 0 ? "suction" : "pressure"}">${escapeHtml(zone.id || "?")}</span></td><td>${fmt(cpe, 2)}</td><td>${fmt(pressureValue(suction), 2)}</td><td>${fmt(pressureValue(over), 2)}</td></tr>`;
    }).join("");
    const warningHtml = warnings.length
      ? `<ul class="inspector-warning-list">${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<div class="inspector-ok">${icon("check")} Sem avisos normativos</div>`;
    const issueHtml = issueList.length
      ? `<div class="inspector-warning-list" style="padding-left:10px;color:var(--red)">${issueList.slice(0, 4).map(item => `<div>• ${escapeHtml(item)}</div>`).join("")}</div>`
      : "";
    host.innerHTML = `
      <div class="inspector-hero">
        <span>Pressão dinâmica · q</span>
        <strong>${displayPressure(r.q)}</strong>
        <small>Vk = ${fmt(r.vk, 2)} m/s · vento a ${dir}°</small>
      </div>
      <div class="inspector-grid">
        <div class="inspector-metric"><span>S₁ topografia</span><strong>${fmt(r.s1, 3)}</strong></div>
        <div class="inspector-metric"><span>S₂ rugosidade</span><strong>${fmt(r.s2, 3)}</strong></div>
        <div class="inspector-metric"><span>S₃ grupo</span><strong>${fmt(r.s3, 2)}</strong></div>
        <div class="inspector-metric"><span>Cpi adotado</span><strong>${cpi.selected == null ? "—" : fmt(cpi.selected, 2)}</strong></div>
      </div>
      <div class="inspector-block">
        <h3>Parâmetros de vento</h3>
        <div class="inspector-rows">
          ${row("Categoria", escapeHtml(r.category.name))}
          ${row("Classe", `${["A", "B", "C"][r.cls]} · z ${fmt(displayLength(r.z), 2)} ${state.lengthUnit || "m"}`)}
          ${row("Grupo", `${escapeHtml(r.group.name)} · Tp ${r.group.returnPeriod} anos`)}
          ${row("Pressão p/ vedações", displayPressure(r.qVedacao))}
          ${row("Sucção máxima", suctionMax == null ? "—" : displayPressure(suctionMax))}
        </div>
      </div>
      <div class="inspector-block">
        <h3>Pressões por zona · ${dir}° (${pressureUnit()})</h3>
        <table class="inspector-table"><thead><tr><th>Zona</th><th>Cpe</th><th>−</th><th>+</th></tr></thead><tbody>${zoneRows}</tbody></table>
      </div>
      <div class="inspector-block">
        <h3>Validação</h3>
        ${warningHtml}${issueHtml}
      </div>
      <div class="inspector-foot">Atualização em tempo real. Coeficientes e pressões seguem a ABNT NBR 6123:2023; valide as hipóteses com profissional habilitado.</div>`;
    host.scrollTop = scroll;
  }
  function updateZoneChart() {
    const host = byId("zone-chart");
    if (!host) return;
    const dir = activeDirection();
    const zones = zonesFor(dir);
    const cpi = cpiResult(dir);
    const chip = byId("zone-chart-direction");
    if (chip) chip.textContent = `${dir}°`;
    const items = zones.map(zone => {
      const cpe = zone.cpe == null ? null : Number(zone.cpe);
      if (cpe == null || !Number.isFinite(cpe)) return { id: zone.id || "?", cp: null };
      const cps = cpi.candidates.map(value => cpe - value);
      return { id: zone.id || "?", cp: cps.reduce((best, current) => Math.abs(current) > Math.abs(best) ? current : best, cps[0] || 0) };
    }).filter(item => item.cp != null);
    if (!items.length) {
      host.innerHTML = `<div class="hint">Defina Cpe para visualizar o gráfico de Cp.</div>`;
      return;
    }
    const maxAbs = Math.max(...items.map(item => Math.abs(item.cp)), .1);
    host.innerHTML = items.map(item => {
      const width = Math.max(4, Math.abs(item.cp) / maxAbs * 100);
      const color = item.cp < 0 ? "#3476a9" : "#b9832d";
      return `<div class="zone-bar-row">
        <span class="zone-badge ${item.cp < 0 ? "suction" : "pressure"}">${escapeHtml(item.id)}</span>
        <span class="zone-bar-track"><i style="width:${width.toFixed(1)}%;background:${color}"></i></span>
        <b>${fmt(item.cp, 2)}</b>
      </div>`;
    }).join("");
  }

  /* ------------------------------------------------------------------------
     Vista 3D — renderização preservada do aplicativo original
     ------------------------------------------------------------------------ */
  function updateLiveModel() {
    const svg = byId("wind-model");
    if (!svg) return;
    const g = geometry();
    const dir = activeDirection();
    const r = windResult(dir);
    const zones = zonesFor(dir);
    const cpi = cpiResult(dir);
    const scale = Math.min(10, 265 / Math.max(g.a, g.b, g.totalHeight, 1));
    const cx = 260, floorY = 230;
    const cos = Math.cos(modelYaw + (g.roof === "arch" ? -1.15 : 0));
    const sin = Math.sin(modelYaw + (g.roof === "arch" ? -1.15 : 0));
    const project = (x, y, z) => {
      const u = x - g.a / 2, v = y - g.b / 2;
      const xr = u * cos - v * sin, yr = u * sin + v * cos;
      return [cx + xr * scale * .9, floorY + yr * scale * .38 - z * scale];
    };
    const point = (x, y, z) => project(x, y, z).map(v => v.toFixed(1)).join(",");
    const points = coords => coords.map(([x, y, z]) => point(x, y, z)).join(" ");
    const resultMap = currentStep === 5 && state.resultMode === "map";
    const zoneValue = i => {
      const value = zones[i]?.cpe;
      if (value == null || !Number.isFinite(Number(value))) return null;
      if (!resultMap) return Number(value);
      const cps = cpi.candidates.map(candidate => Number(value) - candidate);
      return cps.reduce((best, current) => Math.abs(current) > Math.abs(best) ? current : best, cps[0] || 0);
    };
    const zoneLabel = i => {
      const value = zoneValue(i);
      return `${zones[i]?.id || String.fromCharCode(65 + i)}${value == null ? "" : ` ${fmt(value, 1)}`}`;
    };
    const colorFor = value => {
      if (value == null || !Number.isFinite(Number(value))) return "#34465d";
      const pressure = resultMap ? Number(value) * r.q : Number(value);
      const intensity = Math.min(1, Math.abs(pressure) / 1.5);
      if (pressure < 0) return intensity > .55 ? "#24649a" : "#397ca7";
      return intensity > .55 ? "#c4852c" : "#a77d38";
    };
    const face = (coords, fill, label = "") => {
      const sum = coords.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      const center = project(sum[0] / coords.length, sum[1] / coords.length, sum[2] / coords.length);
      return `<polygon points="${points(coords)}" fill="${fill}" fill-opacity=".82" stroke="#7890ab" stroke-width="1.2"/>${label ? `<text x="${center[0].toFixed(1)}" y="${(center[1] + 4).toFixed(1)}" class="model-zone">${escapeHtml(label)}</text>` : ""}`;
    };
    const base = {
      p000: [0, 0, 0], p100: [g.a, 0, 0], p010: [0, g.b, 0], p110: [g.a, g.b, 0],
      e000: [0, 0, g.h], e100: [g.a, 0, g.h], e010: [0, g.b, g.h], e110: [g.a, g.b, g.h],
    };
    const zoneColor = i => colorFor(zoneValue(i));
    let model = "";
    const parallel = activeDirection() === 0;
    if (g.roof === "gable" && parallel) {
      const ridge0 = [0, g.b / 2, g.totalHeight], ridge1 = [g.a, g.b / 2, g.totalHeight];
      model += face([base.p000, base.p010, base.e010, ridge0, base.e000], zoneColor(0), zoneLabel(0));
      model += face([base.p100, base.p110, base.e110, ridge1, base.e100], zoneColor(1), zoneLabel(1));
      const c1x = Math.min(Math.max(Math.min(g.a, g.b) / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
      const cuts = [0, Math.min(c1x, g.a / 2), g.a / 2, g.a];
      for (let i = 0; i < 3; i++) {
        const x0 = cuts[i], x1 = cuts[i + 1];
        const label = i < 2 ? zoneLabel(2 + i) : zoneLabel(4);
        model += face([[x0, 0, 0], [x1, 0, 0], [x1, 0, g.h], [x0, 0, g.h]], zoneColor(2 + i), label);
        model += face([[x0, g.b, 0], [x1, g.b, 0], [x1, g.b, g.h], [x0, g.b, g.h]], zoneColor(2 + i), "");
        model += face([[x0, 0, g.h], [x1, 0, g.h], [x1, g.b / 2, g.totalHeight], [x0, g.b / 2, g.totalHeight]], zoneColor(5 + i), zoneLabel(5 + i));
        model += face([[x0, g.b / 2, g.totalHeight], [x1, g.b / 2, g.totalHeight], [x1, g.b, g.h], [x0, g.b, g.h]], zoneColor(5 + i), "");
      }
    } else if (g.roof === "gable") {
      const ridge0 = [0, g.b / 2, g.totalHeight], ridge1 = [g.a, g.b / 2, g.totalHeight];
      model += face([base.p000, base.p100, base.e100, base.e000], zoneColor(0), zoneLabel(0));
      model += face([base.p010, base.p110, base.e110, base.e010], zoneColor(1), zoneLabel(1));
      model += face([base.p000, base.p010, base.e010, ridge0, base.e000], zoneColor(2), zoneLabel(2));
      model += face([base.p100, base.p110, base.e110, ridge1, base.e100], zoneColor(3), zoneLabel(3));
      model += face([base.e000, base.e100, ridge1, ridge0], zoneColor(4), zoneLabel(4));
      model += face([ridge0, ridge1, base.e110, base.e010], zoneColor(5), zoneLabel(5));
    } else if (g.roof === "shed") {
      const ridge0 = [0, g.b, g.totalHeight], ridge1 = [g.a, g.b, g.totalHeight];
      if (parallel) {
        model += face([base.p000, base.p010, base.e010, ridge0, base.e000], zoneColor(0), zoneLabel(0));
        model += face([base.p100, base.p110, base.e110, ridge1, base.e100], zoneColor(1), zoneLabel(1));
        const c1x = Math.min(Math.max(Math.min(g.a, g.b) / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
        const cuts = [0, Math.min(c1x, g.a / 2), g.a / 2, g.a];
        for (let i = 0; i < 3; i++) {
          const x0 = cuts[i], x1 = cuts[i + 1];
          const zi = 2 + i;
          model += face([[x0, 0, 0], [x1, 0, 0], [x1, 0, g.h], [x0, 0, g.h]], zoneColor(zi), zoneLabel(zi));
          model += face([[x0, g.b, 0], [x1, g.b, 0], [x1, g.b, g.h], [x0, g.b, g.h]], zoneColor(zi), "");
          const roofZone = [5, 7, 6][i];
          model += face([[x0, 0, g.h], [x1, 0, g.h], [x1, g.b, g.totalHeight], [x0, g.b, g.totalHeight]], zoneColor(roofZone), zoneLabel(roofZone));
        }
      } else {
        model += face([base.p000, base.p100, base.e100, base.e000], zoneColor(0), zoneLabel(0));
        model += face([base.p010, base.p110, base.e110, base.e010], zoneColor(1), zoneLabel(1));
        model += face([base.p000, base.p010, base.e010, ridge0, base.e000], zoneColor(2), zoneLabel(2));
        model += face([base.p100, base.p110, base.e110, ridge1, base.e100], zoneColor(3), zoneLabel(3));
        model += face([base.e000, base.e100, ridge1, ridge0], zoneColor(4), zoneLabel(4));
      }
    } else if (g.roof === "arch") {
      const arcZ = y => g.h + (g.rise > 0 ? 4 * g.rise * y * (g.b - y) / (g.b * g.b) : 0);
      const arcPoints = x => Array.from({ length: 25 }, (_, k) => [x, g.b * k / 24, arcZ(g.b * k / 24)]);
      const endFace = x => [[x, 0, 0], [x, g.b, 0], ...[...arcPoints(x)].reverse()];
      if (parallel) {
        const c1x = Math.min(Math.max(Math.min(g.a, g.b) / 3, Math.max(g.a, g.b) / 4), 2 * g.h);
        const wallCuts = [0, Math.min(c1x, g.a / 2), g.a / 2, g.a];
        model += face(endFace(0), zoneColor(0), zoneLabel(0));
        model += face(endFace(g.a), zoneColor(1), zoneLabel(1));
        for (let i = 0; i < 3; i++) {
          const x0 = wallCuts[i], x1 = wallCuts[i + 1];
          model += face([[x0, 0, 0], [x1, 0, 0], [x1, 0, g.h], [x0, 0, g.h]], zoneColor(2 + i), zoneLabel(2 + i));
          model += face([[x0, g.b, 0], [x1, g.b, 0], [x1, g.b, g.h], [x0, g.b, g.h]], zoneColor(2 + i), "");
        }
        const roofCuts = [0, Math.min(g.b / 3, g.a), Math.min(2 * g.b / 3, g.a), Math.min(g.b, g.a), g.a];
        for (let i = 0; i < 4; i++) {
          const x0 = roofCuts[i], x1 = roofCuts[i + 1];
          if (x1 - x0 < 1e-6) continue;
          model += face([[x0, 0, g.h], [x1, 0, g.h], ...arcPoints(x1), ...[...arcPoints(x0)].reverse()], zoneColor(5 + i), "");
          const anchor = project((x0 + x1) / 2, g.b / 2, arcZ(g.b / 2));
          model += `<text x="${anchor[0].toFixed(1)}" y="${(anchor[1] + (i % 2 ? 10 : -3)).toFixed(1)}" class="model-zone">E${i + 1}</text>`;
        }
      } else {
        model += face([base.p000, base.p100, base.e100, base.e000], zoneColor(0), zoneLabel(0));
        model += face([base.p010, base.p110, base.e110, base.e010], zoneColor(1), zoneLabel(1));
        model += face(endFace(0), zoneColor(2), zoneLabel(2));
        model += face(endFace(g.a), zoneColor(3), zoneLabel(3));
        for (let i = 0; i < 6; i++) {
          const y0 = g.b * i / 6, y1 = g.b * (i + 1) / 6;
          for (let k = 0; k < 4; k++) {
            const ya = y0 + (y1 - y0) * k / 4, yb = y0 + (y1 - y0) * (k + 1) / 4;
            model += face([[0, ya, arcZ(ya)], [g.a, ya, arcZ(ya)], [g.a, yb, arcZ(yb)], [0, yb, arcZ(yb)]], zoneColor(4 + i), "");
          }
          const yMid = (y0 + y1) / 2;
          const anchor = project(g.a / 2, yMid, arcZ(yMid));
          model += `<text x="${anchor[0].toFixed(1)}" y="${(anchor[1] + (i % 2 ? 10 : -3)).toFixed(1)}" class="model-zone">E${i + 1}</text>`;
        }
      }
    }
    const A0 = project(0, 0, 0), A1 = project(g.a, 0, 0), B1 = project(g.a, g.b, 0);
    const H0 = project(g.a, g.b, 0), H1 = project(g.a, g.b, g.h);
    model += `<g class="dimension-lines"><line x1="${A0[0]}" y1="${A0[1] + 18}" x2="${A1[0]}" y2="${A1[1] + 18}"/><text x="${(A0[0] + A1[0]) / 2}" y="${(A0[1] + A1[1]) / 2 + 30}">a = ${fmt(displayLength(g.a), 1)} ${state.lengthUnit || "m"}</text>
      <line x1="${A1[0] + 8}" y1="${A1[1] + 7}" x2="${B1[0] + 8}" y2="${B1[1] + 7}"/><text x="${(A1[0] + B1[0]) / 2 + 15}" y="${(A1[1] + B1[1]) / 2 + 12}">b = ${fmt(displayLength(g.b), 1)}</text>
      <line x1="${H0[0] + 18}" y1="${H0[1]}" x2="${H1[0] + 18}" y2="${H1[1]}"/><text x="${H1[0] + 22}" y="${(H0[1] + H1[1]) / 2}">H = ${fmt(displayLength(g.h), 1)}</text></g>`;
    const modelLayer = byId("model-layer");
    if (modelLayer) modelLayer.innerHTML = model;
    else svg.innerHTML = model;

    const windLayer = byId("wind-layer");
    if (windLayer) {
      const maxDim = Math.max(g.a, g.b, g.totalHeight, 1);
      const windward = dir === 90 ? [g.a / 2, 0, g.h / 2] : [0, g.b / 2, g.h / 2];
      const wind = dir === 90 ? [0, 1, 0] : [1, 0, 0];
      const upwind = windward.map((value, i) => value - wind[i] * maxDim * .45);
      const facePoint = project(...windward), upPoint = project(...upwind);
      let dx = facePoint[0] - upPoint[0], dy = facePoint[1] - upPoint[1];
      let length = Math.hypot(dx, dy);
      if (length < 1e-6) { dx = 1; dy = 0; length = 1; }
      const ux = dx / length, uy = dy / length;
      const tail = [upPoint[0] - ux * 20, upPoint[1] - uy * 20];
      const angle = Math.atan2(uy, ux) * 180 / Math.PI;
      const arrowScale = Math.max(.45, Math.min(2.4, (length + 20) / 78));
      let rot = windLayer.querySelector("#wind-rot");
      if (!rot) {
        windLayer.innerHTML = `<g id="wind-rot"><line class="wind-flow" vector-effect="non-scaling-stroke" x1="0" y1="0" x2="78" y2="0"/><line class="wind-flow wind-soft" vector-effect="non-scaling-stroke" x1="0" y1="-7" x2="62" y2="-7"/><line class="wind-flow wind-soft" vector-effect="non-scaling-stroke" x1="0" y1="7" x2="62" y2="7"/><path class="wind-head" d="M78 0l-14 -6v12z"/></g><text id="wind-label" class="wind-label"></text>`;
        rot = windLayer.querySelector("#wind-rot");
      }
      rot.setAttribute("transform", `translate(${tail[0].toFixed(1)} ${tail[1].toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${arrowScale.toFixed(3)})`);
      const label = windLayer.querySelector("#wind-label");
      if (label) {
        label.textContent = `${dir}°`;
        label.setAttribute("x", (tail[0] - uy * 15).toFixed(1));
        label.setAttribute("y", (tail[1] + ux * 15 + 4).toFixed(1));
      }
    }
    if (byId("model-kind")) byId("model-kind").textContent = roofLabel();
    if (byId("live-vk")) byId("live-vk").textContent = `${fmt(r.vk, 1)} m/s`;
    if (byId("live-q")) byId("live-q").textContent = displayPressure(r.q);
    if (byId("live-alpha")) byId("live-alpha").textContent = g.roof === "arch" ? `f ${fmt(displayLength(Number(state.flecha)), 2)} ${state.lengthUnit || "m"}` : `${fmt(g.alpha, 1)}°`;
    if (byId("live-cpi")) byId("live-cpi").textContent = cpi.selected == null ? "—" : fmt(cpi.selected, 1);
  }

  /* ------------------------------------------------------------------------
     Municípios
     ------------------------------------------------------------------------ */
  function parseMunicipalityData(text) {
    return text.split(/\r?\n/).slice(1).filter(Boolean).map(line => {
      const [nome, uf, lat, lon, v0] = line.split("\t");
      return { nome, uf, lat: Number(lat), lon: Number(lon), v0: Number(v0) || 0 };
    }).filter(city => city.nome && city.uf);
  }
  function findMunicipality(value) {
    const needle = normalize(value);
    return municipalities.find(city => normalize(city.nome) === needle || normalize(`${city.nome} - ${city.uf}`) === needle);
  }
  async function loadMunicipalities() {
    try {
      const response = await fetch("./data/municipios.tsv");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(bytes);
      municipalities = parseMunicipalityData(text);
      cityLoadMessage = `${municipalities.length.toLocaleString("pt-BR")} municípios carregados da base local.`;
      if (currentStep === 1 && JW.render) JW.render();
    } catch {
      cityLoadMessage = "Base de municípios indisponível. Digite V₀ manualmente.";
      if (currentStep === 1 && JW.render) JW.render();
    }
  }

  function syncChrome() {
    updateHeader();
    updateStatusBar();
    updateNavProgress();
  }
  function refreshDerived() {
    updateLiveModel();
    updateInspector();
    updateZoneChart();
    applyValidation();
    syncChrome();
  }
  function saveState() {
    persistState();
    syncChrome();
  }

  Object.assign(JW, {
    APP, STEPS, defaults, engine, state,
    replaceState,
    getStep: () => currentStep,
    setStep: value => { currentStep = Number(value) || 0; },
    getMunicipalities: () => municipalities,
    setMunicipalities: value => { municipalities = value; },
    getCityLoadMessage: () => cityLoadMessage,
    setCityLoadMessage: value => { cityLoadMessage = value; },
    getModelYaw: () => modelYaw,
    setModelYaw: value => {
      const yaw = Number(value);
      modelYaw = Number.isFinite(yaw) ? yaw : -0.6;
      state.modelYaw = modelYaw;
    },
    getModelDragX: () => modelDragX,
    setModelDragX: value => { modelDragX = value; },
    byId, fmt, numericValue, escapeHtml, normalize, slug, icon, tip, field, selectField, textareaField,
    sectionCard, metricCard, row, notify, persistState, saveState, syncChrome, refreshDerived, applyValidation,
    displayLength, toMeters, pressureUnit, pressureValue, displayPressure,
    geometry, activeDirection, windResult, roofLabel, surfaceAreas, openingArea, cpiBalanceCase, cpiResult,
    autoZones, zonesFor, cpeNote, normativeWarnings, warningBox, collectValidation,
    stepCompletion, stepHasIssue, summaryForStep, renderNav, updateNavProgress, goToStep,
    currentFileName, updateHeader, updateStatusBar, updateUnitButtons, applyTheme, updateThemeButton,
    updateInspector, updateZoneChart, updateLiveModel,
    parseMunicipalityData, findMunicipality, loadMunicipalities,
    todayISO, defaultState, migrateState,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
