# Lotérica Daimond — Gerenciador de Escala de Folgas

Sistema web leve, **mobile-first (PWA)** e **100% gratuito** rodando na **Cloudflare (Pages + Pages Functions + D1)**, desenvolvido para gerenciar o rodízio semanal de folgas, feriados e solicitações de troca com dupla aprovação da equipe da **Lotérica Daimond**.

- **Produção:** https://gerenciador-escala.pages.dev

---

## Principais Recursos

- **Login individual (`usuário` + `senha`)** com senha padrão inicial **`123456`** e **troca obrigatória no 1º acesso** (ou após reset).
- **Perfis de acesso:**
  - **Funcionária:** visualiza sua folga em destaque na tela inicial, consulta a escala semanal e mensal de toda a equipe, visualiza detalhes de trocas no calendário e solicita/responde trocas de folga.
  - **Administrador:** gerencia colaboradores e perfis, define a **data de início do cálculo da escala** (com aviso de impacto), reordena o rodízio, reseta senhas para `123456` (sem visualizar nem definir senhas pessoais), aprova/recusa/desfaz trocas e gerencia feriados.
- **Rodízio automático 6×6 (Seg–Sáb, 10h às 19h):**
  - O cálculo começa estritamente a partir da **data de início** configurada.
  - Toda semana normal cada funcionária avança 1 dia (`Seg → Ter → Qua → Qui → Sex → Sáb`).
  - **Regra de Feriados (Opção B):** quando cai feriado em dia útil, a loja fecha e a fila **pula o feriado**, empurrando a folga para o próximo dia aberto sem prejudicar ninguém.
- **Calendário de feriados Brasil + Belo Horizonte (MG):**
  - Feriados nacionais e municipais de BH (`Corpus Christi`, `15/08 Assunção de N. Sra.`, `08/12 Imaculada Conceição`) calculados automaticamente para qualquer ano.
  - Cadastro manual de feriados (ex.: Carnaval) e opção de abrir a loja em um feriado específico.
- **Solicitações de Troca de Folga com Dupla Aprovação:**
  - A funcionária escolhe uma das suas próximas folgas e a folga de uma colega.
  - Exige aprovação da **colega** e de um **administrador** (mostrando em tempo real quem já aprovou e qual aprovação falta).
  - Quando ambas aprovam, a troca é aplicada automaticamente na escala e ganha **indicador visual (`⇄`) no calendário** (semana e mês) com detalhes ao clicar.
  - Qualquer administrador pode **desfazer** uma troca aprovada desde que nenhuma das duas datas já tenha passado.
- **Controle e Agendamento de Férias:**
  - **Funcionária:** pode solicitar férias sem limite de dias, visualizando na hora a **quantidade de dias corridos** do período.
  - **Bloqueio de conflitos:** impede escolher períodos que conflitem com férias já agendadas (pendentes ou aprovadas) de outros funcionários, exibindo o motivo imediatamente.
  - **Visibilidade imediata no calendário:** assim que agendadas, as férias aparecem no calendário semanal e mensal para todos com cores distintas (**Violeta** para aprovadas e **Laranja tracejado** para pendentes de aprovação).
  - **Painel do Administrador:** aprova ou recusa solicitações pendentes e também pode **agendar férias diretamente para qualquer colaborador** (já entrando como aprovada sem precisar de mais ninguém).

---

## Arquitetura do Projeto

O projeto é **100% serverless** e roda inteiramente dentro da plataforma Cloudflare:

```text
  Celular / Navegador (PWA)
  React + TypeScript + Tailwind CSS
              │
              │  HTTPS (Cookies HttpOnly + JSON)
              ▼
  Cloudflare Pages (Edge)
  ├── Arquivos estáticos (dist/)  ──► HTML, CSS, JS, ícone PWA
  └── Pages Functions (/api/*)    ──► API Serverless (TypeScript)
              │
              │  Binding nativo "DB"
              ▼
  Cloudflare D1 (SQLite) — escala_db
```

### Camadas do Código

| Pasta | Responsabilidade | Principais arquivos |
| :--- | :--- | :--- |
| **`src/`** *(Frontend)* | Interface mobile-first (React 18 + Vite + Tailwind CSS v4 + PWA), telas, modais e cliente de API tipado | `App.tsx`, `HomePage.tsx`, `TeamSchedulePage.tsx`, `SwapsPage.tsx`, `HolidaysPage.tsx`, `EmployeesPage.tsx`, `ChangePasswordPage.tsx`, `lib/api.ts` |
| **`shared/`** *(Domínio Compartilhado)* | Código TypeScript puro compartilhado entre front e back: motor do rodízio (Opção B) e feriados Brasil + BH | `schedule.ts`, `holidays.ts`, `types.ts` |
| **`functions/`** *(Backend Serverless)* | Rotas `/api/*` no Cloudflare Pages Functions, autenticação, autorização e persistência no D1 | `_lib/auth.ts`, `_lib/db.ts`, `api/auth/*`, `api/schedule.ts`, `api/swaps.ts`, `api/swaps/[id]/respond.ts`, `api/admin/*` |

### Como o Motor da Escala Funciona
Em vez de gravar centenas de dias futuros no banco, a escala de qualquer semana ou mês é calculada **sob demanda em milissegundos**:
1. Lê a **data de início** (`settings.rotation_start_date`) e a **fila ordenada** de colaboradoras ativas (`in_rotation = 1`, ordenadas por `rotation_order`).
2. Calcula os feriados oficiais (Brasil + BH, incluindo datas móveis pela Páscoa) e mescla com `holiday_overrides`.
3. Caminha dia a dia a partir da data de início:
   - Dias anteriores ficam marcados como `before_start` (sem escala).
   - Feriados em dias úteis não avançam o ponteiro da fila (Opção B).
   - Ao encerrar uma semana normal completa (6 dias abertos sem feriado), recua 1 posição na virada do domingo para avançar todos em `+1` dia na semana seguinte.
