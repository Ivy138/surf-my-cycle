# Surf My Cycle

> AI-Powered Menstrual Cycle Tracker & Personal Health Companion

[Live Demo](https://surf-my-cycle.vercel.app) | [Product Roadmap](./ROADMAP.md)

---

## Features

- **Smart Cycle Tracking** — Log daily symptoms across morning/afternoon/evening periods
- **AI Companion** — Personalized insights and health recommendations powered by MiniMax
- **Privacy-First** — Your data is stored securely in Supabase, you own it
- **Multi-Period Analysis** — Track energy, mood, bleeding, discharge and cervical fluid
- **Cycle Statistics** — Visualize patterns and trends over time

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS + HTML/CSS |
| Backend | Vercel Serverless APIs |
| Database | Supabase (PostgreSQL) |
| AI | MiniMax API |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- MiniMax API key

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `MINIMAX_API_KEY` | MiniMax API key for AI features |

### Database Setup

Run the Supabase migrations in `supabase/migrations/` to set up the required tables:
- `profiles` — user profiles
- `records` — daily cycle records
- `conversations` — AI chat history
- `user_memories` — long-term memory for AI

### Local Development

```bash
# Install dependencies (if any)
npm install

# Start local server
npx vercel dev
```

### Deploy

```bash
npm i -g vercel
vercel --prod
```

---

## Project Structure

```
surf-my-cycle/
├── index.html              # Main application
├── cycle_experiment.html   # AI features experiment
├── api/                   # Serverless API routes
│   ├── auth-login.js      # Authentication
│   ├── auth-signup.js     # User registration
│   ├── ai-chat.js         # AI companion chat
│   ├── data.js            # Data CRUD operations
│   └── ...
├── css/                   # Stylesheets
├── js/                    # Frontend JavaScript
├── supabase/              # Database migrations & schemas
├── docs/                  # Product documentation
│   ├── PRD_Surf_My_Cycle.md
│   ├── 部署指南.md
│   └── ...
├── deploy/                # Deployment configs
└── ROADMAP.md             # Product roadmap
```

---

## Product Roadmap

See [ROADMAP.md](./ROADMAP.md) for current development status and upcoming features.

---

## License

Private project. All rights reserved.
