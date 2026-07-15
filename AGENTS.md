# Barventis — Agent Instructions

## Tech Stack
- **Frontend:** React 19 + Vite 8 + React Router DOM 7
- **Backend:** Supabase Cloud (PostgreSQL 15, Auth, Storage)
- **Styling:** Pure CSS3 glassmorphism + CSS variables (no Tailwind)
- **Tests:** Vitest
- **Deploy:** Vercel

## Conventions
- **ponytail skill is ACTIVE** — prefer minimal code, reuse existing patterns, YAGNI
- All Supabase calls go through `src/services/api.js` (single API surface)
- Unit conversion utils live in `src/services/costUtils.js` (single source of truth for HPP)
- Multi-tenancy enforced via PostgreSQL RLS on all tables + DB triggers
- Critical ops use atomic PL/pgSQL RPCs (`receive_invoice_atomic`, `complete_opname_atomic`, etc.)
- Auth state managed in `src/contexts/AuthContext.jsx`
- Data fetching/caching in `src/contexts/DataContext.jsx`

## Key Files
| File | Purpose |
|------|---------|
| `src/services/api.js` | All Supabase API calls (~1700 lines) |
| `src/services/costUtils.js` | Unit conversion + ingredient cost calculation |
| `src/services/maintenanceService.js` | Stock adjustment + opname operations |
| `src/contexts/AuthContext.jsx` | Auth state + login/logout/register |
| `src/contexts/DataContext.jsx` | Data fetching + caching |
| `database/supabase_schema_complete.sql` | Single source of truth for DB schema |

## Testing
```bash
npm test          # run all tests
npm run test:watch # watch mode
```

## Common Tasks
- **Add new API endpoint:** Add method to `api.js`, update `DataContext.jsx` if needed
- **Add new page:** Create in `src/pages/`, add route in `App.jsx`
- **Add new DB column:** Update `supabase_schema_complete.sql`, update relevant API methods
- **Fix HPP calculation:** Edit `src/services/costUtils.js` — all cost logic lives here
