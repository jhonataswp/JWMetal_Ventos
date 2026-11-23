/* ==========================================================================
   JW Metálica — memorial descritivo (pré-visualização e impressão A4)
   ========================================================================== */
(function (global) {
  "use strict";

  const JW = global.JW;
  const { byId, escapeHtml, fmt, displayPressure, pressureValue } = JW;

  const TOTAL_PAGES = 5;

  function dateLabel(value) {
    if (!value) return "—";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }
  function orDash(value) {
    const text = String(value ?? "").trim();
    return text || "—";
  }
  function reportHeader(page) {
    const state = JW.state;
    const code = [state.code, state.revision].filter(Boolean).join(" · ") || "—";
    return `<header class="report-header">
      <div class="report-brand">
        <img src="./assets/logo-jw.svg" alt="JW Metálica">
        <div><strong>JW METÁLICA</strong><span>Engenharia de estruturas metálicas<br>Módulo Cálculo de Vento</span></div>
      </div>
      <div class="report-doc">
        <span>Memorial descritivo</span>
        <strong>${escapeHtml(code)}</strong>
        <span style="margin-top:1mm">ABNT NBR 6123:2023</span>
      </div>
    </header>`;
  }
  function reportFooter(page) {
    const state = JW.state;
    return `<footer class="report-footer">
      <span><strong>JW Metálica</strong> · Módulo Cálculo de Vento</span>
      <span>${escapeHtml(orDash(state.project))}${state.code ? ` · ${escapeHtml(state.code)}` : ""}</span>
      <span>Página ${page} de ${TOTAL_PAGES}</span>
    </footer>`;
  }
  function page(content, pageNumber) {
    return `<article class="report-page">${reportHeader(pageNumber)}${content}${reportFooter(pageNumber)}</article>`;
  }

  function summaryTable() {
    const state = JW.state;
    const city = state.city ? `${state.city}${state.uf ? ` — ${state.uf}` : ""}` : "";
    const location = city || state.address || "";
    const rows = [
      ["Obra", state.project],
      ["Cliente", state.client],
      ["Localização", location],
      ["Endereço", state.address],
      ["Responsável técnico", state.responsible],
      ["CREA", state.crea],
      ["Data", dateLabel(state.date)],
      ["Código / revisão", [state.code, state.revision].filter(Boolean).join(" · ")],
      ["Norma", "ABNT NBR 6123:2023 — Forças devidas ao vento em edificações"],
    ];
    return `<table class="report-table report-summary"><tbody>
      ${rows.map(([label, value]) => `<tr><td class="lbl">${escapeHtml(label)}</td><td>${escapeHtml(orDash(value))}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function inputTable() {
    const state = JW.state;
    const g = JW.geometry();
    const unit = state.lengthUnit || "m";
    const geoRows = [
      ["Tipologia da cobertura", JW.roofLabel()],
      ["Comprimento a", `${fmt(JW.displayLength(g.a), 2)} ${unit}`],
      ["Vão / largura b", `${fmt(JW.displayLength(g.b), 2)} ${unit}`],
      ["Pé-direito H", `${fmt(JW.displayLength(g.h), 2)} ${unit}`],
      g.roof === "arch"
        ? ["Flecha f", `${fmt(JW.displayLength(Number(state.flecha)), 2)} ${unit}`]
        : ["Inclinação α", `${fmt(g.alpha, 1)}°`],
      ["Altura total", `${fmt(JW.displayLength(g.totalHeight), 2)} ${unit}`],
      ["Relações a/b · h/b", `${fmt(g.aOverB, 2)} · ${fmt(g.hOverB, 2)}`],
    ];
    return `<table class="report-table"><thead><tr><th>Parâmetro</th><th>Valor</th></tr></thead><tbody>
      ${geoRows.map(([label, value]) => `<tr><td class="lbl">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function windTable() {
    const r = JW.windResult();
    const state = JW.state;
    const rows = [
      ["Velocidade básica V₀", `${fmt(state.v0, 1)} m/s`],
      ["Fator topográfico S₁", fmt(r.s1, 3)],
      ["Fator de rugosidade S₂", fmt(r.s2, 3)],
      ["Fator estatístico S₃", fmt(r.s3, 2)],
      ["Velocidade característica Vk = V₀ · S₁ · S₂ · S₃", `${fmt(r.vk, 2)} m/s`],
      ["Pressão dinâmica q = 0,613 · Vk² / 1000", displayPressure(r.q)],
      ["Pressão para vedações (0,92 · S₃)", displayPressure(r.qVedacao)],
      ["Categoria do terreno", r.category.name],
      ["Classe da edificação", `${["A", "B", "C"][r.cls]} · altura crítica z = ${fmt(JW.displayLength(r.z), 2)} ${state.lengthUnit || "m"}`],
      ["Grupo de utilização", `${r.group.name} · Tp ${r.group.returnPeriod} anos`],
    ];
    return `<table class="report-table"><thead><tr><th>Grandeza</th><th class="num">Valor</th></tr></thead><tbody>
      ${rows.map(([label, value]) => `<tr><td class="lbl">${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function cpeTable(zones) {
    return `<table class="report-table"><thead><tr><th>Zona</th><th>Superfície</th><th class="num">Cpe</th></tr></thead><tbody>
      ${zones.map(zone => `<tr><td><strong>${escapeHtml(zone.id || "—")}</strong></td><td>${escapeHtml(zone.name || "")}</td><td class="num">${zone.cpe == null ? "—" : fmt(zone.cpe, 2)}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function cpiTable() {
    const c90 = JW.cpiResult(90);
    const c0 = JW.cpiResult(0);
    const cases = [
      ...(c90.cases || []).map(item => ({ ...item, dir: "90°" })),
      ...(c0.cases || []).map(item => ({ ...item, dir: "0°" })),
    ];
    const rows = cases.length ? cases : [
      { dir: "—", name: "Caso único", clause: c90.clause, description: c90.description, selected: c90.selected, candidates: c90.candidates },
    ];
    return `<table class="report-table"><thead><tr><th>Incidência</th><th>Caso / cláusula</th><th>Critério</th><th class="num">Cpi adotado</th></tr></thead><tbody>
      ${rows.map(item => `<tr><td>${escapeHtml(item.dir)}</td><td>${escapeHtml(item.name)}<br><span class="norm-meta">[${escapeHtml(item.clause || "—")}]</span></td><td>${escapeHtml(item.description || "")}</td><td class="num">${item.selected == null ? "—" : fmt(item.selected, 2)}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function resultTable(zones, cpi, result) {
    return `<table class="report-table"><thead><tr><th>Zona</th><th>Superfície</th><th class="num">Cpe</th><th class="num">Cp = Cpe − Cpi</th><th class="num">Δp sucção</th><th class="num">Δp sobrepressão</th></tr></thead><tbody>
      ${zones.map(zone => {
        const cpe = zone.cpe == null ? null : Number(zone.cpe);
        if (cpe == null || !Number.isFinite(cpe)) {
          return `<tr><td><strong>${escapeHtml(zone.id || "—")}</strong></td><td>${escapeHtml(zone.name || "")}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
        }
        const cps = cpi.candidates.map(value => cpe - value);
        const suction = Math.min(...cps) * result.q;
        const over = Math.max(...cps) * result.q;
        return `<tr><td><strong>${escapeHtml(zone.id || "—")}</strong></td><td>${escapeHtml(zone.name || "")}</td><td class="num">${fmt(cpe, 2)}</td><td class="num">${fmt(Math.min(...cps), 2)} a ${fmt(Math.max(...cps), 2)}</td><td class="num">${suction < 0 ? `${pressureValue(suction)} ${JW.pressureUnit()}` : "0"}</td><td class="num">${over > 0 ? `${pressureValue(over)} ${JW.pressureUnit()}` : "0"}</td></tr>`;
      }).join("")}
    </tbody></table>`;
  }

  function combinationTable() {
    const d90 = JW.directionSummary(90);
    const d0 = JW.directionSummary(0);
    const suctionValues = [d90.suction, d0.suction].filter(Number.isFinite);
    const overValues = [d90.overpressure, d0.overpressure].filter(Number.isFinite);
    const envelope = {
      vk: Math.max(d90.result.vk, d0.result.vk),
      q: Math.max(d90.result.q, d0.result.q),
      suction: suctionValues.length ? Math.min(...suctionValues) : null,
      overpressure: overValues.length ? Math.max(...overValues) : null,
    };
    const row = (name, item) => `<tr><td class="lbl">${escapeHtml(name)}</td><td class="num">${fmt(item.vk, 2)} m/s</td><td class="num">${displayPressure(item.q)}</td><td class="num">${item.suction == null ? "—" : displayPressure(item.suction)}</td><td class="num">${item.overpressure == null ? "—" : displayPressure(item.overpressure)}</td></tr>`;
    return `<table class="report-table"><thead><tr><th>Combinação</th><th class="num">Vk</th><th class="num">q</th><th class="num">Sucção máxima</th><th class="num">Sobrepressão máxima</th></tr></thead><tbody>
      ${row("Vento a 90° — perpendicular à cumeeira", d90)}
      ${row("Vento a 0° — paralelo à cumeeira", d0)}
      ${row("Envoltória de projeto", envelope)}
    </tbody></table>`;
  }

  function modelSnapshot() {
    const source = byId("wind-model");
    if (!source) return "";
    const clone = source.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("aria-label");
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    return `<figure class="report-figure">
      <div class="report-model-wrap">${clone.outerHTML}</div>
      <figcaption>Figura 1 — Modelo tridimensional esquemático das zonas de pressão e direção do vento (${escapeHtml(JW.roofLabel())}).</figcaption>
    </figure>`;
  }

  function warningsBlock() {
    const warnings = JW.normativeWarnings();
    const issues = Object.values(JW.collectValidation());
    const all = [...warnings, ...issues.map(item => `Pendência de preenchimento: ${item}`)];
    if (!all.length) {
      return `<div class="report-note"><strong>Verificações normativas:</strong> não foram identificados avisos automáticos para os parâmetros informados. A ausência de avisos não dispensa a revisão do engenheiro responsável.</div>`;
    }
    return `<div class="report-note"><strong>Verificações e pendências:</strong><ul>${all.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  }

  function signatureBlock() {
    const state = JW.state;
    const place = state.city ? `${state.city}${state.uf ? ` — ${state.uf}` : ""}` : (state.address || "");
    return `<div class="report-signature">
      <div class="report-signature-box">
        <div class="report-signature-line"></div>
        <strong>${escapeHtml(orDash(state.responsible))}</strong>
        <span>Responsável técnico${state.crea ? ` · CREA ${escapeHtml(state.crea)}` : ""}</span>
        <div class="report-place-date">${escapeHtml(place ? `${place}, ` : "")}${escapeHtml(dateLabel(state.date))}</div>
      </div>
    </div>`;
  }

  function buildMemorial() {
    const state = JW.state;
    const r = JW.windResult(90);
    const zones90 = JW.zonesFor(90);
    const zones0 = JW.zonesFor(0);
    const cpi90 = JW.cpiResult(90);
    const cpi0 = JW.cpiResult(0);

    const firstPage = page(`
      <h1 class="report-title">MEMORIAL DESCRITIVO<span>Ação do vento em edificação</span></h1>
      <p class="report-subtitle">${escapeHtml(orDash(state.project))} · ABNT NBR 6123:2023</p>
      <h2>1. Identificação e objetivo</h2>
      ${summaryTable()}
      <p>Este memorial documenta a determinação das forças devidas à ação estática do vento para a edificação identificada, conforme a ABNT NBR 6123:2023. O cálculo abrange a velocidade básica V₀, os fatores S₁, S₂ e S₃, a velocidade característica Vk, a pressão dinâmica q, os coeficientes de pressão externa Cpe e interna Cpi e as pressões efetivas por zona.</p>
      <h2>2. Dados de entrada</h2>
      ${inputTable()}
      <div class="report-note"><strong>Premissa de cálculo:</strong> Vk = V₀ · S₁ · S₂ · S₃ e q = 0,613 · Vk² / 1000, com Vk em m/s e q em kN/m². A pressão para vedações adota o fator 0,92 · S₃, conforme nota da Tabela 4.</div>
      ${state.notes ? `<h3>Observações do projeto</h3><p>${escapeHtml(state.notes)}</p>` : ""}
    `, 1);

    const secondPage = page(`
      <h2>3. Parâmetros do vento</h2>
      ${windTable()}
      <div class="report-formula">Vk = V₀ · S₁ · S₂ · S₃ = ${fmt(state.v0, 1)} · ${fmt(r.s1, 3)} · ${fmt(r.s2, 3)} · ${fmt(r.s3, 2)} = ${fmt(r.vk, 2)} m/s<br>q = 0,613 · Vk² / 1000 = ${displayPressure(r.q)}</div>
      <div class="report-note"><strong>Fatores aplicados:</strong> S₁ considera a topografia local; S₂ é obtido pela categoria de rugosidade, classe da edificação e altura crítica z; S₃ corresponde ao grupo de utilização e ao período de retorno adotado. A altura crítica é a que produz o maior produto S₁ · S₂.</div>
    `, 2);

    const thirdPage = page(`
      <h2>4. Coeficientes de pressão externa (Cpe)</h2>
      <h3>4.1 Vento a 90° — perpendicular ${JW.geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</h3>
      ${cpeTable(zones90)}
      <h3>4.2 Vento a 0° — paralelo ${JW.geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</h3>
      ${cpeTable(zones0)}
      <div class="report-note">${escapeHtml(JW.cpeNote(90))}</div>
      <h2>5. Coeficiente de pressão interna (Cpi)</h2>
      ${cpiTable()}
    `, 3);

    const fourthPage = page(`
      <h2>6. Resultados por zona</h2>
      <h3>6.1 Vento a 90° — perpendicular ${JW.geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</h3>
      ${resultTable(zones90, cpi90, r)}
      <h3>6.2 Vento a 0° — paralelo ${JW.geometry().roof === "arch" ? "à geratriz" : "à cumeeira"}</h3>
      ${resultTable(zones0, cpi0, JW.windResult(0))}
      <div class="report-note">Cp = Cpe − Cpi. Valores negativos indicam sucção e valores positivos indicam sobrepressão. As faixas de Cp refletem os casos de Cpi aplicáveis a cada incidência.</div>
    `, 4);

    const fifthPage = page(`
      <h2>7. Combinações e considerações finais</h2>
      ${combinationTable()}
      <div class="report-note"><strong>Critério de combinação:</strong> adota-se, para cada superfície, a envoltória das incidências de 90° e 0°. Não se somam as forças de atrito da incidência paralela às pressões da incidência perpendicular. Ações locais de borda e canto exigem verificação complementar.</div>
      ${warningsBlock()}
      ${modelSnapshot()}
      <div class="report-note"><strong>Responsabilidade técnica:</strong> este memorial é um apoio ao cálculo e deve ser revisado por profissional habilitado, considerando as particularidades do projeto, as combinações de ações e os demais requisitos aplicáveis.</div>
      ${signatureBlock()}
    `, 5);

    return firstPage + secondPage + thirdPage + fourthPage + fifthPage;
  }

  function openMemorial() {
    const state = JW.state;
    if (!String(state.project || "").trim()) {
      JW.notify("Informe o nome da obra antes de gerar o memorial.", "error");
      JW.goToStep(0);
      return;
    }
    const html = buildMemorial();
    const preview = byId("memorial-preview");
    const print = byId("memorial-print");
    if (preview) { preview.innerHTML = html; preview.scrollTop = 0; }
    if (print) print.innerHTML = html;
    JW.openDialog("memorial-dialog");
  }

  function printMemorial() {
    const print = byId("memorial-print");
    if (!print) return;
    print.innerHTML = buildMemorial();
    document.body.classList.add("print-memorial");
    const cleanup = () => {
      document.body.classList.remove("print-memorial");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    requestAnimationFrame(() => window.print());
  }

  Object.assign(JW, { buildMemorial, openMemorial, printMemorial });
})(typeof globalThis !== "undefined" ? globalThis : this);
