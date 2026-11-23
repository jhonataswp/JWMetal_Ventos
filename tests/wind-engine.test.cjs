const test = require("node:test");
const assert = require("node:assert/strict");
const { calculate, geometry, s1AtHeight, solveBalanceScenarios, cpeBasis, cpeGable, cpeShed, cpeArch, normalWarnings, dominantOpening, dominantCpi } = require("../wind-engine.js");

const example = {
  roof: "gable",
  a: 30,
  b: 15,
  h: 6,
  alpha: 10,
  flecha: 0,
  v0: 30,
  category: "III",
  group: 3,
  manualClass: "",
  topography: "plain",
};

test("manual v1.1.0 two-water reference example reproduces S2, Vk and q", () => {
  const result = calculate(example, 90);
  assert.equal(result.classIndex, 1);
  assert.equal(result.b_m, .94);
  assert.equal(result.fr, .98);
  assert.equal(result.p, .105);
  assert.ok(Math.abs(result.s2 - .892) < .001);
  assert.ok(Math.abs(result.vk - 26.7) < .1);
  assert.ok(Math.abs(result.q - .439) < .001);
});

test("wind direction selects the frontal span for the dimensional class", () => {
  const result90 = calculate(example, 90);
  const result0 = calculate(example, 0);
  assert.equal(result90.classIndex, 1); // a = 30 m
  assert.equal(result0.classIndex, 0);  // b = 15 m
  assert.equal(result0.fr, 1);
});

test("recorded 35 x 12 m, alpha 12° example changes S2 class with wind direction", () => {
  const sample = { ...example, a: 35, b: 12, h: 6, alpha: 12 };
  const perpendicular = calculate(sample, 90);
  const parallel = calculate(sample, 0);
  assert.equal(perpendicular.classIndex, 1);
  assert.equal(parallel.classIndex, 0);
  assert.ok(Math.abs(perpendicular.vk - 26.7) < .1);
  assert.ok(Math.abs(perpendicular.q - .438) < .001);
  assert.ok(Math.abs(parallel.vk - 27.3) < .1);
  assert.ok(Math.abs(parallel.q - .457) < .001);
});

test("user screenshot geometry reproduces directional Vk and q", () => {
  const sample = { ...example, a: 30, b: 12, h: 5, alpha: 12, group: 2 };
  const perpendicular = calculate(sample, 90);
  const parallel = calculate(sample, 0);
  assert.equal(perpendicular.classIndex, 1);
  assert.equal(parallel.classIndex, 0);
  assert.ok(Math.abs(perpendicular.s2 - .877) < .002);
  assert.ok(Math.abs(perpendicular.vk - 27.9) < .1);
  assert.ok(Math.abs(perpendicular.q * 101.97162 - 48.6) < .2);
  assert.ok(Math.abs(parallel.vk - 28.53) < .1);
  assert.ok(Math.abs(parallel.q * 101.97162 - 50.9) < .2);
});

test("gable geometry derives roof rise and total height", () => {
  const result = geometry(example);
  assert.ok(Math.abs(result.rise - 1.322) < .002);
  assert.ok(Math.abs(result.totalHeight - 7.322) < .002);
  assert.equal(result.hOverB, .4); // H is the eaves height, not H + roof rise.
});

test("gable Cpe is selected from Table 6 and Table 7 for both wind directions", () => {
  const cpe90 = cpeGable(example, 90);
  const cpe0 = cpeGable(example, 0);
  assert.deepEqual(cpe90.map(x => [x.id, x.cpe]), [
    ["A", .7], ["B", -.5], ["C", -.9], ["D", -.5], ["E", -1.2], ["F", -.4],
  ]);
  assert.deepEqual(cpe0.map(x => [x.id, x.cpe]), [
    ["A", .7], ["B", -.3], ["C", -.8], ["D", -.4], ["G", -.2], ["E", -.8], ["F", -.6], ["J", -.2],
  ]);
});

