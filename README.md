# JW Metálica — Módulo Cálculo de Vento

Interface técnica de engenharia para cálculo da ação do vento em edificações, conforme a **ABNT NBR 6123:2023**, com fluxo em seis etapas, vista 3D interativa, inspetor de resultados em tempo real, arquivos de projeto `.vjw` e memorial descritivo imprimível.

Os cálculos são executados localmente no navegador. O rascunho do projeto é salvo em `localStorage`; nenhum dado é enviado a servidores.

## Executar

Abra um terminal nesta pasta e inicie o servidor estático incluído:

```powershell
npm start
# ou, sem npm:
node server.cjs
```

Depois acesse <http://localhost:8000>. O projeto não tem dependências: o `npm install` não é necessário.

## Testes do núcleo

```powershell
npm test
# ou, sem npm:
node --test tests/wind-engine.test.cjs
```

## Publicar no GitHub

O repositório já está preparado para versionamento: `.gitignore` mantém fora do commit as evidências de análise (`rea-evidence.json`), projetos `.vjw` com dados de cliente e arquivos de sistema.

```powershell
git init
git add .
git commit -m "Calculadora de vento NBR 6123:2023"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

Como a aplicação é 100 % estática, também pode ser publicada no **GitHub Pages** (Settings → Pages → branch `main`, pasta `/root`).

## Fluxo da interface

1. **Dados da Obra e Cliente** — obra, cliente, endereço, responsável técnico, CREA, data, código e revisão.
2. **Dados Gerais e Localização** — município da base local, coordenadas e velocidade básica V₀ sugerida/editável.
3. **Fatores Topográficos, Rugosidade e Estatístico** — S₁ (topografia), S₂ (categoria, classe e altura) e S₃ (grupo de utilização).
4. **Geometria da Edificação / Galpão** — duas águas, uma água ou abóbada; vão, comprimento, pé-direito, inclinação ou flecha.
5. **Coeficientes de Pressão e Forma** — Cpe por zona, aberturas e Cpi, além da nota técnica sobre Ca.
6. **Resultados e Combinações** — Vk, q, pressões por zona, mapa 3D, ações locais e envoltórias a 90°/0°.

O **inspetor de resultados** à direita atualiza Vk, q, fatores, Cpi e pressões a cada alteração. Em telas menores ele vira uma gaveta. A barra superior concentra novo projeto, importação/exportação `.vjw`, reset de parâmetros, memorial, configurações e tema claro/escuro.

## Arquivos de projeto `.vjw`

- **Salvar .vjw** exporta um JSON com extensão `.vjw`, contendo metadados da obra, localização, parâmetros, aberturas, coeficientes, preferências e vista 3D.
- **Importar** valida a estrutura do arquivo antes de restaurar o projeto. Arquivos inválidos são recusados com mensagem amigável.
- Atalhos: `Ctrl+S` exporta, `Ctrl+O` importa e `Esc` fecha gavetas/diálogos.
- O reset de parâmetros preserva os dados da obra e do responsável técnico; o novo projeto pode limpar todos os cálculos após confirmação.

## Memorial descritivo

O botão **Memorial** gera um documento A4 com:

- cabeçalho institucional, obra, cliente, localização, responsável técnico e revisão;
- objetivo e norma, dados de entrada, parâmetros do vento e fórmula de Vk/q;
- tabelas de Cpe a 90° e 0°, casos de Cpi e pressões efetivas por zona;
- combinações, envoltória, avisos normativos, croqui 3D e bloco de assinatura;
- paginação e rodapé em todas as páginas, com tabelas protegidas contra quebra.

Use **Imprimir / Salvar PDF** e escolha “Salvar como PDF” na janela de impressão.

## Cálculo e tabelas normativas

- `Vk = V₀ × S₁ × S₂ × S₃`
- `q = 0,613 × Vk² / 1000` em kN/m²
- `Δp = (Cpe − Cpi) × q`
- Pressão para vedações com `0,92 × S₃`, conforme nota da Tabela 4.

O arquivo `normas.js` é a fonte única das tabelas e textos de apoio da NBR 6123:2023: Tabelas 1, 2, 4, 6, 7, 8, 15, 16, séries 18 a 20 e tabela de abertura dominante 6.3.2.1-c. O motor `wind-engine.js` lê essas tabelas; a interface e o memorial exibem os mesmos dados.

- Cpe automático para duas águas (Tabelas 6 e 7), uma água (Tabelas 6 e 8) e abóbada (paredes pela Tabela 6 e cobertura pelas séries 18 a 20).
- Cpi por estanqueidade, faces opostas igualmente permeáveis, quatro faces permeáveis, abertura dominante (6.3.2.1-c) e balanço de vazão (6.3.3).
- Avisos automáticos para limites de h/b, a/b, inclinação, flecha, faixa dos ensaios de abóbada e permeabilidade acima de 30 %.
- Ca (força global) não é presumido pela interface: a aba correspondente apresenta a formulação e orienta a consulta às tabelas de força.

## Estrutura de arquivos

- `index.html` — shell da interface, diálogos e sprite de ícones.
- `styles.css` — temas claro/escuro, layout responsivo e estilos de impressão.
- `app.js` — bootstrap, renderização da etapa ativa e interações globais.
- `js/core.js` — estado, persistência, validação, cálculo, inspetor e vista 3D.
- `js/steps.js` — renderização das seis etapas.
- `js/project.js` — diálogos, importação/exportação `.vjw`, configurações e referência normativa.
- `js/memorial.js` — geração do memorial e impressão.
- `wind-engine.js` — motor de cálculo preservado.
- `normas.js` — tabelas e notas normativas preservadas.
- `data/municipios.tsv` — base local de municípios e V₀ de referência.
- `assets/logo-jw.svg` — identidade visual JW Metálica.
- `tests/wind-engine.test.cjs` — testes do motor de cálculo.
- `package.json` — atalhos `npm start` e `npm test`.
- `.gitignore` / `.gitattributes` / `.editorconfig` — padronização para versionamento no Git.

## Limites e validação

- O exemplo do manual para galpão duas águas (V₀=30 m/s, b=15 m, a=30 m, H=6 m, α=10°, Categoria III, Grupo 3, vento a 90°) reproduz Vk≈26,7 m/s, q≈0,439 kN/m² e as seis pressões de referência.
- O caso b=12 m, a=30 m, H=5 m, α=12°, Categoria III, Grupo 2, aberturas de 10 m² por face reproduz S₂=0,877, q≈48,6 kgf/m² a 90° e q≈50,9 kgf/m² a 0°.
- O cenário b=12 m, a=35 m, H=6 m, α=12°, aberturas 5/5/20/20 m² e forro estanque reproduz o envelope Cpi 90° (−0,8/−0,5), 0° (−0,1/0,0), Vk≈26,7/27,3 m/s e q≈44,7/46,6 kgf/m².
- Não implementado: fator de vizinhança (6.4), Tabelas 9 a 12, Tabelas 17 e 20 (ações locais de abóbada), cobertura isolada (7.2) e automação de Ca.
- Os resultados são apoio ao projeto. Valide hipóteses, coeficientes e combinações com profissional habilitado antes de aplicar as cargas.

## Referência analisada

- `Steelhub.Calculadoradevento.dll`, .NET 8, arquitetura AnyCPU.
- Base de municípios instalada ao lado do módulo, copiada para `data/municipios.tsv`.
- O código e os recursos do binário foram examinados estaticamente; a aplicação original não foi executada durante esta análise.
