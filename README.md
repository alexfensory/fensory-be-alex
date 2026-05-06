# Verba Backend

Multi-tenant AI Content SaaS Platform backend built with Next.js 15.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 15 (API Routes + Server Actions)
- **Database**: PostgreSQL + pgvector (Supabase)
- **ORM**: Drizzle ORM
- **Queue**: BullMQ + Redis
- **Auth**: Clerk
- **Billing**: Stripe
- **AI**: Anthropic Claude + OpenAI

## Features

- Multi-tenant architecture with Clerk organizations
- Brand voice analysis and RAG-powered content generation
- Article generation with quality gates
- CMS connectors (WordPress, Webflow, Ghost)
- Agent channels (Telegram, Slack) for content approval
- Stripe billing with usage-based limits
- Background job processing with BullMQ

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL with pgvector extension
- Redis
- Clerk account
- Stripe account
- Anthropic API key
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/alexfensory/fensory-be-alex.git
cd fensory-be-alex

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure your environment variables
# Edit .env with your credentials

# Generate database migrations
npm run db:generate

# Push schema to database
npm run db:push

# Run development server
npm run dev
```

### Running Workers

```bash
# Run all workers
npm run workers

# Run specific worker
npm run workers:article
npm run workers:crawl
npm run workers:cms
```

## API Routes

### Health & Status
- `GET /api/health` - Health check
- `GET /api/status` - System status with DB check

### Brand
- `POST /api/brand/crawl` - Start website crawl
- `GET/POST/DELETE /api/brand/corpus` - Manage brand corpus
- `GET/POST/PATCH /api/brand/voice` - Brand voice profile

### Topics
- `GET/POST/PATCH/DELETE /api/topics` - Topic management

### Articles
- `GET/PATCH/DELETE /api/articles` - Article management
- `POST /api/articles/generate` - Generate article

### CMS
- `GET/POST/PATCH/DELETE /api/cms/connections` - CMS connections

### Channels
- `GET/POST/PATCH/DELETE /api/channels` - Agent channels

### Billing
- `POST /api/billing/portal` - Stripe billing portal
- `GET /api/billing/usage` - Usage statistics

### Webhooks
- `POST /api/webhooks/clerk` - Clerk events
- `POST /api/webhooks/stripe` - Stripe events
- `POST /api/webhooks/telegram` - Telegram updates
- `POST /api/webhooks/slack/events` - Slack events
- `POST /api/webhooks/slack/interactions` - Slack interactions

## Database Schema

The database includes tables for:
- `tenants` - Multi-tenant organizations
- `users` - User accounts linked to Clerk
- `brand_corpus` - RAG content with embeddings
- `brand_voice_profiles` - Brand voice settings
- `topics` - Content topics/ideas
- `articles` - Generated articles
- `article_briefs` - Article outlines
- `cms_connections` - CMS integrations
- `agent_channels` - Notification channels
- `agent_conversations` - Conversation state
- `performance_snapshots` - GSC data
- `indexing_checks` - Index status tracking
- `activity_log` - Audit log

## Environment Variables

See `.env.example` for required environment variables.

## License

Private - Fensory Inc.