test("user screenshot geometry receives interpolated Cpe at 90° and 0°", () => {
  const sample = { ...example, a: 30, b: 12, h: 5, alpha: 12 };
  const cpe90 = cpeGable(sample, 90);
  const cpe0 = cpeGable(sample, 0);
  cpe90.forEach((zone, i) => assert.ok(Math.abs(zone.cpe - [.7, -.5, -.9, -.5, -1.12, -.4][i]) < 1e-12));
  assert.deepEqual(cpe0.map(x => x.cpe), [.7, -.3, -.8, -.4, -.2, -.8, -.6, -.2]);
});

test("gable Cpe selects h/b group from eaves height, not total height", () => {
  const sample = { ...example, a: 35, b: 12, h: 6, alpha: 12 };
  const cpe90 = cpeGable(sample, 90);
  const cpe0 = cpeGable(sample, 0);
  assert.ok(Math.abs(cpe90.find(x => x.id === "E").cpe - (-1.12)) < 1e-12);
  assert.equal(cpe90.find(x => x.id === "F").cpe, -.4);
  assert.equal(cpe0.find(x => x.id === "E").cpe, -.8);
  assert.equal(cpe0.find(x => x.id === "F").cpe, -.6);
  assert.equal(cpe0.find(x => x.id === "J").cpe, -.2);
});

test("gable Cpe switches Table 7 block when the H/b band changes", () => {
  const lowBand = cpeGable({ ...example, a: 35, b: 12, h: 6, alpha: 12 }, 90);
  const nextBand = cpeGable({ ...example, a: 35, b: 12, h: 8, alpha: 12 }, 90);
  assert.ok(Math.abs(lowBand.find(x => x.id === "E").cpe - (-1.12)) < 1e-12);
  assert.ok(Math.abs(nextBand.find(x => x.id === "E").cpe - (-1.06)) < 1e-12);
  assert.equal(nextBand.find(x => x.id === "F").cpe, -.6);
});

test("shed Cpe interpolates the Table 8 rows for both directions", () => {
  const sample = { ...example, roof: "shed", a: 30, b: 15, h: 6, alpha: 15 };
  const cpe90 = cpeShed(sample, 90);
  const cpe0 = cpeShed(sample, 0);
  assert.deepEqual(cpe90.map(x => [x.id, x.cpe]), [
    ["A", .7], ["B", -.5], ["C", -.9], ["D", -.5], ["E", -1], ["F", -1],
  ]);
  assert.deepEqual(cpe0.map(x => [x.id, x.cpe]), [
    ["A", .7], ["B", -.3], ["C", -.8], ["D", -.4], ["G", -.2],
    ["E", -1], ["F", -.5], ["J", -.2],
  ]);
});

test("shed Table 8 rows match the normative table for 5°, 15°, 20°, 25° and 30°", () => {
  const at = (alpha, direction) => cpeShed({ ...example, roof: "shed", a: 30, b: 15, h: 6, alpha }, direction);
  assert.deepEqual(at(5, 90).map(x => x.cpe).slice(4), [-1, -1]);
  assert.equal(at(15, 0).find(x => x.id === "E").cpe, -1);
  assert.equal(at(20, 0).find(x => x.id === "E").cpe, -.9);
  assert.equal(at(25, 0).find(x => x.id === "E").cpe, -.8);
  assert.equal(at(30, 0).find(x => x.id === "E").cpe, -.8);
  assert.equal(at(30, 0).find(x => x.id === "F").cpe, -.5);
});

test("arch Cpe picks the nearest S1 test model for categories I and II", () => {
  const arch = { ...example, category: "I", roof: "arch", a: 30, b: 15, h: 7.5, flecha: 3 };
  const perpendicular = cpeArch(arch, 90).slice(4);
  assert.deepEqual(perpendicular.map(x => x.cpe), [-.9, -.9, -.9, -.7, -.5, -.5]);
  const parallel = cpeArch(arch, 0).slice(5);
  assert.deepEqual(parallel.map(x => x.cpe), [-.8, -.6, -.3, -.2]);
});

test("arch Cpe uses the S2 test series for the other categories", () => {
  const arch = { ...example, category: "III", roof: "arch", a: 30, b: 15, h: 7.5, flecha: 3 };
  const perpendicular = cpeArch(arch, 90).slice(4);
  assert.deepEqual(perpendicular.map(x => x.cpe), [.4, -.6, -1.2, -.9, -.7, -.7]);
  const parallel = cpeArch(arch, 0).slice(5);
  assert.deepEqual(parallel.map(x => x.cpe), [-.8, -.4, -.2, -.2]);
});

