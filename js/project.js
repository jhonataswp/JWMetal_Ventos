/* ==========================================================================
   JW Metálica — projeto, arquivos .vjw, diálogos e referência normativa
   ========================================================================== */
(function (global) {
  "use strict";

  const JW = global.JW;
  const { byId, escapeHtml, notify, fmt } = JW;

  let projectDialogMode = "new";
  let confirmResolver = null;

  /* ------------------------------------------------------------------------
     Diálogos
     ------------------------------------------------------------------------ */
  function openDialog(id) {
    const dialog = byId(id);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(id) {
    const dialog = byId(id);
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function confirmAction(options = {}) {
    const dialog = byId("confirm-dialog");
    if (!dialog) return Promise.resolve(false);
    byId("confirm-title").textContent = options.title || "Confirmar ação";
    byId("confirm-message").textContent = options.message || "Deseja continuar?";
    const ok = byId("confirm-ok");
    ok.textContent = options.okLabel || "Confirmar";
    ok.className = `btn ${options.tone === "primary" ? "btn-primary" : "btn-danger"}`;
    openDialog("confirm-dialog");
    return new Promise(resolve => { confirmResolver = resolve; });
  }

  function resolveConfirm(value) {
    if (!confirmResolver) return;
    const resolve = confirmResolver;
    confirmResolver = null;
    closeDialog("confirm-dialog");
    resolve(value);
  }

  /* ------------------------------------------------------------------------
     Projeto — novo / editar
     ------------------------------------------------------------------------ */
  function projectMetaFromForm() {
    return {
      project: byId("np-project").value.trim(),
      client: byId("np-client").value.trim(),
      address: byId("np-address").value.trim(),
      responsible: byId("np-responsible").value.trim(),
      crea: byId("np-crea").value.trim(),
      date: byId("np-date").value || JW.todayISO(),
      code: byId("np-code").value.trim(),
      revision: byId("np-revision").value.trim() || "R00",
    };
  }

  function openProjectDialog(mode = "new") {
    projectDialogMode = mode === "edit" ? "edit" : "new";
    const state = JW.state;
    byId("project-dialog-kicker").textContent = projectDialogMode === "edit" ? "Dados da obra" : "Novo projeto";
    byId("project-dialog-title").textContent = projectDialogMode === "edit" ? "Editar dados da obra" : "Novo projeto";
    byId("np-submit").textContent = projectDialogMode === "edit" ? "Salvar dados" : "Criar projeto";
    byId("np-project").value = projectDialogMode === "edit" ? (state.project || "") : "";
    byId("np-client").value = projectDialogMode === "edit" ? (state.client || "") : "";
    byId("np-address").value = projectDialogMode === "edit" ? (state.address || "") : "";
    byId("np-responsible").value = projectDialogMode === "edit" ? (state.responsible || "") : "";
    byId("np-crea").value = projectDialogMode === "edit" ? (state.crea || "") : "";
    byId("np-date").value = projectDialogMode === "edit" ? (state.date || JW.todayISO()) : JW.todayISO();
    byId("np-code").value = projectDialogMode === "edit" ? (state.code || "") : "";
    byId("np-revision").value = projectDialogMode === "edit" ? (state.revision || "R00") : "R00";
    const clearRow = byId("np-clear-row");
    if (clearRow) clearRow.hidden = projectDialogMode === "edit";
    const clear = byId("np-clear");
    if (clear) clear.checked = projectDialogMode === "new";
    openDialog("project-dialog");
    setTimeout(() => byId("np-project")?.focus(), 60);
  }

  async function submitProjectForm(event) {
    event.preventDefault();
    const meta = projectMetaFromForm();
    if (!meta.project) {
      byId("np-project").classList.add("is-invalid");
      byId("np-project").focus();
      notify("Informe o nome da obra para continuar.", "error");
      return;
    }
    byId("np-project").classList.remove("is-invalid");

    if (projectDialogMode === "edit") {
      Object.assign(JW.state, meta);
      JW.persistState();
      closeDialog("project-dialog");
      JW.render();
      notify("Dados da obra atualizados.", "success");
      return;
    }

    const clear = byId("np-clear");
    const shouldClear = Boolean(clear && clear.checked);
    if (shouldClear) {
      const confirmed = await confirmAction({
        title: "Criar novo projeto",
        message: "Os parâmetros, coeficientes e cálculos do projeto atual serão apagados deste navegador. Esta ação não pode ser desfeita.",
        okLabel: "Criar novo projeto",
      });
      if (!confirmed) return;
    }

    const fresh = shouldClear ? JW.defaultState() : structuredClone(JW.state);
    Object.assign(fresh, meta);
    fresh.fileName = "";
    JW.replaceState(fresh);
    JW.setStep(0);
    JW.persistState();
    closeDialog("project-dialog");
    JW.render();
    notify(shouldClear
      ? "Novo projeto criado. Preencha a localização para calcular."
      : "Novo projeto criado mantendo os parâmetros de cálculo atuais.", "success");
  }

  /* ------------------------------------------------------------------------
     Exportação / importação .vjw
     ------------------------------------------------------------------------ */
  function exportFileName() {
    const name = JW.currentFileName();
    return /\.vjw$/i.test(name) ? name : `${name}.vjw`;
  }

  function exportProject() {
    const payload = {
      schema: JW.APP.schema,
      application: `${JW.APP.name} — ${JW.APP.module}`,
      version: JW.APP.version,
      norm: JW.APP.norm,
      savedAt: new Date().toISOString(),
      view: { yaw: JW.getModelYaw() },
      project: JW.state,
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    JW.state.fileName = anchor.download;
    JW.persistState();
    JW.updateHeader();
    JW.updateStatusBar();
    notify(`Projeto exportado como ${anchor.download}.`, "success");
  }

  function validateProjectPayload(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("O arquivo não contém um objeto de projeto válido.");
    }
    const nested = value => value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const candidate = nested(data.project) || nested(data.state) || nested(data.data) || data;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Estrutura do projeto não reconhecida.");
    }
    const recognizable = ["project", "v0", "a", "b", "h", "roof", "faces", "zones", "city"]
      .some(key => Object.prototype.hasOwnProperty.call(candidate, key));
    if (!recognizable) throw new Error("O arquivo não contém os campos esperados de um projeto de vento.");
    return candidate;
  }

  async function importProjectFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("O conteúdo não é um JSON válido.");
      }
      const candidate = validateProjectPayload(data);
      const next = JW.migrateState(candidate);
      next.fileName = /\.vjw$/i.test(file.name) ? file.name : `${file.name}.vjw`;
      const importedYaw = Number(data && data.view && data.view.yaw);
      if (Number.isFinite(importedYaw)) next.modelYaw = importedYaw;
      JW.replaceState(next);
      JW.setStep(0);
      JW.persistState();
      JW.render();
      notify(`Projeto importado: ${next.project || file.name}.`, "success");
    } catch (error) {
      notify(`Falha ao importar: ${error.message}`, "error");
    } finally {
      const input = byId("import-file");
      if (input) input.value = "";
    }
  }

  /* ------------------------------------------------------------------------
     Reset de parâmetros
     ------------------------------------------------------------------------ */
  async function resetParameters() {
    const confirmed = await confirmAction({
      title: "Resetar parâmetros",
      message: "Os parâmetros de localização, fatores, geometria, aberturas e coeficientes voltam aos valores padrão. Os dados da obra e do responsável técnico são preservados.",
      okLabel: "Resetar parâmetros",
    });
    if (!confirmed) return;
    const state = JW.state;
    const keep = {};
    ["project", "client", "address", "responsible", "crea", "date", "code", "revision", "notes",
      "fileName", "theme", "lengthUnit", "pressureUnit", "showNorm"].forEach(key => { keep[key] = state[key]; });
    const fresh = JW.defaultState();
    Object.assign(fresh, keep);
    JW.replaceState(fresh);
    JW.setStep(0);
    JW.persistState();
    JW.render();
    notify("Parâmetros de cálculo restaurados.", "success");
  }

  /* ------------------------------------------------------------------------
     Configurações
     ------------------------------------------------------------------------ */
  function openSettings() {
    const state = JW.state;
    document.querySelectorAll('input[name="setting-theme"]').forEach(input => { input.checked = input.value === state.theme; });
    document.querySelectorAll('input[name="setting-length"]').forEach(input => { input.checked = input.value === (state.lengthUnit || "m"); });
    document.querySelectorAll('input[name="setting-pressure"]').forEach(input => { input.checked = input.value === (state.pressureUnit || "kN/m²"); });
    const showNorm = byId("setting-show-norm");
    if (showNorm) showNorm.checked = state.showNorm !== false;
    openDialog("settings-dialog");
  }

  function setupSettings() {
    document.querySelectorAll('input[name="setting-theme"]').forEach(input => input.addEventListener("change", () => {
      JW.state.theme = input.value === "dark" ? "dark" : "light";
      JW.applyTheme();
      JW.persistState();
    }));
    document.querySelectorAll('input[name="setting-length"]').forEach(input => input.addEventListener("change", () => {
      JW.state.lengthUnit = input.value;
      JW.persistState();
      JW.render();
    }));
    document.querySelectorAll('input[name="setting-pressure"]').forEach(input => input.addEventListener("change", () => {
      JW.state.pressureUnit = input.value;
      JW.persistState();
      JW.render();
    }));
    const showNorm = byId("setting-show-norm");
    if (showNorm) showNorm.addEventListener("change", () => {
      JW.state.showNorm = showNorm.checked;
      JW.persistState();
      JW.render();
    });
  }

  /* ------------------------------------------------------------------------
     Referência normativa
     ------------------------------------------------------------------------ */
  const NORM_MAP = {
    1: [2],
    2: [3],
    3: [0, 1],
    4: [4, 5],
    5: [6],
  };

  function normTableHtml(id) {
    const NB = global.NormaABNT;
    if (!NB) return "";
    if (id === "t1") {
      return `<div class="norm-table"><table><thead><tr><th>Categoria</th><th>Classe A · bₘ / p</th><th>Classe B · bₘ / p</th><th>Classe C · bₘ / p</th><th>zᵍ (m)</th></tr></thead><tbody>
        ${NB.roughness.map(item => `<tr><td>${escapeHtml(item.name)}</td>${item.rows.map(row => `<td>${fmt(row[0], 2)} / ${fmt(row[1], 3)}</td>`).join("")}<td>${fmt(item.zg, 0)}</td></tr>`).join("")}
      </tbody></table></div>`;
    }
    if (id === "t2") {
      return `<div class="norm-table"><table><thead><tr><th>Classe</th><th>Maior dimensão frontal</th><th>Fr</th></tr></thead><tbody>
        <tr><td>A</td><td>até 20 m</td><td>${fmt(NB.frByClass[0], 2)}</td></tr>
        <tr><td>B</td><td>20 a 50 m</td><td>${fmt(NB.frByClass[1], 2)}</td></tr>
        <tr><td>C</td><td>acima de 50 m</td><td>${fmt(NB.frByClass[2], 2)}</td></tr>
      </tbody></table></div>`;
    }
    if (id === "t4") {
      return `<div class="norm-table"><table><thead><tr><th>Grupo</th><th>S₃</th><th>Tp (anos)</th><th>Uso típico</th></tr></thead><tbody>
        ${NB.groups.map(group => `<tr><td>${escapeHtml(group.name)}</td><td>${fmt(group.factor, 2)}</td><td>${group.returnPeriod}</td><td>${escapeHtml(group.description)}</td></tr>`).join("")}
      </tbody></table></div>`;
    }
    if (id === "t6") {
      return `<div class="norm-table"><table><thead><tr><th>h/b</th><th>a/b</th><th>A1/B1</th><th>A2/B2</th><th>C</th><th>D</th></tr></thead><tbody>
        ${NB.wallTable.map(row => `<tr><td>${fmt(row.hb, 2)}</td><td>${fmt(row.ab, 2)}</td><td>${fmt(row.A1B1, 2)}</td><td>${fmt(row.A2B2, 2)}</td><td>${fmt(row.C, 2)}</td><td>${fmt(row.D, 2)}</td></tr>`).join("")}
      </tbody></table></div>`;
    }
    if (id === "t6c") {
      return `<div class="norm-table"><table><thead><tr><th>Proporção</th><th>Barlavento</th><th>Alta sucção</th></tr></thead><tbody>
        ${[1, 1.5, 2, 3, 6].map((ratio, i) => `<tr><td>${ratio}</td><td>${NB.dominantBarlaventoTable[i] ? fmt(NB.dominantBarlaventoTable[i][1], 2) : "—"}</td><td>${NB.dominantSuctionTable[i] ? fmt(NB.dominantSuctionTable[i][1], 2) : "—"}</td></tr>`).join("")}
      </tbody></table></div>`;
    }
    return "";
  }

  function normReferenceHtml(stepIndex) {
    const NB = global.NormaABNT;
    if (!NB || !Array.isArray(NB.etapas)) return "";
    const indexes = NORM_MAP[stepIndex] || [];
    if (!indexes.length) return "";
    const blocks = indexes.map(index => {
      const etapa = NB.etapas[index];
      if (!etapa) return "";
      const tableBlocks = (etapa.tabelas || []).map(id => {
        const table = NB.tabelas[id];
        if (!table) return "";
        return `<div class="norm-table-block"><strong>${escapeHtml(table.titulo)}</strong><p class="norm-meta">${escapeHtml(table.clausula)}</p><p>${escapeHtml(table.oque)}</p><p>${escapeHtml(table.como)}</p>${normTableHtml(id)}</div>`;
      }).join("");
      return `<div class="norm-etapa"><h3>${escapeHtml(etapa.titulo)}</h3><ul class="norm-notes">${etapa.notas.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>${tableBlocks}</div>`;
    }).join("");
    return `<details class="norm-ref" open><summary>Referência normativa · ABNT NBR 6123:2023</summary>${blocks}</details>`;
  }

  function openNormDialog() {
    const NB = global.NormaABNT;
    let dialog = byId("norm-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "norm-dialog";
      dialog.className = "modal modal-wide";
      document.body.appendChild(dialog);
      dialog.addEventListener("click", event => {
        if (event.target === dialog) closeDialog("norm-dialog");
      });
    }
    const summary = NB?.resumo || {};
    dialog.innerHTML = `
      <header class="modal-head">
        <div><span class="panel-kicker">ABNT NBR 6123:2023</span><h2>Notas e tabelas normativas</h2></div>
        <button type="button" class="icon-btn" data-close-dialog="norm-dialog" title="Fechar" aria-label="Fechar">${JW.icon("close")}</button>
      </header>
      <div class="modal-body">
        <div class="norm-slot">
          <div class="norm-ref">
            <h3>${escapeHtml(summary.titulo || "Resumo da NBR 6123:2023")}</h3>
            <p>${escapeHtml(summary.escopo || "")}</p>
            <h3>Fluxo de cálculo</h3>
            <ol>${(summary.fluxo || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
            <p><strong>Classes:</strong> ${escapeHtml(summary.classes || "")}</p>
            <p><strong>Cpi:</strong> ${escapeHtml(summary.cpi || "")}</p>
            <p><strong>Permeabilidade:</strong> ${escapeHtml(summary.permeabilidade || "")}</p>
            <p><strong>Unidades:</strong> ${escapeHtml(summary.unidades || "")}</p>
            <p class="norm-alert">${escapeHtml(summary.alerta || "")}</p>
          </div>
          ${[0, 1, 2, 3, 4, 5, 6].map(index => {
            const etapa = NB?.etapas?.[index];
            if (!etapa) return "";
            return `<div class="norm-ref"><h3>${escapeHtml(etapa.titulo)}</h3><ul class="norm-notes">${etapa.notas.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>${(etapa.tabelas || []).map(id => {
              const table = NB.tabelas[id];
              return table ? `<div class="norm-table-block"><strong>${escapeHtml(table.titulo)}</strong><p>${escapeHtml(table.oque)}</p></div>` : "";
            }).join("")}</div>`;
          }).join("")}
        </div>
      </div>
      <footer class="modal-foot"><button type="button" class="btn btn-primary" data-close-dialog="norm-dialog">Fechar</button></footer>`;
    dialog.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog("norm-dialog")));
    openDialog("norm-dialog");
  }

  /* ------------------------------------------------------------------------
     Ligações de diálogo
     ------------------------------------------------------------------------ */
  function setupDialogs() {
    document.querySelectorAll("[data-close-dialog]").forEach(button => {
      button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
    });
    ["project-dialog", "settings-dialog", "help-dialog", "memorial-dialog", "confirm-dialog", "norm-dialog"].forEach(id => {
      const dialog = byId(id);
      if (!dialog) return;
      dialog.addEventListener("click", event => {
        if (event.target !== dialog) return;
        if (id === "confirm-dialog") resolveConfirm(false);
        else closeDialog(id);
      });
    });
    const form = byId("project-form");
    if (form) form.addEventListener("submit", submitProjectForm);

    const confirmOk = byId("confirm-ok");
    const confirmCancel = byId("confirm-cancel");
    const confirmX = byId("confirm-x");
    if (confirmOk) confirmOk.addEventListener("click", () => resolveConfirm(true));
    if (confirmCancel) confirmCancel.addEventListener("click", () => resolveConfirm(false));
    if (confirmX) confirmX.addEventListener("click", () => resolveConfirm(false));
    const confirmDialog = byId("confirm-dialog");
    if (confirmDialog) confirmDialog.addEventListener("cancel", event => { event.preventDefault(); resolveConfirm(false); });

    const memorialDialog = byId("memorial-dialog");
    if (memorialDialog) memorialDialog.addEventListener("close", () => document.body.classList.remove("print-memorial"));
  }

  Object.assign(JW, {
    openDialog, closeDialog, confirmAction, openProjectDialog, exportProject, importProjectFile,
    resetParameters, openSettings, setupSettings, setupDialogs, normReferenceHtml, openNormDialog,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
