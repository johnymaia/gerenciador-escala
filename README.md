# Gerenciador de Escala de Folgas — Lotérica

Sistema web leve, **mobile-first** (PWA) e 100% gratuito no **Cloudflare Pages + Cloudflare D1**, feito para gerenciar a escala de folgas e horas trabalhadas de uma equipe de 6 funcionárias.

## Principais Recursos
- **Login individual (`usuário` + `senha`)** com cookies HTTP-only assinados e senha protegida com PBKDF2-SHA256.
- **Perfis de acesso:**
  - **Funcionária (somente visualização):** vê sua folga em destaque, a escala completa da equipe e **apenas as suas próprias horas** trabalhadas (semana e mês).
  - **Administrador:** cadastra/edita funcionárias e perfis, reordena o rodízio, faz trocas de folga, lança faltas/horas extras e gerencia feriados.
- **Rodízio automático 6×6 (Seg–Sáb, 10h às 19h com 1h de almoço = 8h/dia):**
  - Toda semana cada funcionária avança 1 dia (`Seg → Ter → Qua → Qui → Sex → Sáb`).
  - **Regra de Feriados (Opção B):** quando cai feriado no dia útil, a loja fecha (`0h`) e a fila **pula o feriado**, empurrando a folga para o próximo dia aberto sem prejudicar ninguém.
- **Calendário de feriados Brasil + Belo Horizonte (MG)** já pré-carregado para qualquer ano, com opção de cadastrar feriados manuais (ex.: Carnaval) ou abrir em um feriado específico.

## Credenciais Iniciais (após primeira inicialização)
- **Administrador:** usuário `admin` | senha `admin123` *(troque após o primeiro acesso na aba Equipe)*
- **Funcionárias de exemplo:** `ana`, `bia`, `carla`, `dani`, `erica`, `fernanda` | senha `123456`

## Rodar Localmente
```bash
npm install
npm run build
npm run cf:migrate:local
npm run cf:dev
```
Acesse `http://localhost:8788`.

## Publicar Grátis no Cloudflare Pages + D1
1. Faça login no Wrangler:
   ```bash
   npx wrangler login
   ```
2. Crie o banco de dados D1 gratuito:
   ```bash
   npx wrangler d1 create escala_db
   ```
3. Copie o `database_id` gerado para o arquivo `wrangler.toml`.
4. Aplique as tabelas no banco em produção:
   ```bash
   npm run cf:migrate:remote
   ```
5. Conecte este repositório no painel do **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**:
   - **Branch de produção:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Em **Settings → Bindings**, adicione o D1 binding com nome `DB` apontando para `escala_db`.
   - Em **Settings → Environment variables**, adicione `AUTH_SECRET` com uma frase secreta longa e aleatória.

## Fluxo de Branches (Git Flow)
- `main`: produção (conectada ao deploy da Cloudflare Pages).
- `develop`: integração das novas funcionalidades.
- `feature/*`: desenvolvimento de cada recurso, integrado em `develop` e depois em `main`.