test("arch zones keep walls first and the roof last, as the Cpi balance expects", () => {
  const arch = { ...example, category: "III", roof: "arch", a: 30, b: 15, h: 7.5, flecha: 3 };
  const z90 = cpeArch(arch, 90);
  assert.equal(z90.length, 10);
  assert.deepEqual(z90.slice(0, 4).map(x => x.id), ["A", "B", "C", "D"]);
  assert.equal(z90.filter(x => /^E/.test(x.id)).length, 6);
  const z0 = cpeArch(arch, 0);
  assert.equal(z0.length, 9);
  assert.deepEqual(z0.slice(0, 5).map(x => x.id), ["A", "B", "C", "D", "G"]);
  assert.equal(z0.filter(x => /^E/.test(x.id)).length, 4);
});

test("cpeBasis reports the table parameters used in the memorial", () => {
  const gableState = { ...example, roof: "gable", a: 30, b: 15, h: 6, alpha: 10 };
  const gable = cpeBasis(gableState, 90);
  assert.equal(gable.walls.table, "6");
  assert.equal(gable.roof.table, "7");
  assert.ok(Math.abs(gable.roof.efi - cpeGable(gableState, 90)[4].cpe) < 1e-12);
  const archState = { ...example, category: "III", roof: "arch", a: 30, b: 15, h: 7.5, flecha: 3 };
  const arch = cpeBasis(archState, 90);
  assert.equal(arch.roof.table, "18 a 20");
  assert.equal(arch.roof.serie, "S2");
  assert.deepEqual(arch.roof.model.perp, [.4, -.6, -1.2, -.9, -.7, -.7]);
});

test("normative warnings flag geometries outside the Tables 6-8 and 15 ranges", () => {
  assert.deepEqual(normalWarnings({ ...example, a: 30, b: 15, h: 6 }), []);
  assert.ok(normalWarnings({ ...example, a: 30, b: 4, h: 30 }).some(x => /h\/b acima de 6/.test(x)));
  assert.ok(normalWarnings({ ...example, roof: "shed", a: 30, b: 12, h: 30, alpha: 12 }).some(x => /h\/b < 2/.test(x)));
  assert.ok(normalWarnings({ ...example, roof: "shed", a: 30, b: 15, h: 6, alpha: 3 }).some(x => /começa em θ = 5°/.test(x)));
  assert.ok(normalWarnings({ ...example, category: "III", roof: "arch", a: 60, b: 15, h: 6, flecha: 3 }).some(x => /a\/b = 4\.00 fora da faixa/.test(x)));
  assert.deepEqual(normalWarnings({ ...example, category: "III", roof: "arch", a: 75, b: 15, h: 15 / 9, flecha: 5 }).filter(x => /fora da faixa/.test(x)), []);
});

test("sealing pressure uses 0.92·S3 as allowed by Table 4", () => {
  const result = calculate(example, 90);
  assert.ok(Math.abs(result.qVedacao - .613 * Math.pow(.92 * result.vk, 2) / 1000) < 1e-12);
  assert.ok(result.qVedacao < result.q);
});

test("dominant opening follows the normative proportion table", () => {
  assert.deepEqual(dominantOpening({ long1: 10, long2: 0, end1: 0, end2: 0, roof: 0 }), { face: "long1", ratio: 99 });
  assert.deepEqual(dominantOpening({ long1: 20, long2: 10, end1: 0, end2: 0, roof: 0 }), { face: "long1", ratio: 2 });
  assert.equal(dominantOpening({ long1: 10, long2: 10, end1: 0, end2: 0, roof: 0 }), null);
  assert.equal(dominantOpening({ long1: 5, long2: 5, end1: 20, end2: 20, roof: 0 }), null);
  assert.equal(dominantCpi("barlavento", 2), .5);
  assert.equal(dominantCpi("barlavento", 7), .8);
  assert.equal(dominantCpi("suction", .5), -.5);
  assert.ok(Math.abs(dominantCpi("suction", 2) - (-.8 - .1 / 3)) < 1e-12);
});

