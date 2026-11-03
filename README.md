# LastChart Studio Pro

Aplicativo web e PWA independente integrado à API oficial do **Last.fm** e enriquecido com catálogo **iTunes** para gerar tabelas semanais auditáveis no padrão **ZeroCharts** (sexta-feira `00:00` a quinta-feira `23:59`, Semana 1 oficial em `24/06/2016`), **Hall de Recordes**, **Cards Sociais PNG** e vídeos animados em **60fps** no estilo **Billboard Chart History** (linhas Bézier) e **YouTube Chart Race** (corrida de barras).

## Principais Recursos

- **Tabela Semanal Padrão ZeroCharts**: corte determinístico de sexta `00:00` a quinta `23:59` via API `Temporal`, filtro de anos (`2016`–hoje ou todo o histórico) aplicado após o cálculo real de pico, semanas no chart, semanas em `#1` e *chart run* sem misturar épocas.
- **Estúdio 60fps (Linhas & Corrida de Barras)**:
  - **Trajetória em Linhas (Billboard)**: curvas Bézier suaves, escala fixa `Top 100` (além de `50`, `30`, `20` e `10`), grade horizontal limpa (`#1`, `#10` com faixa destacada, `#20`, `#40`, `#60`, `#80`, `#100`), transição direta de ranking sem efeito roleta, coroa dourada + confetes ao atingir `#1`, pulso neon + estrelas ao entrar no Top 10, início e fim inteligentes preservando *re-entries*.
  - **Corrida de Reproduções (YouTube)**: barras horizontais animadas por reproduções acumuladas ou semanais, capas circulares na ponta e ultrapassagens em tempo real.
  - **Seleção Livre & Discografia Completa**: escolha itens avulsos ou coloque toda a discografia ouvida de qualquer artista para competir sem limites artificiais, com controles de velocidade, espaçamento, espessura, cores/paletas, tamanho de capa/texto, formatos `16:9`, `9:16` e `1:1`, trilha de áudio opcional e exportação em vídeo (`WebM`/`MP4`) ou quadro `PNG`.
- **Recursos Além do Last.fm**:
  - **Enriquecimento de Capas & Prévia de Áudio 30s**: preenchimento automático de capas ausentes (600×600) e reprodutor flutuante `MiniPlayer` via proxy `/api/itunes`.
  - **Card Semanal Top 10 (PNG 1080×1350)**: imagem pronta para compartilhamento em redes sociais.
  - **Hall de Recordes & Certificações**: maiores domínios em `#1`, longevidade no Top 100, maiores saltos, maiores estreias e certificações pessoais (Prata, Ouro, Platina, 2× Platina e Diamante).
  - **Mesclagem Auditável de Aliases/Edições**: unifique variações de faixas, álbuns ou artistas localmente com reversão instantânea, preservando os scrobbles originais intactos no `IndexedDB`.
- **Design Adaptado para Smartphones (Samsung Galaxy S Ultra / One UI & iOS)**: modos Escuro, Claro e Sistema, PWA instalável com cache offline do histórico sincronizado, zero truncamento de ícones/botões entre `320px` e `430px` CSS (`DPR 3.75`) e transições nativas (`View Transitions API` + `<dialog>` top-layer).

## Desenvolvimento Local

1. Instale as dependências (Node `>= 20.19.0`):
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env.local` e preencha sua chave da API do Last.fm:
   ```bash
   cp .env.example .env.local
   ```
   ```env
   LASTFM_API_KEY=sua_chave_aqui
   ```
3. Inicie o ambiente de desenvolvimento (com proxy local automático para `/api/lastfm` e `/api/itunes`):
   ```bash
   npm run dev
   ```

## Scripts e Verificação

```bash
npm run typecheck   # Verificação estrita TypeScript (tsc --noEmit)
npm test            # Suíte unitária Vitest (calendário, charts, aliases, API, IndexedDB)
npm run build       # Typecheck + build de produção em dist/
```

## Publicação sem Badge no Plano Gratuito (Vercel ou Cloudflare Pages)

O projeto possui adaptadores serverless prontos tanto para **Vercel** ([`vercel.json`](vercel.json) + [`api/`](api/)) quanto para **Cloudflare Pages** ([`functions/api/`](functions/api/)), funcionando exatamente igual à Netlify (mesma API Last.fm, mesmas capas/prévias iTunes, HTTPS e PWA), **sem exibir nenhum selo na tela no plano gratuito**:

### Opção A — Vercel (Recomendado)
1. Acesse https://vercel.com/new e importe o repositório `davidsilvagx/ChartsDavid`.
2. Em **Environment Variables**, adicione `LASTFM_API_KEY` com sua chave da API do Last.fm.
3. Clique em **Deploy** (`vercel.json` configura automaticamente `npm run build`, `dist` e `/api/*`).

### Opção B — Cloudflare Pages
1. Acesse **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git** e selecione `davidsilvagx/ChartsDavid`.
2. Configure **Build command**: `npm run build` e **Build output directory**: `dist`.
3. Em **Settings → Environment variables**, adicione `LASTFM_API_KEY` e publique.

## Publicação na Netlify

O projeto já inclui [`netlify.toml`](netlify.toml) e as Netlify Functions em [`netlify/functions/`](netlify/functions/):

1. Conecte o repositório `ChartsDavid` na **Netlify**.
2. Em **Site configuration → Environment variables**, adicione:
   - `LASTFM_API_KEY`: sua chave oficial da API do Last.fm (a chave permanece exclusivamente nas Functions do servidor e nunca é exposta no bundle público).
3. As configurações de build são detectadas automaticamente pelo `netlify.toml`:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`

## Documentação Técnica

Consulte [`docs/PROJETO-TECNICO.md`](docs/PROJETO-TECNICO.md) para as especificações completas de calendário, desempate determinístico, tratamento de semanas ausentes, cache em `IndexedDB` e arquitetura do motor gráfico 60fps.
