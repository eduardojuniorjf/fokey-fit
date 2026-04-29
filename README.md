# FoKey Fit

> Plataforma web de gestão de saúde e fitness para acompanhar metas, atividade física, medidas corporais e hábitos diários.

🌐 **Produção:** [https://fokey-fit.lovable.app](https://fokey-fit.lovable.app)

---

## 📋 Sumário

- [Visão geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Stack tecnológica](#-stack-tecnológica)
- [Arquitetura](#-arquitetura)
- [Modelo de dados](#-modelo-de-dados)
- [Estrutura de pastas](#-estrutura-de-pastas)
- [Configuração local](#-configuração-local)
- [Variáveis de ambiente](#-variáveis-de-ambiente)
- [Integração Google Fit](#-integração-google-fit)
- [Design system](#-design-system)
- [Deploy](#-deploy)
- [Convenções de código](#-convenções-de-código)

---

## 🎯 Visão geral

FoKey Fit é uma aplicação web full-stack que permite ao usuário:

- Definir e acompanhar **metas** de peso, passos, energia e cardio.
- Registrar **medidas corporais** (peso, cintura, quadril, etc.) ao longo do tempo.
- Sincronizar **atividade física** automaticamente via Google Fit.
- Criar e marcar **hábitos diários** recorrentes.
- Visualizar **histórico** consolidado e gráficos de evolução.

A plataforma é mobile-first, com layout responsivo (sidebar em desktop, bottom nav em mobile) e tema claro/escuro com identidade visual própria (azul-marinho + laranja).

---

## ✨ Funcionalidades

| Módulo | Rota | Descrição |
|---|---|---|
| **Dashboard** | `/` | Visão geral em masonry com cards de progresso, atividade, peso e frase do dia. |
| **Atividade** | `/atividade` | Histórico de atividades cardio, passos diários, gráficos e integração Google Fit. |
| **Medidas** | `/medidas` | Registro e evolução de peso, %gordura, cintura, quadril, braço, tórax, coxa. |
| **Hábitos** | `/habitos` | CRUD de hábitos com marcação diária e streak. |
| **Histórico** | `/historico` | Linha do tempo agregada de todas as métricas. |
| **Perfil** | `/perfil` | Dados pessoais, metas, integrações conectadas. |
| **Auth** | `/auth` | Cadastro/login por email-senha e Google OAuth. |

---

## 🧱 Stack tecnológica

### Frontend
- **React 19** + **TypeScript 5.8** (strict mode)
- **TanStack Start v1** — full-stack React framework com SSR e server functions
- **TanStack Router** — roteamento file-based type-safe
- **TanStack Query** — cache e sincronização de dados
- **Vite 7** — build tool
- **Tailwind CSS v4** — styling via `src/styles.css` (sem `tailwind.config.js`)
- **shadcn/ui** + **Radix UI** — componentes acessíveis
- **Lucide React** — ícones
- **Recharts** — gráficos
- **React Hook Form** + **Zod** — formulários e validação
- **Sonner** — notificações toast
- **date-fns** — manipulação de datas
- **DnD Kit** — drag-and-drop (dashboard masonry)

### Backend
- **Supabase** (projeto `bpsiihhonyzdpvbaxkhl`)
  - PostgreSQL com Row-Level Security (RLS)
  - Auth (email/senha + Google OAuth)
  - Storage (avatares)
- **TanStack Server Functions** (`createServerFn`) — RPC tipado
- **Cloudflare Workers** — runtime de edge para SSR e server functions

### Integrações externas
- **Google Fit API** — sincronização automática de passos, calorias e atividades cardio

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                  Browser (React 19 SPA)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Components   │  │ TanStack     │  │ Supabase     │   │
│  │ (shadcn/ui)  │  │ Router/Query │  │ JS Client    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────┴──────────────────────────────────┐
│           Cloudflare Workers (Edge Runtime)             │
│  ┌──────────────────┐   ┌──────────────────────────┐    │
│  │ TanStack SSR     │   │ Server Functions         │    │
│  │ (__root.tsx)     │   │ (src/server/*.functions) │    │
│  └──────────────────┘   └──────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────┴────────┐           ┌────────┴────────┐
│ Supabase       │           │ Google Fit API  │
│ (Postgres+RLS) │           │ (OAuth 2.0)     │
└────────────────┘           └─────────────────┘
```

### Camadas de acesso ao Supabase

| Cliente | Onde usar | RLS |
|---|---|---|
| `@/integrations/supabase/client` | Componentes React, hooks de browser | ✅ Aplicada (como usuário) |
| `@/integrations/supabase/auth-middleware` | Server functions autenticadas | ✅ Aplicada (como usuário) |
| `@/integrations/supabase/client.server` | Server functions admin (manutenção) | ❌ Bypassada (service role) |

---

## 🗄 Modelo de dados

Todas as tabelas residem no schema `public` e possuem **RLS habilitado** restringindo acesso por `user_id = auth.uid()`.

| Tabela | Descrição |
|---|---|
| `profiles` | Dados públicos do usuário (nome, foto, biografia). |
| `activity_goals` | Metas diárias/semanais (passos, kcal, minutos ativos, cardio points). |
| `weight_goals` | Meta de peso (alvo, prazo, peso inicial). |
| `weight_entries` | Histórico de pesagens. |
| `body_measurements` | Medidas corporais (cintura, quadril, braço, tórax, coxa, %gordura). |
| `daily_activity` | Resumo diário de passos, calorias e minutos ativos (sincronizado do Google Fit). |
| `cardio_activities` | Atividades cardio individuais (corrida, ciclismo, etc.). |
| `habits` | Definição dos hábitos do usuário. |
| `habit_logs` | Registros de marcação de hábitos por dia. |
| `integrations` | Tokens OAuth de integrações externas (criptografados). |
| `oauth_states` | Estados temporários para validação de fluxo OAuth (CSRF). |

> ⚠️ Nunca crie foreign keys para `auth.users`. Use `user_id uuid` e referencie via RLS / `auth.uid()`.

---

## 📁 Estrutura de pastas

```
src/
├── assets/                  # Imagens estáticas (logos, ilustrações)
├── components/
│   ├── ui/                  # Componentes shadcn (button, card, dialog…)
│   ├── AppSidebar.tsx       # Navegação lateral (desktop)
│   ├── BottomNav.tsx        # Navegação inferior (mobile)
│   ├── MasonryDashboard.tsx # Dashboard drag-and-drop
│   └── ActivityChartCard.tsx
├── contexts/
│   └── AuthContext.tsx      # Provider de autenticação Supabase
├── hooks/
│   └── use-mobile.tsx
├── integrations/
│   └── supabase/
│       ├── client.ts            # Cliente browser (anon key)
│       ├── client.server.ts     # Cliente admin (service role)
│       ├── auth-middleware.ts   # Middleware de auth para server fns
│       └── types.ts             # Tipos gerados (NÃO editar)
├── lib/
│   ├── utils.ts             # Helpers (cn, formatters)
│   └── dailyQuote.ts        # Frase motivacional do dia
├── routes/
│   ├── __root.tsx           # Layout raiz (HTML shell, providers, meta)
│   ├── auth.tsx             # Tela de login/cadastro
│   ├── _authenticated.tsx   # Layout protegido (sidebar + bottom nav)
│   ├── _authenticated/
│   │   ├── index.tsx        # Dashboard
│   │   ├── atividade.tsx
│   │   ├── medidas.tsx
│   │   ├── habitos.tsx
│   │   ├── historico.tsx
│   │   └── perfil.tsx
│   └── api/public/
│       └── google-fit-callback.ts  # OAuth callback (sem auth)
├── server/
│   ├── google-fit.functions.ts  # Server functions (RPC tipado)
│   └── google-fit.server.ts     # Helpers server-only
├── styles.css               # Tailwind v4 + design tokens (oklch)
├── router.tsx               # Configuração do router
└── routeTree.gen.ts         # Auto-gerado — NÃO editar
```

---

## ⚙️ Configuração local

### Pré-requisitos
- **Bun** ≥ 1.0 (ou Node.js ≥ 20)
- Conta no **Supabase** (já provisionada)

### Instalação

```bash
bun install
bun run dev          # Inicia servidor de desenvolvimento
bun run build        # Build de produção
bun run lint         # ESLint
bun run format       # Prettier
```

A aplicação fica disponível em `http://localhost:5173`.

---

## 🔐 Variáveis de ambiente

O arquivo `.env` é populado automaticamente pelo Lovable Cloud. Variáveis usadas:

### Cliente (expostas no browser)
```
VITE_SUPABASE_URL=https://bpsiihhonyzdpvbaxkhl.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=bpsiihhonyzdpvbaxkhl
```

### Servidor (apenas em server functions / SSR)
```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY        # ⚠️ NUNCA expor ao cliente
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET             # Para OAuth Google Fit
```

> Secrets de servidor são gerenciados via **Lovable Cloud → Secrets**, nunca commitados.

---

## 💚 Integração Google Fit

Fluxo OAuth 2.0:

1. Usuário clica em **"Conectar Google Fit"** em `/perfil`.
2. Server function gera `state` (CSRF) salvo em `oauth_states` e redireciona para Google.
3. Google chama `/api/public/google-fit-callback?code=...&state=...`.
4. Callback valida `state`, troca `code` por tokens e salva em `integrations`.
5. Server function `syncGoogleFit` busca dados das últimas 24h e popula `daily_activity` + `cardio_activities`.

**Escopos solicitados:**
- `fitness.activity.read`
- `fitness.body.read`
- `fitness.location.read`

---

## 🎨 Design system

### Identidade visual
- **Cor primária (CTA):** `#ff8c42` (laranja) — `--site-orange`
- **Cor de marca (títulos/hero):** `#1e3a5f` (azul-marinho) — `--site-navy`
- **Logo:** `src/assets/fokey-fit-logo.png`

### Tokens semânticos
Todos os tokens são definidos em `src/styles.css` no formato **oklch** e expostos como classes Tailwind:

```css
--background, --foreground
--primary, --primary-foreground
--secondary, --muted, --accent
--destructive, --border, --input, --ring
--sidebar, --sidebar-foreground, --sidebar-border
--gradient-primary, --shadow-elegant
```

### Regra de ouro
❌ **Nunca** use cores hardcoded em componentes (`bg-orange-500`, `text-white`).
✅ **Sempre** use tokens semânticos (`bg-primary`, `text-foreground`).

### Tipografia
- Títulos: navy (`text-foreground`)
- Body: regular weight, line-height confortável

---

## 🚀 Deploy

A plataforma é publicada via **Lovable** e servida em **Cloudflare Workers** (edge runtime).

### URLs estáveis
- Produção: `https://fokey-fit.lovable.app`
- Preview: `https://id-preview--a546511b-22b3-41a1-aea2-41afdfde7c08.lovable.app`

### Fluxo
1. Mudanças de **frontend** → exigem clicar em **Publish → Update** no editor Lovable.
2. Mudanças de **backend** (server functions, migrations) → deploy automático e imediato.
3. Sincronização bidirecional com **GitHub** (push para `main` dispara build no Cloudflare Pages).

### Limitações do runtime (Cloudflare Workers)
- ❌ `child_process`, `sharp`, `puppeteer` (binários nativos)
- ✅ `fs`, `crypto`, `Buffer`, `fetch`, APIs Web standard

---

## 📐 Convenções de código

### Roteamento
- Rotas em `src/routes/` seguindo convenção **flat dot-separated** (`posts.$id.tsx`, não pastas).
- Use `<Link to="/...">` de `@tanstack/react-router` (nunca `react-router-dom`).
- **Nunca** edite `src/routeTree.gen.ts`.

### Server Functions
```ts
// src/server/feature.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const myAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // ...
  });
```

### Segurança
- **RLS sempre habilitado** em todas as tabelas.
- **Roles** (se necessário) em tabela separada `user_roles` + função `has_role()` SECURITY DEFINER. Nunca em `profiles`.
- **Nunca** validar permissões via `localStorage` ou client-side.
- Webhooks/endpoints públicos em `/api/public/*` com verificação de assinatura HMAC.

### Componentes
- Pequenos, focados, no máximo ~150 linhas.
- Props tipadas com TypeScript.
- Acessibilidade: usar Radix primitives + `aria-label`.

---

## 📚 Recursos

- [TanStack Start docs](https://tanstack.com/start)
- [Supabase docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Lovable docs](https://docs.lovable.dev)

---

## 📄 Licença

Projeto privado — todos os direitos reservados.