test("shed Table 8 clamps to tabulated angle endpoints and applies the a/b interpolation", () => {
  const low = cpeShed({ ...example, roof: "shed", a: 22.5, b: 15, h: 6, alpha: 0 }, 0);
  const high = cpeShed({ ...example, roof: "shed", a: 45, b: 15, h: 6, alpha: 45 }, 0);
  assert.equal(low.find(x => x.id === "E").cpe, -1);
  assert.equal(low.find(x => x.id === "F").cpe, -.5);
  assert.equal(low.find(x => x.id === "J").cpe, -.6);
  assert.equal(high.find(x => x.id === "E").cpe, -.8);
  assert.equal(high.find(x => x.id === "F").cpe, -.5);
  assert.equal(high.find(x => x.id === "J").cpe, -.2);
});

test("valley topography uses S1 = 0.90", () => {
  assert.equal(s1AtHeight({ topography: "valley" }, 3), .9);
});

test("flat topography uses S1 = 1.00", () => {
  assert.equal(s1AtHeight({ topography: "plain" }, 3), 1);
});

test("slope interpolation follows the 3°, 6°, 17° and 45° breakpoints", () => {
  const state = { topography: "slope", thetaT: 3, dt: 10 };
  assert.equal(s1AtHeight(state, 4), 1);
  state.thetaT = 6;
  assert.ok(s1AtHeight(state, 4) > 1);
  state.thetaT = 45;
  assert.ok(s1AtHeight(state, 4) >= 1);
});

test("6.3.3 opening-balance envelope matches the video example at 90°", () => {
  const result = solveBalanceScenarios([
    { area: 5, coefficients: [.7] },
    { area: 5, coefficients: [-.5] },
    { area: 20, coefficients: [-.9, -.5] },
    { area: 20, coefficients: [-.9, -.5] },
  ]);
  assert.ok(result);
  assert.equal(Math.round(result.minimum * 10) / 10, -.8);
  assert.equal(Math.round(result.maximum * 10) / 10, -.5);
});

test("6.3.3 opening-balance envelope matches the video example at 0°", () => {
  const scenarios = [
    [{ area: 5, coefficients: [-.8, -.4, -.2] }, { area: 5, coefficients: [-.8, -.4, -.2] }, { area: 20, coefficients: [.7] }, { area: 20, coefficients: [-.3] }],
    [{ area: 5, coefficients: [-.8, -.4, -.2] }, { area: 5, coefficients: [-.8, -.4, -.2] }, { area: 20, coefficients: [-.3] }, { area: 20, coefficients: [.7] }],
  ];
  const results = scenarios.map(solveBalanceScenarios);
  assert.ok(results.every(Boolean));
  const minimum = Math.min(...results.map(x => x.minimum));
  const maximum = Math.max(...results.map(x => x.maximum));
  assert.equal(Math.round(minimum * 10) / 10, -.1);
  assert.equal(Math.round(maximum * 10) / 10, 0);
});

test("screen-reference opening pattern resolves the directional Cpi ranges", () => {
  const perpendicular = solveBalanceScenarios([
    { area: 10, coefficients: [.7] },
    { area: 10, coefficients: [-.5] },
    { area: 10, coefficients: [-.9, -.5] },
    { area: 10, coefficients: [-.9, -.5] },
  ]);
  const parallelCases = [
    [{ area: 10, coefficients: [-.8, -.4, -.2] }, { area: 10, coefficients: [-.8, -.4, -.2] }, { area: 10, coefficients: [.7] }, { area: 10, coefficients: [-.3] }],
    [{ area: 10, coefficients: [-.8, -.4, -.2] }, { area: 10, coefficients: [-.8, -.4, -.2] }, { area: 10, coefficients: [-.3] }, { area: 10, coefficients: [.7] }],
  ].map(solveBalanceScenarios);
  assert.equal(Math.round(perpendicular.minimum * 10) / 10, -.5);
  assert.equal(Math.round(perpendicular.maximum * 10) / 10, -.4);
  assert.equal(Math.round(Math.min(...parallelCases.map(x => x.minimum)) * 10) / 10, -.4);
  assert.equal(Math.round(Math.max(...parallelCases.map(x => x.maximum)) * 10) / 10, -.1);
});