4. Sobrepõe exceções manuais de `schedule_overrides` e anexa os detalhes das trocas aprovadas (`swap_requests`) aos dois dias envolvidos.

### Modelo de Dados (Cloudflare D1 / SQLite)
Definido em `migrations/` e garantido automaticamente na inicialização em `functions/_lib/db.ts`:
- **`users`**: `name`, `username`, `password_hash`, `role` (`admin` | `employee`), `in_rotation`, `rotation_order`, `color`, `active`, `must_change_password`.
- **`settings`**: registro único com `shop_name` (`Lotérica Daimond`), horários e `rotation_start_date`.
- **`holiday_overrides`**: feriados cadastrados manualmente ou feriados oficiais marcados como loja aberta.
- **`schedule_overrides`**: alterações pontuais (`work` | `off`) aplicadas por trocas aprovadas ou ajustes manuais do admin.
- **`swap_requests`**: solicitações de troca com `target_status`, `admin_status`, `admin_decided_by` e `status` geral (`pending` | `approved` | `rejected` | `cancelled`).

### Autenticação e Segurança
- **Senhas:** armazenadas com **PBKDF2-SHA256** (100.000 iterações + *salt* aleatório por usuário) via Web Crypto API nativa.
- **Sessão:** token assinado com **HMAC-SHA256** (`AUTH_SECRET` salvo como variável criptografada na Cloudflare) enviado em cookie `HttpOnly; Secure; SameSite=Lax` (duração de 30 dias).
- **Travas no servidor:**
  - Enquanto `must_change_password = 1`, todas as rotas de dados retornam `403` até a troca de senha em `/api/auth/change-password`.
  - Rotas `/api/admin/*` e a ação de desfazer troca aprovada (`decision: 'undo'`) exigem `role === 'admin'`.
  - O administrador nunca visualiza nem define senhas pessoais — apenas reseta para `123456`.

---

## Limites de Uso e Limitações Atuais

### Infraestrutura (Plano Grátis da Cloudflare)

| Recurso | Limite grátis (Cloudflare) | Uso estimado (~10 pessoas/dia) | Folga |
| :--- | :--- | :--- | :--- |
| **Acesso às telas (HTML/CSS/JS)** | **Ilimitado** | ~20–50 acessos/dia | Ilimitada |
| **Chamadas de API (`/api/*`)** | **100.000 / dia** | ~100–300 / dia | **~99,7% livre** |
| **Leituras no banco D1** | **5.000.000 linhas / dia** | ~1.000–3.000 / dia | **~99,9% livre** |
| **Escritas no banco D1** | **100.000 linhas / dia** | ~5–30 / dia | **~99,97% livre** |
| **Espaço no banco D1** | **500 MB** (`escala_db`) | < 1 MB | **~99,8% livre** |
| **Tempo de CPU por API** | **10 ms** por requisição | ~1–3 ms | Tranquilo |
| **Deploys / builds** | **500 builds / mês** | Sob demanda | Sobra muito |
| **Uso comercial & Pausa** | **Permitido** e **não pausa** por inatividade | Uso diário | Sem risco |

- **Excedente de cota:** não há cobrança automática no plano grátis; caso algum limite diário seja atingido, as APIs retornam erro temporário até o reset diário (`00:00 UTC` / `21:00 BRT`), sem perda de dados.
- **Backup (D1 Time Travel):** histórico de recuperação de até **7 dias** no plano gratuito.

### Limitações Práticas Atuais do Sistema
- **Sem notificações push / WhatsApp automáticas:** pendências de troca aparecem como badge numérico ao abrir o site, mas não disparam notificação fora do app.
- **Sem rate limit no login:** voltado para uso interno com link restrito à equipe (não possui bloqueio automático por excesso de tentativas de senha).
- **Requer internet:** funciona como PWA no celular, mas precisa de conexão para consultar e salvar dados na Cloudflare (sem modo offline).
- **Rodízio único para a loja:** assume um único turno padrão (Seg–Sáb, 1 folga semanal em rodízio).
- **Férias / afastamentos longos:** tratados hoje desmarcando `"Participa do rodízio"` ou ajustando dias manualmente (sem cadastro separado de período de férias com início/fim).
- **Sessão de 30 dias:** após 30 dias logado no aparelho, o sistema solicita login novamente.

---

## Credenciais Padrão (Novos Usuários / Reset)
- Todo usuário novo ou resetado recebe a senha padrão **`123456`** e é obrigado a cadastrar uma senha pessoal no primeiro acesso.

---

## Rodar Localmente

```bash
npm install
npm run build
npm run cf:migrate:local
npm run cf:dev
```
Acesse `http://localhost:8788`.

## Deploy no Cloudflare Pages

```bash
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name=gerenciador-escala --branch=main
```

## Fluxo de Branches (Git Flow)
- `main`: produção (releases versionadas com tags `v1.0.0`, `v1.1.0`, `v1.2.0`, `v1.3.0`, ...).
- `develop`: integração das novas funcionalidades.
- `feature/*`: desenvolvimento isolado de cada recurso.
- `release/*`: fechamento de versão antes de integrar em `main`.
