/* ==========================================================================
   JW Metálica — etapas do workbench
   ========================================================================== */
(function (global) {
  "use strict";

  const JW = global.JW;
  const {
    byId, icon, field, selectField, textareaField, sectionCard, metricCard,
    fmt, escapeHtml, numericValue, displayLength, toMeters, displayPressure, pressureValue,
    geometry, windResult, zonesFor, cpiResult, roofLabel, surfaceAreas, openingArea,
    cpeNote, normativeWarnings, warningBox, collectValidation, activeDirection, notify,
  } = JW;
  const state = JW.state;

  function bind(key, type = "number", after = null) {
    const el = byId(key);
    if (!el) return;
    const commit = () => {
      state[key] = type === "number" ? Number(el.value) : el.value;
      JW.persistState();
      JW.refreshDerived();
    };
    el.addEventListener("input", () => { commit(); if (after) after(); });
    el.addEventListener("change", () => {
      commit();
      if (after) after();
      JW.render();
    });
  }
  function bindLength(key, after = null) {
    const el = byId(key);
    if (!el) return;
    const commit = () => {
      state[key] = toMeters(el.value);
      JW.persistState();
      JW.refreshDerived();
    };
    el.addEventListener("input", () => { commit(); if (after) after(); });
    el.addEventListener("change", () => {
      commit();
      if (after) after();
      JW.render();
    });
  }

  /* ------------------------------------------------------------------------
     Etapa 0 · Dados da obra e cliente
     ------------------------------------------------------------------------ */
  function stepProject() {
    const content = byId("step-content");
    const cityLabel = state.city ? `${state.city}${state.uf ? ` — ${state.uf}` : ""}` : "Não definida";
    content.innerHTML = `
      ${sectionCard("building", "Identificação da obra", "Dados que aparecem no cabeçalho do memorial e no arquivo .vjw.", `
        <div class="field-grid two">
          ${field("Nome da obra / empreendimento", "project", state.project, "", "", { type: "text", validate: "project", placeholder: "Ex.: Galpão industrial — Unidade Sul", tip: "Nome que identifica o empreendimento no memorial e no arquivo .vjw." })}
          ${field("Cliente", "client", state.client, "", "", { type: "text", placeholder: "Razão social do cliente" })}
          ${field("Endereço", "address", state.address, "", "", { type: "text", placeholder: "Rua, número, bairro" })}
          <div class="field">
            <label>Localização (cidade — UF)</label>
            <div class="readout">
              <span>${escapeHtml(cityLabel)}${state.lat !== "" && state.lat !== null ? `<small>Lat ${fmt(state.lat, 3)}° · Lon ${fmt(state.lon, 3)}°</small>` : `<small>Defina na etapa de localização</small>`}</span>
              <button type="button" data-goto-step="1">Alterar</button>
            </div>
          </div>
          ${field("Responsável técnico", "responsible", state.responsible, "", "", { type: "text", placeholder: "Engenheiro responsável" })}
          ${field("CREA", "crea", state.crea, "", "", { type: "text", placeholder: "Número do registro" })}
          ${field("Data", "date", state.date, "", "", { type: "date", validate: "date" })}
          ${field("Código do projeto", "code", state.code, "", "", { type: "text", placeholder: "Ex.: JW-2026-014" })}
          ${field("Revisão", "revision", state.revision, "", "", { type: "text", placeholder: "R00" })}
        </div>
        <div class="field" style="margin-top:13px">${textareaField("Observações", "notes", state.notes, "Anotações do projeto, premissas e referências…")}</div>
      `)}
      ${sectionCard("file", "Arquivo do projeto", "Exporte um .vjw para levar todos os dados da obra e parâmetros.", `
        <div class="readout">
          <span><strong>${escapeHtml(JW.currentFileName())}</strong><small>${state.fileName ? "Arquivo importado/exportado nesta sessão" : "Nome sugerido — ainda não exportado"}</small></span>
          <button type="button" id="project-export-inline">Exportar .vjw</button>
        </div>
        <div class="info-box"><span class="info-symbol">i</span><span>O arquivo .vjw contém metadados da obra, localização, parâmetros, aberturas, coeficientes e a vista 3D. A importação valida a estrutura antes de restaurar.</span></div>
      `)}`;
    ["project", "client", "address", "responsible", "crea", "date", "code", "revision"].forEach(key => bind(key, "string"));
    const notes = byId("notes");
    if (notes) notes.addEventListener("input", () => { state.notes = notes.value; JW.persistState(); });
    content.querySelectorAll("[data-goto-step]").forEach(button => {
      button.addEventListener("click", () => JW.goToStep(Number(button.dataset.gotoStep)));
    });
    const exportInline = byId("project-export-inline");
    if (exportInline) exportInline.addEventListener("click", () => JW.exportProject && JW.exportProject());
  }

  /* ------------------------------------------------------------------------
     Etapa 1 · Localização e V0
     ------------------------------------------------------------------------ */
  function stepLocation() {
    const content = byId("step-content");
    const municipalities = JW.getMunicipalities();
    const cityLabel = state.city ? `${state.city}${state.uf ? ` — ${state.uf}` : ""}` : "Selecione um município";
    content.innerHTML = `
      ${sectionCard("map", "Localização da obra", "Digite o município e confirme o V₀ sugerido pela base local contra a isopleta da Figura 1.", `
        <div class="field-grid two">
          <div class="field">
            <label for="city-search"><span>Município${JW.tip("A base local sugere V₀ pela coordenada do município. A norma exige a leitura da isopleta para o local exato da obra.")}</span><small>${municipalities.length.toLocaleString("pt-BR")} no Brasil</small></label>
            <div class="control-wrap"><input id="city-search" type="search" list="city-options" value="${escapeHtml(state.city)}" placeholder="Digite o nome da cidade…" autocomplete="off"></div>
            <div class="hint">Digite o nome e escolha na lista. A base local sugere V₀; confirme o valor no mapa de isopletas para as coordenadas da obra.</div>
          </div>
          <div class="field">
            <label>Obra localizada em</label>
            <div class="location-readout">${escapeHtml(cityLabel)}<small>${state.lat !== "" && state.lat !== null ? `${fmt(state.lat, 3)}°, ${fmt(state.lon, 3)}°` : "Coordenadas aparecerão após a seleção."}</small></div>
          </div>
          ${field("Velocidade básica V₀", "v0", state.v0, "m/s", "Valor sugerido pela base local, editável conforme a isopleta.", { min: 0, max: 100, step: .1, validate: "v0", tip: "V₀ é a velocidade básica do vento, rajada de 3 s a 10 m do solo, excedida em média uma vez em 50 anos (5.1)." })}
          <div class="field">
            <label>Referência municipal</label>
            <div class="readout"><span>${state.v0Table ? "V₀ sugerido pela base local" : "V₀ informado manualmente"}<small>${state.city ? `${escapeHtml(state.city)}${state.uf ? ` — ${state.uf}` : ""}` : "Sem município selecionado"}</small></span></div>
          </div>
        </div>
        <div class="section-title">Mapa de referência <span class="section-hint">distribuição dos municípios da base</span></div>
        <button id="map-v0-button" class="btn btn-outline" type="button">${icon("map")} Ver mapa de V₀ no Brasil</button>
        <div id="map-v0-preview" class="map-v0-preview" hidden></div>
        <div id="city-status" class="city-status">${escapeHtml(JW.getCityLoadMessage())}</div>
        <div class="info-box"><span class="info-symbol">i</span><span>A NBR 6123:2023 define V₀ pelo mapa de isopletas (Figura 1). A base municipal serve para localizar a obra e sugerir o valor, mas não substitui a leitura das isopletas.</span></div>
      `)}`;
    const datalist = byId("city-options");
    if (datalist && datalist.options.length !== municipalities.length) {
      datalist.innerHTML = municipalities.map(city => `<option value="${escapeHtml(`${city.nome} - ${city.uf}`)}"></option>`).join("");
    }
    const search = byId("city-search");
    const applyCity = (shouldRender = true) => {
      const city = JW.findMunicipality(search.value);
      if (!city) return false;
      state.city = city.nome;
      state.uf = city.uf;
      state.lat = city.lat;
      state.lon = city.lon;
      if (city.v0 > 0) { state.v0 = city.v0; state.v0Table = true; }
      JW.persistState();
      if (shouldRender) JW.render();
      else JW.syncChrome();
      return true;
    };
    if (search) {
      search.addEventListener("input", () => applyCity(false));
      search.addEventListener("change", () => {
        if (applyCity(true)) return;
        const typed = search.value.trim();
        state.city = typed;
        state.uf = "";
        state.lat = "";
        state.lon = "";
        state.v0Table = false;
        JW.persistState();
        JW.render();
        const status = byId("city-status");
        if (status) {
          status.textContent = typed
            ? "Município não encontrado na base. Informe V₀ após consultar a isopleta."
            : JW.getCityLoadMessage();
        }
      });
    }
    const v0 = byId("v0");
    if (v0) {
      v0.addEventListener("input", () => { state.v0 = Number(v0.value); state.v0Table = false; JW.persistState(); JW.refreshDerived(); });
      v0.addEventListener("change", () => { state.v0 = Number(v0.value); state.v0Table = false; JW.persistState(); JW.render(); });
    }
    const mapButton = byId("map-v0-button");
    if (mapButton) mapButton.addEventListener("click", () => {
      const map = byId("map-v0-preview");
      if (!map) return;
      map.hidden = !map.hidden;
      if (map.hidden) return;
      const points = municipalities.map(city => {
        const x = 20 + (city.lon + 74) / 40 * 210;
        const y = 15 + (5 - city.lat) / 40 * 265;
        const selected = JW.normalize(city.nome) === JW.normalize(state.city) && city.uf === state.uf;
        const color = city.v0 >= 50 ? "#d65c4c" : city.v0 >= 40 ? "#e9a44a" : "#5c9fc2";
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${selected ? 4.5 : 1.4}" fill="${selected ? "#ffd36b" : color}" opacity="${selected ? 1 : .52}"/>`;
      }).join("");
      map.innerHTML = `<div class="hint">Referência municipal V₀ — não é a imagem oficial das isopletas.</div><svg viewBox="0 0 250 300" role="img" aria-label="Distribuição dos municípios da base de referência">${points}<text x="20" y="292" fill="#9ba7b6" font-size="9">${escapeHtml(state.city || "Brasil")}</text></svg>`;
    });
    const status = byId("city-status");
    if (status) status.textContent = state.city
      ? `${state.city}${state.uf ? ` — ${state.uf}` : ""} · ${state.v0Table ? "V₀ sugerido pela base local; confira no mapa." : "V₀ editável; consulte a isopleta."}`
      : JW.getCityLoadMessage();
  }

  /* ------------------------------------------------------------------------
     Etapa 2 · Fatores S1, S2 e S3
     ------------------------------------------------------------------------ */
  function stepFactors() {
    const content = byId("step-content");
    const r = windResult();
    const category = JW.engine.roughness.find(item => item.id === state.category) || JW.engine.roughness[1];
    const [bm, p] = category.rows[r.cls];
    const classNames = ["A · até 20 m", "B · de 20 a 50 m", "C · acima de 50 m"];
    const classOptions = [
      { value: "auto", label: `${classNames[r.cls]} · automática` },
      { value: 0, label: "A · até 20 m" },
      { value: 1, label: "B · de 20 a 50 m" },
      { value: 2, label: "C · acima de 50 m" },
    ];
    const unit = state.lengthUnit || "m";
    const frontDimension = r.direction === 90 ? Math.max(r.geometry.a, r.geometry.totalHeight) : Math.max(r.geometry.b, r.geometry.totalHeight);
    content.innerHTML = `
      ${sectionCard("wind", "S₁ · Topografia (5.2)", "A topografia local altera a velocidade básica. Em terreno plano, S₁ = 1,00.", `
        <div class="radio-cards three">
          <label class="radio-card"><input type="radio" name="topography" value="plain" ${state.topography === "plain" ? "checked" : ""}><span><strong>Plano</strong><small>S₁ = 1,00</small></span></label>
          <label class="radio-card"><input type="radio" name="topography" value="slope" ${state.topography === "slope" ? "checked" : ""}><span><strong>Talude ou morro</strong><small>Calculado pela posição e altura.</small></span></label>
          <label class="radio-card"><input type="radio" name="topography" value="valley" ${state.topography === "valley" ? "checked" : ""}><span><strong>Vale profundo</strong><small>S₁ = 0,90</small></span></label>
        </div>
        <div id="slope-inputs" class="field-grid two" style="margin-top:12px" ${state.topography === "slope" ? "" : "hidden"}>
          ${field("Inclinação do talude θt", "thetaT", state.thetaT, "°", "A rotina usa os trechos da norma: 3°–6° e 17°–45° com interpolação.", { min: 0, max: 60, step: .1, validate: "thetaT", tip: "θt é a inclinação do talude ou morro em relação à horizontal (5.2)." })}
          ${field("Dimensão topográfica d", "dt", numericValue(displayLength(state.dt)), unit, "Dimensão horizontal característica usada no cálculo de S₁.", { min: 0, step: .1, validate: "dt", tip: "d é a dimensão horizontal característica do acidente topográfico medida na direção do vento (5.2)." })}
        </div>
      `)}
      ${sectionCard("layers", "S₂ · Rugosidade (5.3.1) e classe (5.3.2)", "Categoria do terreno e classe da edificação definem bₘ, p, Fr e o fator S₂ na altura crítica.", `
        <div class="field-grid two">
          ${selectField("Categoria do terreno", "category", state.category, JW.engine.roughness.map(item => ({ value: item.id, label: `${item.name} · ${item.description}` })), "", { tip: "Categoria de rugosidade do terreno: I (liso) a V (obstáculos altos e densos), conforme 5.3.1." })}
          ${selectField("Classe da edificação", "manualClass", state.manualClass === "" ? "auto" : state.manualClass, classOptions, `Maior dimensão frontal: ${fmt(frontDimension, 2)} ${unit}.`, { tip: "A classe A/B/C é definida pela maior dimensão frontal da edificação, horizontal ou vertical (5.3.2)." })}
        </div>
        <div class="info-box"><span class="info-symbol">ƒ</span><span>S₂ = bₘ · Fr · (z / 10)<sup>p</sup>; para ${category.name}, classe ${["A", "B", "C"][r.cls]}: bₘ = ${fmt(bm, 2)}, Fr = ${fmt(r.fr, 2)}, p = ${fmt(p, 3)}, z crítico = ${fmt(displayLength(r.z), 2)} ${unit}.</span></div>
      `)}
      ${sectionCard("chart", "S₃ · Grupo de utilização (Tabela 4)", "O grupo de ocupação define o período de retorno e o fator estatístico S₃.", `
        <div class="group-list">${JW.engine.groups.map(group => `<label class="group-row ${Number(state.group) === group.id ? "selected" : ""}"><input type="radio" name="group" value="${group.id}" ${Number(state.group) === group.id ? "checked" : ""}><span><strong>${group.name} — ${fmt(group.factor, 2)}</strong><small>Tp ${group.returnPeriod} anos · ${group.description}</small></span></label>`).join("")}</div>
        <div class="factor-summary">
          <span>S₁ <strong>${fmt(r.s1, 3)}</strong></span><span>S₂ <strong>${fmt(r.s2, 3)}</strong></span><span>S₃ <strong>${fmt(r.s3, 2)}</strong></span>
          <span class="formula-chip">z = ${fmt(displayLength(r.z), 2)} ${unit} · S₂ = bₘ·Fr·(z/10)^p</span>
        </div>
      `)}`;
    content.querySelectorAll('input[name="topography"]').forEach(el => el.addEventListener("change", () => {
      state.topography = el.value;
      JW.persistState();
      JW.render();
    }));
    content.querySelectorAll('input[name="group"]').forEach(el => el.addEventListener("change", () => {
      state.group = Number(el.value);
      JW.persistState();
      JW.render();
    }));
    bind("thetaT");
    bindLength("dt");
    const categorySelect = byId("category");
    if (categorySelect) categorySelect.addEventListener("change", () => {
      state.category = categorySelect.value;
      JW.persistState();
      JW.render();
    });
    const manualClass = byId("manualClass");
    if (manualClass) manualClass.addEventListener("change", () => {
      state.manualClass = manualClass.value === "auto" ? "" : Number(manualClass.value);
      JW.persistState();
      JW.render();
    });
  }

  /* ------------------------------------------------------------------------
     Etapa 3 · Geometria
     ------------------------------------------------------------------------ */
  function updateDerivedGeometry() {
    const g = geometry();
    const labels = {
      "derived-rise": `${fmt(displayLength(g.rise), 2)} ${state.lengthUnit || "m"}`,
      "derived-total": `${fmt(displayLength(g.totalHeight), 2)} ${state.lengthUnit || "m"}`,
      "derived-ab": fmt(g.a / g.b, 2),
      "derived-hb": fmt(g.hOverB, 2),
    };
    Object.entries(labels).forEach(([id, value]) => { const el = byId(id); if (el) el.textContent = value; });
    JW.updateLiveModel();
  }
  function stepGeometry() {
    const content = byId("step-content");
    const g = geometry();
    const unit = state.lengthUnit || "m";
    const isArch = g.roof === "arch";
    const alphaLimit = g.roof === "shed" ? 30 : 60;
    const options = [
      ["gable", "Duas águas", "Cobertura simétrica com cumeeira central", "⌂"],
      ["shed", "Uma água (shed)", "Plano único inclinado entre dois pés-direitos", "◩"],
      ["arch", "Arco (abóbada)", "Abóbada cilíndrica de seção circular", "∩"],
    ];
    content.innerHTML = `
      ${sectionCard("ruler", "Tipologia da cobertura", "A geometria define quais tabelas de coeficientes da norma serão usadas nas zonas de pressão.", `
        <div class="structure-cards">${options.map(([value, title, description, glyph]) => `<label class="structure-card ${g.roof === value ? "selected" : ""}">
          <input type="radio" name="roof" value="${value}" ${g.roof === value ? "checked" : ""}>
          <span class="structure-icon">${glyph}</span><strong>${title}</strong><small>${description}</small>
        </label>`).join("")}</div>
      `)}
      ${sectionCard("ruler", "Dimensões da edificação", "As cotas alimentam o modelo ao vivo. O vão e o comprimento definem as proporções usadas nas tabelas.", `
        <div class="field-grid three">
          ${field("Vão / largura b", "b", numericValue(displayLength(g.b)), unit, "", { min: 0, step: .1, validate: "b", tip: "b é a menor dimensão horizontal em planta, medida perpendicularmente à cumeeira (6.1.1)." })}
          ${field("Comprimento a", "a", numericValue(displayLength(g.a)), unit, "", { min: 0, step: .1, validate: "a", tip: "a é a maior dimensão horizontal em planta, medida paralelamente à cumeeira (6.1.1)." })}
          ${field("Pé-direito H", "h", numericValue(displayLength(g.h)), unit, "Altura do chão ao beiral.", { min: 0, step: .1, validate: "h", tip: "H é a altura do piso até o beiral, sem contar a altura da cobertura (6.1.1)." })}
        </div>
        ${isArch
          ? `<div class="field-grid" style="margin-top:13px">${field("Flecha do arco f", "flecha", numericValue(displayLength(state.flecha)), unit, `Limitada a b/2 = ${fmt(displayLength(g.b / 2), 2)} ${unit}.`, { min: 0, step: .1, validate: "flecha", tip: "f é a flecha da abóbada cilíndrica, medida no ponto central do arco (6.2.3)." })}</div>`
          : `<div class="field" style="margin-top:13px"><label for="alpha"><span>Inclinação α${JW.tip("α é o ângulo de inclinação da cobertura em relação à horizontal. As Tabelas 7 e 8 têm limites distintos.")}</span><small>0°–${alphaLimit}°</small></label><div class="range-row"><input id="alpha" type="range" min="0" max="${alphaLimit}" step=".5" value="${escapeHtml(state.alpha)}" data-validate="alpha"><strong id="alpha-value">${fmt(state.alpha, 1)}°</strong></div><div class="field-error" data-error-for="alpha"></div></div>`}
        <div class="derived-grid">
          <div><span>Flecha da cobertura</span><strong id="derived-rise"></strong></div>
          <div><span>Altura total</span><strong id="derived-total"></strong></div>
          <div><span>a/b</span><strong id="derived-ab"></strong></div>
          <div><span>h/b</span><strong id="derived-hb"></strong></div>
        </div>
        ${warningBox(normativeWarnings())}
      `)}`;
    content.querySelectorAll('input[name="roof"]').forEach(el => el.addEventListener("change", () => {
      const previousRoof = geometry().roof;
      state.roof = el.value;
      if (state.roof !== previousRoof) {
        state.zoneCpeSource = "auto";
        state.zoneCpeSource0 = "auto";
        state.zones = JW.defaults.zones.map(zone => ({ ...zone, cpe: null }));
        state.zones0 = JW.defaults.zones0.map(zone => ({ ...zone, cpe: null }));
      }
      if (state.roof === "shed") state.alpha = Math.min(Number(state.alpha) || 0, 30);
      else if (state.roof === "gable") state.alpha = Math.min(Number(state.alpha) || 0, 60);
      JW.persistState();
      JW.render();
    }));
    ["a", "b", "h", "flecha"].forEach(key => bindLength(key, updateDerivedGeometry));
    const alpha = byId("alpha");
    if (alpha) alpha.addEventListener("input", () => {
      state.alpha = Number(alpha.value);
      const value = byId("alpha-value");
      if (value) value.textContent = `${fmt(state.alpha, 1)}°`;
      JW.persistState();
      updateDerivedGeometry();
      JW.refreshDerived();
    });
    updateDerivedGeometry();
  }

  /* ------------------------------------------------------------------------
     Etapa 4 · Cpe, Cpi e Ca
     ------------------------------------------------------------------------ */
  function cpePanelHtml() {
    const dir = activeDirection();
    const zones = zonesFor(dir);
    const cpi = cpiResult(dir);
    const cpeAuto = (dir === 90 ? state.zoneCpeSource : state.zoneCpeSource0) === "auto";
    const rows = zones.map((zone, index) => {
      const cpCandidates = zone.cpe == null ? [] : cpi.candidates.map(value => Number(zone.cpe) - value);
      const cp = cpCandidates.length ? cpCandidates.reduce((best, current) => Math.abs(current) > Math.abs(best) ? current : best, cpCandidates[0]) : null;
      const zoneId = zone.id || String.fromCharCode(65 + index);
      const displayedCpe = zone.cpe == null ? "" : numericValue(cpeAuto ? Math.round(Number(zone.cpe) * 100) / 100 : zone.cpe);
      return `<tr><td><span class="zone-badge ${Number(zone.cpe) < 0 ? "suction" : "pressure"}">${escapeHtml(zoneId)}</span></td><td>${escapeHtml(zone.name)}</td>
        <td><input aria-label="Cpe ${escapeHtml(zone.name)}" data-cpe-index="${index}" type="number" step=".01" value="${escapeHtml(displayedCpe)}" placeholder="Cpe" title="${cpeAuto ? "Cpe calculado por interpolação; exibido com duas casas." : "Coeficiente Cpe editável"}"></td>
        <td>${cp == null ? "—" : fmt(cp)}</td></tr>`;
    }).join("");
    return `<div class="direction-tabs">
        <button type="button" data-direction="90" class="${dir === 90 ? "active" : ""}">Vento a 90° — perpendicular ${geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</button>
        <button type="button" data-direction="0" class="${dir === 0 ? "active" : ""}">Vento a 0° — paralelo ${geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</button>
      </div>
      <button id="auto-cpe-button" type="button" class="btn btn-outline">${icon("refresh")} Recalcular Cpe pelas tabelas normativas</button>
      ${warningBox(normativeWarnings())}
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Zona</th><th>Superfície</th><th>Cpe</th><th>Cpe − Cpi</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="info-box"><span class="info-symbol">!</span><span>${cpeNote(dir)}</span></div>`;
  }
  function bindCpePanel(host) {
    const dir = activeDirection();
    host.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => {
      state.direction = Number(button.dataset.direction);
      JW.persistState();
      JW.render();
    }));
    const autoButton = host.querySelector("#auto-cpe-button");
    if (autoButton) autoButton.addEventListener("click", () => {
      state.zoneCpeSource = "auto";
      state.zoneCpeSource0 = "auto";
      state.zones = [];
      state.zones0 = [];
      JW.persistState();
      JW.render();
    });
    host.querySelectorAll("[data-cpe-index]").forEach(input => {
      input.addEventListener("input", () => {
        const values = zonesFor(dir);
        values[Number(input.dataset.cpeIndex)].cpe = input.value === "" ? null : Number(input.value);
        if (dir === 90) state.zoneCpeSource = "manual";
        else state.zoneCpeSource0 = "manual";
        JW.persistState();
        JW.refreshDerived();
      });
      input.addEventListener("change", () => { JW.persistState(); JW.render(); });
    });
  }

  function cpiPanelHtml() {
    const areas = surfaceAreas();
    const faceLabels = [
      ["long1", "Fachada longa 1"], ["long2", "Fachada longa 2"],
      ["end1", "Empena 1"], ["end2", "Empena 2"],
    ];
    const rows = faceLabels.map(([id, label]) => {
      const face = state.faces[id] || { permeability: "leak", area: 0 };
      const percent = areas[id] > 0 ? Number(face.area || 0) / areas[id] * 100 : 0;
      return `<div class="opening-card"><div class="opening-title"><strong>${label}</strong><small>área ${fmt(areas[id], 1)} m²</small></div>
        <div class="permeability-options">${[
          ["impermeable", "Impermeável"], ["leak", "Com aberturas"], ["open", "Totalmente aberta"],
        ].map(([value, text]) => `<label><input type="radio" name="perm-${id}" value="${value}" ${face.permeability === value ? "checked" : ""}><span>${text}</span></label>`).join("")}</div>
        <label class="opening-area-label" for="area-${id}">Área total de aberturas nesta face (m²) <small id="face-percent-${id}">índice ${fmt(percent, 2)}%</small></label>
        <input id="area-${id}" data-face-area="${id}" data-validate="area-${id}" type="number" min="0" step=".1" value="${escapeHtml(face.area ?? 0)}" ${face.permeability !== "leak" ? "disabled" : ""}>
        <div class="field-error" data-error-for="area-${id}"></div>
      </div>`;
    }).join("");
    const c90 = cpiResult(90), c0 = cpiResult(0);
    const cpiCases = [...(c90.cases || []), ...(c0.cases || [])];
    return `<label class="check-row"><input id="estanque" type="checkbox" ${state.estanque ? "checked" : ""}><span><strong>Edificação efetivamente estanque (6.3.2.2)</strong><small>Marque apenas para galpão fechado sem aberturas relevantes.</small></span></label>
      <div class="opening-list">${rows}</div>
      <div class="roof-permeability"><strong>Cobertura · área ${fmt(areas.roof, 1)} m²</strong><div class="permeability-options">
        <label><input type="radio" name="roof-perm" value="impermeable" ${state.faces.roof.permeability === "impermeable" ? "checked" : ""}><span>Forro estanque</span></label>
        <label><input type="radio" name="roof-perm" value="permeable" ${state.faces.roof.permeability === "permeable" ? "checked" : ""}><span>Sem forro ou forro permeável</span></label>
      </div></div>
      <div class="section-title">Caso enquadrado por incidência</div>
      <div class="cpi-cases">${cpiCases.map(item => `<div class="cpi-case"><div><strong>${item.name}</strong><small>[${item.clause}] ${item.description}</small></div><b>${item.selected == null ? "—" : fmt(item.selected, 1)}${item.candidates.length > 1 ? ` (${item.candidates.map(value => fmt(value, 1)).join(" / ")})` : ""}</b></div>`).join("")}</div>
      ${!c90.automatic || !c0.automatic ? `<div class="field-grid" style="margin-top:12px">${field("Cpi para o caso não automatizado", "cpi", state.cpi, "", "A configuração não se enquadra nos casos automatizados desta versão; confira o balanço de permeabilidade da seção 6.3.3.", { min: -2, max: 2, step: .01, validate: "cpi", tip: "Cpi é o coeficiente de pressão interna. Use a seção 6.3 quando o arranjo não for resolvido automaticamente." })}</div>` : ""}
      <div class="info-box"><span class="info-symbol">i</span><span>A face dominante pode mudar o caso conforme o vento gira. Para configurações complexas, o original resolve o balanço de 6.3.3; valide qualquer resultado antes de usar como carga de projeto.</span></div>`;
  }
  function bindCpiPanel(host) {
    const estanque = host.querySelector("#estanque");
    if (estanque) estanque.addEventListener("change", event => { state.estanque = event.target.checked; JW.persistState(); JW.render(); });
    host.querySelectorAll('input[name^="perm-"]').forEach(el => el.addEventListener("change", () => {
      const id = el.name.slice("perm-".length);
      state.faces[id].permeability = el.value;
      JW.persistState();
      JW.render();
    }));
    host.querySelectorAll('input[name="roof-perm"]').forEach(el => el.addEventListener("change", () => {
      state.faces.roof.permeability = el.value;
      JW.persistState();
      JW.render();
    }));
    host.querySelectorAll("[data-face-area]").forEach(el => {
      const updateArea = () => {
        const id = el.dataset.faceArea;
        state.faces[id].area = Number(el.value) || 0;
        const areas = surfaceAreas();
        const percent = areas[id] > 0 ? state.faces[id].area / areas[id] * 100 : 0;
        const label = byId(`face-percent-${id}`);
        if (label) label.textContent = `índice ${fmt(percent, 2)}%`;
        JW.persistState();
        JW.refreshDerived();
      };
      el.addEventListener("input", updateArea);
      el.addEventListener("change", () => { updateArea(); JW.render(); });
    });
    if (byId("cpi")) bind("cpi");
  }

  function caPanelHtml() {
    return `<div class="info-box"><span class="info-symbol">i</span><span>A NBR 6123 trata a força global de arrasto por <strong>F = Ca · q · A</strong>, com Ca obtido nas tabelas de coeficientes de força. Esta versão automatiza Cpe e Cpi por zona e não presume Ca: integre as pressões da aba Resultados ou consulte as Tabelas 9 a 12, 17 e 20 conforme a tipologia.</span></div>
      <div class="section-title">Força global — formulação</div>
      <div class="table-wrap"><table><thead><tr><th>Grandeza</th><th>Expressão</th><th>Unidade</th></tr></thead><tbody>
        <tr><td>Pressão dinâmica</td><td>q = 0,613 · Vk² / 1000</td><td>kN/m²</td></tr>
        <tr><td>Força de arrasto</td><td>F = Ca · q · A</td><td>kN</td></tr>
        <tr><td>Pressão efetiva por zona</td><td>Δp = (Cpe − Cpi) · q</td><td>kN/m²</td></tr>
      </tbody></table></div>
      <div class="factor-summary"><span class="formula-chip">Ca não automatizado nesta versão</span><span>Use a envoltória de Δp por zona para o dimensionamento local.</span></div>
      <div class="info-box warn"><span class="info-symbol">!</span><span>Não some a força de atrito da incidência paralela às pressões da incidência perpendicular. Ações locais de borda e canto exigem verificação complementar (Tabelas 17 e 20).</span></div>`;
  }

  function stepCoefficients() {
    const content = byId("step-content");
    const tabs = [
      ["cpe", "Cpe · Pressão externa"],
      ["cpi", "Cpi · Pressão interna"],
      ["ca", "Ca · Força global"],
    ];
    content.innerHTML = `<article class="card">
      <div class="card-head"><div class="card-icon">${icon("layers")}</div><div><h2>Coeficientes de pressão e forma</h2><p>Revise as zonas externas, descreva as aberturas e consulte a força global.</p></div></div>
      <div class="card-body">
        <div class="subtabs">${tabs.map(([id, label]) => `<button type="button" data-coef-tab="${id}" class="${state.coefTab === id ? "active" : ""}">${label}</button>`).join("")}</div>
        <div id="coef-panel"></div>
      </div>
    </article>`;
    content.querySelectorAll("[data-coef-tab]").forEach(button => button.addEventListener("click", () => {
      state.coefTab = button.dataset.coefTab;
      JW.persistState();
      JW.render();
    }));
    const host = byId("coef-panel");
    if (!host) return;
    if (state.coefTab === "cpi") {
      host.innerHTML = cpiPanelHtml();
      bindCpiPanel(host);
    } else if (state.coefTab === "ca") {
      host.innerHTML = caPanelHtml();
    } else {
      host.innerHTML = cpePanelHtml();
      bindCpePanel(host);
    }
  }

  /* ------------------------------------------------------------------------
     Etapa 5 · Resultados e combinações
     ------------------------------------------------------------------------ */
  function directionSummary(direction) {
    const result = windResult(direction);
    const zones = zonesFor(direction);
    const cpi = cpiResult(direction);
    const suctions = [], overpressures = [];
    zones.forEach(zone => {
      if (zone.cpe == null || !Number.isFinite(Number(zone.cpe))) return;
      const cps = cpi.candidates.map(value => Number(zone.cpe) - value);
      suctions.push(Math.min(...cps) * result.q);
      overpressures.push(Math.max(...cps) * result.q);
    });
    return {
      result, zones, cpi,
      suction: suctions.length ? Math.min(...suctions) : null,
      overpressure: overpressures.length ? Math.max(...overpressures) : null,
    };
  }
  function stepResults() {
    const content = byId("step-content");
    const dir = activeDirection();
    const r = windResult(dir);
    const zones = zonesFor(dir);
    const cpi = cpiResult(dir);
    const rows = zones.map((zone, index) => {
      const cpe = zone.cpe == null || zone.cpe === "" ? null : Number(zone.cpe);
      const zoneId = zone.id || String.fromCharCode(65 + index);
      if (cpe == null || !Number.isFinite(cpe)) return `<tr><td><span class="zone-badge neutral">${escapeHtml(zoneId)}</span></td><td>${escapeHtml(zone.name)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
      const cps = cpi.candidates.map(value => cpe - value);
      const suction = Math.min(...cps) * r.q;
      const overpressure = Math.max(...cps) * r.q;
      const cpText = cps.length > 1 ? `${fmt(Math.min(...cps))} a ${fmt(Math.max(...cps))}` : fmt(cps[0]);
      return `<tr><td><span class="zone-badge ${suction < 0 ? "suction" : "pressure"}">${escapeHtml(zoneId)}</span></td>
         <td>${escapeHtml(zone.name)}</td><td>${fmt(cpe, 2)}</td><td>${cpText}</td><td>${suction < 0 ? displayPressure(suction) : "0"}</td><td>${overpressure > 0 ? displayPressure(overpressure) : "0"}</td></tr>`;
    }).join("");
    const suctionValues = zones.filter(zone => zone.cpe != null).map(zone => Math.min(...cpi.candidates.map(value => Number(zone.cpe) - value)) * r.q).filter(value => value < 0);
    const suctionMax = suctionValues.length ? Math.min(...suctionValues) : null;
    const tabs = [["table", "Tabela"], ["map", "Mapa 3D"], ["local", "Ações locais"], ["combinations", "Combinações"]];
    let modeContent = "";
    if (state.resultMode === "table") {
      modeContent = `<div class="table-wrap"><table><thead><tr><th>Zona</th><th>Superfície</th><th>Cpe</th><th>Cp = Cpe − Cpi</th><th>Δp sucção</th><th>Δp sobrepressão</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else if (state.resultMode === "local") {
      modeContent = `<div class="info-box"><span class="info-symbol">!</span><span>Ações locais (faixas de borda, cantos e cumeeira) dependem das Tabelas 6, 7, 8 e 20 e da geometria. A seleção automática dessas faixas ainda não foi validada; não use a tabela geral como substituta.</span></div>`;
    } else if (state.resultMode === "combinations") {
      const d90 = directionSummary(90);
      const d0 = directionSummary(0);
      const suctionValuesAll = [d90.suction, d0.suction].filter(Number.isFinite);
      const overValuesAll = [d90.overpressure, d0.overpressure].filter(Number.isFinite);
      const envelopeSuction = suctionValuesAll.length ? Math.min(...suctionValuesAll) : null;
      const envelopeOver = overValuesAll.length ? Math.max(...overValuesAll) : null;
      const card = (title, summary, tone = "") => `<div class="combination-card ${tone}"><h3>${title}</h3><dl>
        <dt>Vk</dt><dd>${fmt(summary.result.vk, 2)} m/s</dd>
        <dt>q</dt><dd>${displayPressure(summary.result.q)}</dd>
        <dt>Sucção máxima</dt><dd>${summary.suction == null ? "—" : displayPressure(summary.suction)}</dd>
        <dt>Sobrepressão máxima</dt><dd>${summary.overpressure == null ? "—" : displayPressure(summary.overpressure)}</dd>
      </dl></div>`;
      modeContent = `<div class="combination-grid">
        ${card("Combinação 1 · vento a 90°", d90)}
        ${card("Combinação 2 · vento a 0°", d0)}
        ${card("Envoltória de projeto · valores mais desfavoráveis", { result: { vk: Math.max(d90.result.vk, d0.result.vk), q: Math.max(d90.result.q, d0.result.q) }, suction: envelopeSuction, overpressure: envelopeOver }, "envelope")}
        <div class="combination-card"><h3>Critério de combinação</h3><p class="hint" style="margin:0">Adote, para cada superfície, a envoltória das incidências de 90° e 0°. Não combine forças de atrito da incidência paralela com as pressões da perpendicular.</p></div>
      </div>`;
    } else {
      modeContent = `<div class="info-box"><span class="info-symbol">↗</span><span>${geometry().roof === "arch"
        ? "O modelo mostra as paredes e as partes do arco (6 partes a 90°, 4 faixas a 0°); as cores seguem Cp = Cpe − Cpi. Arraste para girar."
        : "As zonas e pressões estão representadas no modelo ao lado. Arraste-o para girar; use a tabela para consultar os valores numéricos."}</span></div>`;
    }
    content.innerHTML = `${sectionCard("chart", "Resultados e combinações", "Velocidade característica, pressão dinâmica e pressões por zona.", `
      <div class="result-hero"><div><span>Pressão dinâmica · q</span><strong>${displayPressure(r.q)}</strong></div><div class="hero-equation">Vk = V₀ · S₁ · S₂ · S₃<br>q = 0,613 · Vk² / 1000</div></div>
      <div class="metric-grid">
        ${metricCard("Velocidade característica · Vk", fmt(r.vk, 2), "m/s")}
        ${metricCard("Pressão dinâmica · q", displayPressure(r.q), "", "accent")}
        ${metricCard("Pressão para vedações · 0,613·(0,92·Vk)²", displayPressure(r.qVedacao))}
        ${metricCard("Sucção máxima", suctionMax == null ? "—" : displayPressure(suctionMax))}
      </div>
      <div class="direction-tabs"><button type="button" data-direction="90" class="${dir === 90 ? "active" : ""}">Vento a 90°</button><button type="button" data-direction="0" class="${dir === 0 ? "active" : ""}">Vento a 0°</button></div>
      <div class="result-mode-tabs">${tabs.map(([id, label]) => `<button type="button" data-result-mode="${id}" class="${state.resultMode === id ? "active" : ""}">${label}</button>`).join("")}</div>
      <div class="section-title">${dir}° · ${dir === 90 ? "perpendicular" : "paralelo"} ${geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</div>
      ${modeContent}
      <div class="info-box"><span class="info-symbol">!</span><span>${cpeNote(dir)} Linhas com “—” precisam de coeficiente verificado. Não some a força de atrito da incidência paralela às pressões da incidência perpendicular.</span></div>
      ${warningBox(normativeWarnings())}
      <div class="print-actions" style="display:flex;align-items:center;gap:10px;margin-top:13px"><button id="print-button" type="button" class="btn btn-primary">${icon("print")} <span>Gerar memorial PDF</span></button><span class="hint" style="margin:0">Na janela de impressão, selecione “Salvar como PDF”.</span></div>
    `)}`;
    content.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => {
      state.direction = Number(button.dataset.direction);
      JW.persistState();
      JW.render();
    }));
    content.querySelectorAll("[data-result-mode]").forEach(button => button.addEventListener("click", () => {
      state.resultMode = button.dataset.resultMode;
      JW.persistState();
      JW.render();
    }));
    const printButton = byId("print-button");
    if (printButton) printButton.addEventListener("click", () => JW.openMemorial && JW.openMemorial());
  }

  JW.bind = bind;
  JW.bindLength = bindLength;
  JW.stepProject = stepProject;
  JW.stepLocation = stepLocation;
  JW.stepFactors = stepFactors;
  JW.stepGeometry = stepGeometry;
  JW.stepCoefficients = stepCoefficients;
  JW.stepResults = stepResults;
  JW.directionSummary = directionSummary;
  JW.renderers = [stepProject, stepLocation, stepFactors, stepGeometry, stepCoefficients, stepResults];
})(typeof globalThis !== "undefined" ? globalThis : this);
