(function (root) {
  "use strict";

  // Fonte única das tabelas e dos textos de apoio da ABNT NBR 6123:2023.
  // Valores transcritos do texto da norma (Tabelas 1, 2, 4, 6, 7, 8, 15, 16 e 6.3.2.1-c).

  const roughness = [
    { id: "I", name: "Categoria I", description: "Superfícies lisas, mar aberto, lagos, rios", zg: 250, rows: [[1.10, .060], [1.11, .065], [1.12, .070]], zMin: 5 },
    { id: "II", name: "Categoria II", description: "Terrenos abertos, com poucos obstáculos (até 1 m)", zg: 300, rows: [[1.00, .085], [1.00, .090], [1.00, .100]], zMin: 5 },
    { id: "III", name: "Categoria III", description: "Terrenos com obstáculos esparsos (cerca de 3 m)", zg: 350, rows: [[.94, .100], [.94, .105], [.93, .115]], zMin: 5 },
    { id: "IV", name: "Categoria IV", description: "Obstáculos numerosos e pouco espaçados (cerca de 10 m)", zg: 420, rows: [[.86, .120], [.85, .125], [.84, .135]], zMin: 5 },
    { id: "V", name: "Categoria V", description: "Obstáculos altos e densos (25 m ou mais)", zg: 500, rows: [[.74, .150], [.73, .160], [.71, .175]], zMin: 10 },
  ];

  const frByClass = [1.00, .98, .95];

  const groups = [
    { id: 1, factor: 1.11, returnPeriod: 100, name: "Grupo 1", description: "Ruína pode afetar a segurança ou o socorro a pessoas após tempestade: hospitais, quartéis, centrais de controle, pontes, substâncias inflamáveis ou tóxicas." },
    { id: 2, factor: 1.06, returnPeriod: 75, name: "Grupo 2", description: "Ruína com risco substancial à vida: aglomerações acima de 300 pessoas, creches acima de 150, escolas acima de 250." },
    { id: 3, factor: 1.00, returnPeriod: 50, name: "Grupo 3", description: "Edificações para residências, hotéis, comércio e indústrias; estruturas desmontáveis reutilizáveis." },
    { id: 4, factor: .95, returnPeriod: 37, name: "Grupo 4", description: "Sem ocupação humana: depósitos e silos, sem circulação de pessoas no entorno." },
    { id: 5, factor: .83, returnPeriod: 15, name: "Grupo 5", description: "Edificações temporárias não reutilizáveis; estruturas dos grupos 1 a 4 durante a construção (até 2 anos)." },
  ];

  // Tabela 6: paredes. hb = limite superior de h/b (grupo), ab = a/b de referência.
  const wallTable = [
    { hb: .5, ab: 1.5, A1B1: -.8, A2B2: -.5, C: .7, D: -.4, A: .7, B: -.4, C1D1: -.8, C2D2: -.4, medio: -.9 },
    { hb: .5, ab: 2, A1B1: -.8, A2B2: -.4, C: .7, D: -.3, A: .7, B: -.5, C1D1: -.9, C2D2: -.5, medio: -1 },
    { hb: 1.5, ab: 1.5, A1B1: -.9, A2B2: -.5, C: .7, D: -.5, A: .7, B: -.5, C1D1: -.9, C2D2: -.5, medio: -1.1 },
    { hb: 1.5, ab: 2, A1B1: -.9, A2B2: -.4, C: .7, D: -.3, A: .7, B: -.6, C1D1: -.9, C2D2: -.5, medio: -1.1 },
    { hb: 6, ab: 1.5, A1B1: -1, A2B2: -.6, C: .8, D: -.6, A: .8, B: -.6, C1D1: -1, C2D2: -.6, medio: -1.2 },
    { hb: 6, ab: 2, A1B1: -1, A2B2: -.5, C: .8, D: -.3, A: .8, B: -.6, C1D1: -1, C2D2: -.6, medio: -1.2 },
  ];

  // Tabela 7: duas águas. Colunas: θ, EFI (90°), GHJ (90°), EG (0°), FH (0°).
  const gableRoofTable = [
    { hb: .5, rows: [
      [0, -.8, -.4, -.8, -.4], [5, -.9, -.4, -.8, -.4], [10, -1.2, -.4, -.8, -.6],
      [15, -1, -.4, -.8, -.6], [20, -.4, -.4, -.7, -.6], [30, 0, -.4, -.7, -.6],
      [45, .3, -.5, -.7, -.6], [60, .7, -.6, -.7, -.6],
    ] },
    { hb: 1.5, rows: [
      [0, -.8, -.6, -1, -.6], [5, -.9, -.6, -.9, -.6], [10, -1.1, -.6, -.8, -.6],
      [15, -1, -.6, -.8, -.6], [20, -.7, -.5, -.8, -.6], [30, -.2, -.5, -.8, -.8],
      [45, .2, -.5, -.8, -.8], [60, .6, -.5, -.8, -.8],
    ] },
    { hb: 6, rows: [
      [0, -.8, -.6, -.9, -.7], [5, -.8, -.6, -.8, -.8], [10, -.8, -.6, -.8, -.8],
      [15, -.8, -.6, -.8, -.8], [20, -.8, -.6, -.8, -.8], [30, -1, -.5, -.8, -.7],
      [40, -.2, -.5, -.8, -.7], [50, .2, -.5, -.8, -.7], [60, .5, -.5, -.8, -.7],
    ] },
  ];

  // Tabela 8: uma água, h/b < 2. Ângulos de incidência 90°, 45°, 0°, −45° e −90°.
  const shedRoofTable = [
    { theta: 5, n90Hi: -1, n90Lj: -.5, n45H: -1, n45L: -.9, z0a: -1, z0b: -.5, m45H: -.9, m45L: -1, m90Hi: -.5, m90Lj: -1 },
    { theta: 10, n90Hi: -1, n90Lj: -.5, n45H: -1, n45L: -.8, z0a: -1, z0b: -.5, m45H: -.8, m45L: -1, m90Hi: -.4, m90Lj: -1 },
    { theta: 15, n90Hi: -.9, n90Lj: -.5, n45H: -1, n45L: -.7, z0a: -1, z0b: -.5, m45H: -.6, m45L: -1, m90Hi: -.3, m90Lj: -1 },
    { theta: 20, n90Hi: -.8, n90Lj: -.5, n45H: -1, n45L: -.6, z0a: -.9, z0b: -.5, m45H: -.5, m45L: -1, m90Hi: -.2, m90Lj: -1 },
    { theta: 25, n90Hi: -.7, n90Lj: -.5, n45H: -1, n45L: -.6, z0a: -.8, z0b: -.5, m45H: -.3, m45L: -.9, m90Hi: -.1, m90Lj: -.9 },
    { theta: 30, n90Hi: -.5, n90Lj: -.5, n45H: -1, n45L: -.6, z0a: -.8, z0b: -.5, m45H: -.1, m45L: -.6, m90Hi: 0, m90Lj: -.6 },
  ];

  // Tabela 15: abóbada, vento perpendicular à geratriz. Chaves f/ℓ2 e h/ℓ2; 6 partes.
  const archTable15 = {
    "0.2": {
      0: [.3, -.3, -.6, -.7, -.6, -.2],
      .125: [-.5, -.5, -.7, -.7, -.5, -.2],
      .25: [-.9, -.6, -.8, -.8, -.4, -.2],
      .5: [-1.2, -.7, -.9, -.8, -.3, -.2],
      1: [-1.4, -.8, -.9, -.9, -.4, -.4],
      5: [-1.8, -1, -1.1, -1.2, -.8, -.7],
    },
    "0.1": {
      .125: [-1, -.4, -.4, -.4, -.4, -.3],
      .25: [-1.2, -.5, -.4, -.4, -.4, -.3],
      .5: [-1.5, -1, -.7, -.5, -.4, -.3],
      1: [-1.6, -1, -.8, -.6, -.4, -.3],
    },
  };

  // Tabela 16: abóbada, vento paralelo à geratriz. Partes A1+A2, B, C, D1+D2.
  const archTable16 = [-.8, -.6, -.3, -.2];

  // 6.3.2.1-c: abertura dominante (proporção → Cpi).
  const dominantBarlaventoTable = [[1, .1], [1.5, .3], [2, .5], [3, .6], [6, .8]];
  const dominantSuctionTable = [[.25, -.4], [.5, -.5], [.75, -.6], [1, -.7], [1.5, -.8], [3, -.9]];

  // Séries de ensaio da abóbada (Tabelas 18 a 20), como usadas pelo programa original.
  // S1 para categorias I e II; S2 para as demais. Modelo escolhido pela menor distância:
  // |ln(f/b)| + |ln(h/b)| + 0,5·|ln(a/b)|. Perp: vento perpendicular à geratriz (6 partes);
  // Paral: vento paralelo à geratriz (4 partes).
  const archSeries = [
    { serie: "S1", ab: 4, fb: .2, hb: .25, perp: [-.3, -.7, -.8, -.6, -.4, -.4], paral: [-.8, -.4, -.3, -.2] },
    { serie: "S1", ab: 4, fb: .2, hb: .5, perp: [-.9, -.9, -.9, -.7, -.5, -.5], paral: [-.8, -.6, -.3, -.2] },
    { serie: "S1", ab: 4, fb: .1, hb: .25, perp: [-1, -.6, -.6, -.6, -.4, -.3], paral: [-.8, -.4, -.3, -.2] },
    { serie: "S1", ab: 4, fb: .1, hb: .5, perp: [-1, -.8, -.7, -.7, -.5, -.4], paral: [-.9, -.6, -.3, -.2] },
    { serie: "S2", ab: 5, fb: 1 / 3, hb: 1 / 9, perp: [.4, -.6, -1.2, -.9, -.7, -.7], paral: [-.8, -.4, -.2, -.2] },
  ];

  const resumo = {
    titulo: "Resumo da ABNT NBR 6123:2023",
    escopo: "Forças devidas ao vento em edificações (pressões externas e internas). Esta calculadora trata de galpões com cobertura de duas águas, de uma água (shed) e de abóbada cilíndrica, com pressões externas (Seção 6) e internas (6.3).",
    fluxo: [
      "V₀: velocidade básica, lida na isopleta da Figura 1 (5.1).",
      "Vk = V₀ · S₁ · S₂ · S₃ (4.2 e 5.2 a 5.4).",
      "q = 0,613 · Vk² em N/m², ou 0,613 · Vk² / 1000 em kN/m² (4.2).",
      "Cpe: coeficiente de pressão externa pelas Tabelas 6 a 8 (paredes e telhados) e 18 a 20 (abóbada) (6.1 e 6.2).",
      "Cpi: coeficiente de pressão interna, por 6.3.2 (método simplificado) ou 6.3.3 (balanço de vazão).",
      "Pressão efetiva: Δp = (Cpe − Cpi) · q (4.3.1).",
    ],
    classes: "Classe da edificação (5.3.2) pela maior dimensão frontal, horizontal ou vertical: A até 20 m; B de 20 a 50 m; C acima de 50 m.",
    cpi: "Cpi (6.3.2): estanque −0,2 ou 0 (6.3.2.2); duas faces opostas igualmente permeáveis: +0,2 se o vento é perpendicular à face permeável e −0,3 se é perpendicular à impermeável (6.3.2.1-a); quatro faces igualmente permeáveis: −0,3 ou 0 (6.3.2.1-b); abertura dominante: área igual ou superior à soma das demais (6.3.1 e 6.3.2.1-c).",
    permeabilidade: "Índice de permeabilidade de cada parede ou cobertura até 30 %, salvo abertura dominante (6.3.1).",
    unidades: "1 kN/m² = 101,97 kgf/m². A pressão para vedações (nota da Tabela 4) usa 0,92 · S₃.",
    alerta: "Os resultados são apoio ao cálculo: valide as hipóteses e os coeficientes com profissional habilitado antes de usar em projeto.",
  };

  // Textos das tabelas: o que é e como usar para preencher.
  const tabelas = {
    t1: {
      titulo: "Tabela 1 — Parâmetros meteorológicos (bₘ, p e zg)",
      clausula: "5.3.3",
      oque: "Coeficientes bₘ e expoente p que definem o fator S₂ = bₘ · Fr · (z/10)ᵖ para cada categoria de rugosidade do terreno e cada classe da edificação. zg é a altura da camada limite.",
      como: "Escolha a categoria do terreno (Etapa 4) e a classe pela maior dimensão frontal da edificação (Etapa 4). O sistema usa a linha correspondente. Para z abaixo de 5 m (10 m na categoria V), S₂ fica constante.",
    },
    t2: {
      titulo: "Tabela 2 — Fator de rajada (Fr)",
      clausula: "5.3.3",
      oque: "Fator de rajada que depende apenas da classe da edificação.",
      como: "Não é preciso digitar: o sistema aplica A = 1,00, B = 0,98 e C = 0,95 conforme a classe calculada.",
    },
    t4: {
      titulo: "Tabela 4 — Valores mínimos do fator estatístico S₃",
      clausula: "5.4",
      oque: "Grupo de utilização da edificação, com o fator S₃ e o período de recorrência Tp correspondente.",
      como: "Escolha o grupo da obra na Etapa 4. Grupo 3 é o padrão para residências, hotéis, comércio e indústrias. Para vedações, a nota permite usar 0,92 · S₃ (exibido nos resultados).",
    },
    t6: {
      titulo: "Tabela 6 — Paredes de edificações de planta retangular a × b (b é a menor dimensão)",
      clausula: "6.1.1",
      oque: "Coeficientes Ce e cpe médio em paredes, por faixa de h/b (pé-direito pela menor dimensão) e de a/b.",
      como: "Use a faixa de h/b e a/b da sua geometria (Etapa 2). Em α = 0° (vento perpendicular à empena) e α = 90° (vento perpendicular à fachada longa). O cpe médio vale para elementos de vedação na faixa hachurada de 0,2b ou h (o menor dos dois).",
    },
    t7: {
      titulo: "Tabela 7 — Telhados com duas águas, simétricos",
      clausula: "6.1.1",
      oque: "Coeficientes por inclinação θ da cobertura, nas faixas de h/b, para vento a 90° (EFI e GHJ) e a 0° (EG e FH).",
      como: "Confira a faixa de h/b e a inclinação θ (Etapa 2). Valores intermediários de θ são interpolados pelo sistema.",
    },
    t8: {
      titulo: "Tabela 8 — Telhados com uma água (h/b < 2)",
      clausula: "6.1.1",
      oque: "Coeficientes para a cobertura de uma água, por ângulo θ entre 5° e 30°, nos ângulos de incidência de −90° a 90°.",
      como: "Use somente com h/b < 2 e θ de 5° a 30°. Em 90°, os trechos H e L formam a envoltória ±90°/±45° adotada pelo sistema. Para θ menor que 5°, a Nota 2 manda usar a Tabela 7.",
    },
    t15: {
      titulo: "Tabela 15 — Abóbada: vento perpendicular à geratriz",
      clausula: "6.2.3",
      oque: "Coeficientes cpe por parte do arco (6 partes), para f/ℓ₂ e h/ℓ₂ tabelados (ℓ₂ = vão b).",
      como: "Calcule f/b (flecha) e h/b (pé-direito). A tabela só vale para f/b = 1/5 ou 1/10 e h/b = 0, 1/8, 1/4, 1/2, 1 ou 5. Para conferência: o cálculo automático usa as séries das Tabelas 18 a 20.",
    },
    t16: {
      titulo: "Tabela 16 — Abóbada: vento paralelo à geratriz",
      clausula: "6.2.3",
      oque: "Coeficientes cpe por região: A1+A2, B, C e D1+D2.",
      como: "Valores únicos para a incidência de 0°. Para conferência: o cálculo automático usa as séries das Tabelas 18 a 20.",
    },
    t18: {
      titulo: "Tabelas 18 a 20 — Séries de ensaio da abóbada (cálculo automático)",
      clausula: "6.2.3",
      oque: "Cinco modelos de abóbada, cada um com a/b, f/b e h/b próprios: vento perpendicular à geratriz (6 partes do arco) e paralelo (4 regiões). A série S1 vale para categorias I e II; a S2, para as demais.",
      como: "Não é preenchido à mão: o sistema escolhe a série pela categoria (Etapa 4) e o modelo mais próximo de a/b, f/b e h/b (Etapa 2). Confira o modelo escolhido na Etapa 6. Se a geometria estiver longe dos ensaios, o aviso indica extrapolação.",
    },
    t6c: {
      titulo: "6.3.2.1-c — Coeficiente de pressão interna para abertura dominante",
      clausula: "6.3.2.1-c",
      oque: "Cpi em função da proporção entre a área da abertura dominante e a área das demais aberturas. Há duas tabelas: barlavento (positiva) e zona de alta sucção (negativa).",
      como: "Calcule a proporção (área da abertura dominante ÷ soma das demais) na Etapa 5. Abertura é dominante quando sua área é igual ou superior à soma das demais. O sistema escolhe a tabela pelo tipo de face.",
    },
  };

  // Notas por etapa (índice 0 a 6), mostradas acima do cálculo.
  const etapas = [
    {
      titulo: "Tipo de estrutura",
      tabelas: [],
      notas: [
        "Duas águas: a cumeeira fica no centro. Cpe pelas Tabelas 6 e 7.",
        "Uma água (shed): Cpe pelas Tabelas 6 e 8, válidas para h/b < 2 e θ de 5° a 30°.",
        "Abóbada: Cpe pelas séries de ensaio (Tabelas 18 a 20), escolhidas por categoria e geometria. A flecha f é a altura do arco acima do beiral.",
        "Vento a 90° é perpendicular à cumeeira (ou geratriz); vento a 0° é paralelo.",
      ],
    },
    {
      titulo: "Geometria",
      tabelas: ["t6"],
      notas: [
        "a é a maior dimensão horizontal; b é a menor (vão). Tabelas 6 a 8 usam b como referência.",
        "h é o pé-direito até o beiral. A altura total (h + flecha ou + altura da cumeeira) entra na classe da edificação.",
        "Tabela 6 e 7 valem para h/b até 6 e a/b até 4. Fora disso, o sistema avisa.",
      ],
    },
    {
      titulo: "Localização e V₀",
      tabelas: [],
      notas: [
        "V₀ é lida na isopleta da Figura 1 (m/s): rajada de 3 s a 10 m, excedida em média uma vez em 50 anos.",
        "A base municipal sugere V₀, mas não substitui a leitura da isopleta na obra.",
        "O Anexo C lista as estações meteorológicas que deram origem às isopletas.",
      ],
    },
    {
      titulo: "Fatores S₁, S₂ e S₃",
      tabelas: ["t1", "t2", "t4"],
      notas: [
        "S₁ = 1,0 para terreno plano; 0,9 para vale profundo; talude e morro pela 5.2 (θt e dt).",
        "Escolha a categoria pela descrição do terreno (5.3.1). A categoria V tem S₂ constante até 10 m.",
        "Classe pela maior dimensão frontal: A até 20 m, B de 20 a 50 m, C acima de 50 m (5.3.2).",
        "S₃ depende do grupo (Tabela 4). O grupo 3 é o padrão para edificações comuns.",
      ],
    },
    {
      titulo: "Aberturas e Cpi",
      tabelas: ["t6c"],
      notas: [
        "Índice de permeabilidade de cada face até 30 %, salvo abertura dominante (6.3.1).",
        "Estanque (6.3.2.2) usa −0,2 ou 0. Duas faces opostas permeáveis: +0,2 ou −0,3 conforme o vento (6.3.2.1-a).",
        "Abertura dominante: área igual ou superior à soma das demais. Use a tabela 6.3.2.1-c.",
        "Quando o arranjo não se enquadra nos casos 6.3.2, o sistema resolve o balanço de vazão de 6.3.3.",
      ],
    },
    {
      titulo: "Zonas de Cpe",
      tabelas: [],
      notas: [
        "Cpe nas zonas hachuradas usa o cpe médio, válido para elementos de vedação (6.1.1, Nota 4).",
        "Cp = Cpe − Cpi. Cp negativo é sucção; positivo é sobrepressão.",
        "Em abóbada, vento perpendicular tem 6 partes do arco e vento paralelo tem 4 regiões (Tabelas 18 a 20).",
      ],
    },
    {
      titulo: "Resultados",
      tabelas: [],
      notas: [
        "q é a pressão dinâmica da estrutura principal. A pressão para vedações usa 0,92 · S₃ (nota da Tabela 4).",
        "A sucção máxima é o menor Δp negativo entre as zonas e as incidências.",
        "O modelo 3D mostra as zonas coloridas por Cp = Cpe − Cpi; arraste para girar. A seta de vento acompanha a rotação e aponta para a fachada atingida. Em abóbada, aparecem as 6 partes (90°) ou as 4 faixas (0°) da cobertura.",
        "O memorial lista as tabelas usadas, os parâmetros de entrada e os coeficientes aplicados em cada uma.",
        "Os avisos desta etapa indicam limites de tabela e de permeabilidade que exigem atenção.",
      ],
    },
  ];

  const api = {
    roughness, frByClass, groups, wallTable, gableRoofTable, shedRoofTable,
    archTable15, archTable16, archSeries, dominantBarlaventoTable, dominantSuctionTable,
    resumo, tabelas, etapas,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.NormaABNT = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
