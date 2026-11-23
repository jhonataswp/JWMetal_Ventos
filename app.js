/* ==========================================================================
   JW Metálica — bootstrap da interface e interações globais
   ========================================================================== */
(function (global) {
  "use strict";

  const JW = global.JW;
  const { byId } = JW;

  /* ------------------------------------------------------------------------
     Renderização da etapa ativa
     ------------------------------------------------------------------------ */
  function updateStepChrome() {
    const step = JW.getStep();
    const meta = JW.STEPS[step];
    if (!meta) return;
    const kicker = byId("step-kicker");
    const title = byId("step-title");
    const description = byId("step-description");
    if (kicker) kicker.textContent = `Etapa ${String(step + 1).padStart(2, "0")} · ${meta.short}`;
    if (title) title.textContent = meta.title;
    if (description) description.textContent = meta.description;
    const back = byId("back-button");
    if (back) back.disabled = step === 0;
    const next = byId("next-button");
    if (next) {
      const label = next.querySelector("span");
      if (label) label.textContent = step === JW.STEPS.length - 1 ? "Concluir" : "Continuar";
      next.disabled = false;
    }
    const hint = byId("footer-hint");
    if (hint) {
      hint.textContent = step === JW.STEPS.length - 1
        ? "Revise os coeficientes e gere o memorial descritivo."
        : "Os dados são processados localmente neste navegador.";
    }
  }

  function render() {
    const step = JW.getStep();
    const renderer = JW.renderers[step];
    if (typeof renderer === "function") renderer();
    const content = byId("step-content");
    if (content && JW.state.showNorm) {
      const holder = document.createElement("div");
      holder.className = "norm-slot";
      holder.innerHTML = JW.normReferenceHtml(step);
      if (holder.innerHTML.trim()) content.appendChild(holder);
    }
    JW.renderNav();
    JW.updateNavProgress();
    JW.updateLiveModel();
    JW.updateInspector();
    JW.updateZoneChart();
    JW.applyValidation();
    JW.syncChrome();
    JW.updateUnitButtons();
    updateStepChrome();
  }

  JW.render = render;

  /* ------------------------------------------------------------------------
     Gavetas responsivas
     ------------------------------------------------------------------------ */
  function closeDrawers() {
    document.body.classList.remove("nav-open", "inspector-open");
    const overlay = byId("drawer-overlay");
    if (overlay) overlay.hidden = true;
  }
  JW.closeDrawers = closeDrawers;

  function openDrawer(kind) {
    const className = kind === "nav" ? "nav-open" : "inspector-open";
    const alreadyOpen = document.body.classList.contains(className);
    closeDrawers();
    if (alreadyOpen) return;
    document.body.classList.add(className);
    const overlay = byId("drawer-overlay");
    if (overlay) overlay.hidden = false;
  }

  /* ------------------------------------------------------------------------
     Vista 3D — arraste preservado
     ------------------------------------------------------------------------ */
  function setupModelDrag() {
    const model = byId("wind-model");
    if (!model) return;
    model.addEventListener("pointerdown", event => {
      JW.setModelDragX(event.clientX);
      try { model.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético ou já liberado */ }
    });
    model.addEventListener("pointermove", event => {
      const lastX = JW.getModelDragX();
      if (lastX == null) return;
      JW.setModelYaw(JW.getModelYaw() + (event.clientX - lastX) * .012);
      JW.setModelDragX(event.clientX);
      JW.updateLiveModel();
    });
    const release = () => {
      if (JW.getModelDragX() == null) return;
      JW.setModelDragX(null);
      JW.persistState();
    };
    model.addEventListener("pointerup", release);
    model.addEventListener("pointercancel", release);
  }

  /* ------------------------------------------------------------------------
     Ligações globais
     ------------------------------------------------------------------------ */
  function setupChrome() {
    byId("new-project-button")?.addEventListener("click", () => JW.openProjectDialog("new"));
    byId("edit-project-button")?.addEventListener("click", () => JW.openProjectDialog("edit"));
    byId("project-export-inline")?.addEventListener("click", () => JW.exportProject());

    byId("import-button")?.addEventListener("click", () => byId("import-file")?.click());
    byId("import-file")?.addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (file) JW.importProjectFile(file);
    });
    byId("export-button")?.addEventListener("click", () => JW.exportProject());
    byId("reset-button")?.addEventListener("click", () => JW.resetParameters());
    byId("memorial-button")?.addEventListener("click", () => JW.openMemorial());
    byId("print-memorial-button")?.addEventListener("click", () => JW.printMemorial());
    byId("settings-button")?.addEventListener("click", () => JW.openSettings());
    byId("help-button")?.addEventListener("click", () => JW.openDialog("help-dialog"));
    byId("norm-summary-button")?.addEventListener("click", () => JW.openNormDialog());

    byId("theme-toggle")?.addEventListener("click", () => {
      JW.state.theme = JW.state.theme === "dark" ? "light" : "dark";
      JW.applyTheme();
      JW.persistState();
    });

    document.querySelectorAll("[data-unit-kind]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.unitKind === "length") JW.state.lengthUnit = button.dataset.unitValue;
      else JW.state.pressureUnit = button.dataset.unitValue;
      JW.persistState();
      render();
    }));

    byId("nav-toggle")?.addEventListener("click", () => openDrawer("nav"));
    byId("inspector-toggle")?.addEventListener("click", () => openDrawer("inspector"));
    byId("inspector-close")?.addEventListener("click", closeDrawers);
    byId("drawer-overlay")?.addEventListener("click", closeDrawers);

    byId("back-button")?.addEventListener("click", () => {
      if (JW.getStep() > 0) JW.goToStep(JW.getStep() - 1);
    });
    byId("next-button")?.addEventListener("click", () => {
      if (JW.getStep() < JW.STEPS.length - 1) JW.goToStep(JW.getStep() + 1);
      else JW.notify("Cálculo concluído. Revise Cpe/Cpi e gere o memorial descritivo.");
    });

    byId("reset-view-button")?.addEventListener("click", () => {
      JW.setModelYaw(-0.6);
      JW.persistState();
      JW.updateLiveModel();
    });

    document.querySelector(".brand")?.addEventListener("click", event => event.preventDefault());

    document.addEventListener("keydown", event => {
      const key = String(event.key || "").toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === "s") {
          event.preventDefault();
          JW.exportProject();
          return;
        }
        if (key === "o") {
          event.preventDefault();
          byId("import-file")?.click();
          return;
        }
      }
      if (key === "escape") closeDrawers();
    });

    window.addEventListener("beforeunload", () => JW.persistState());
    setupModelDrag();
  }

  /* ------------------------------------------------------------------------
     Inicialização
     ------------------------------------------------------------------------ */
  function boot() {
    JW.setStep(0);
    JW.applyTheme();
    JW.setupDialogs();
    JW.setupSettings();
    setupChrome();
    render();
    JW.loadMunicipalities();
    const status = byId("status-autosave");
    if (status) status.textContent = "Salvo localmente";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
