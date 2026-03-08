# Koinonia Fellowship Trading Platform — Market Readiness Plan

## Phase 1: Critical Safety & Trust ✅ COMPLETE
> Prevent harm, establish trust signals

### 1.1 Remove Silent Mock Data Fallback ✅
- ✅ Replaced mock data generation with clear error states (SchwabPortfolio, SchwabOrderEntry)
- ✅ Added persistent LIVE / DELAYED / SIMULATED badge via reusable `DataSourceBadge` component
- ✅ Show explicit error toasts instead of fake data
- ✅ Added `ConnectionHealthIndicator` in navigation bar

### 1.2 Data Source Transparency ✅
- ✅ `DataSourceBadge` component shows source chip on charts, quotes, live prices
- ✅ Surfaces last-successful-fetch timestamp with tooltip
- ✅ Stale data detection (>5 min) with visual warning

### 1.3 Legal & Compliance Foundations ✅
- ✅ Added Terms of Service modal with comprehensive trading disclaimers
- ✅ Added SEC/FINRA disclaimers on AI signals and trade suggestions
- ✅ Added "Not Investment Advice" banners on all AI analysis components
- ✅ Added global `DisclaimerBanner` component
- ✅ Removed false "SEC Compliant" / "FINRA Registered" claims
- ✅ Reframed all language as educational software tool
- Research RIA registration requirements (external legal task)

---

## Phase 2: Security Hardening (Week 2-3)
> Protect user credentials and data

### 2.1 Credential Encryption
- Audit all stored broker credentials — ensure encryption at rest using CREDENTIALS_ENCRYPTION_KEY
- Encrypt Schwab tokens, Alpaca keys, PocketOption SSID before DB storage
- Add encryption/decryption utility used consistently across all edge functions

### 2.2 Rate Limiting & Abuse Prevention
- Add rate limiting middleware to all public-facing edge functions
- Implement per-user request throttling (e.g., 60 req/min for quotes, 10 req/min for trades)
- Add CAPTCHA or proof-of-work on auth endpoints

### 2.3 Audit Logging
- Create `audit_log` table tracking all trade executions, credential changes, and settings modifications
- Log IP address, user agent, and action details
- Admin dashboard view for audit trail

### 2.4 Token Refresh Reliability
- Build background token refresh for Schwab OAuth (proactive, not reactive)
- Add token expiry monitoring with user notifications
- Graceful degradation: lock trading UI (not show mock data) when tokens expire

---

## Phase 3: Universal Broker Integration (Week 3-6)
> Users sign in to their brokerage through the app — no developer accounts needed

### 3.1 Research & Select Aggregation Provider
- Evaluate **Mesh Connect** (formerly Front Finance) — supports Schwab, Fidelity, E*TRADE, Robinhood, etc.
- Evaluate **Plaid Investments** — portfolio read access
- Evaluate **SnapTrade** — trading API aggregator
- Decision: Pick one provider that supports both read AND trade execution

### 3.2 Implement Universal Broker OAuth
- Create `connect-brokerage` edge function using chosen provider SDK
- Build "Connect Your Brokerage" UI flow:
  - User clicks "Connect Broker" → provider's hosted OAuth window opens
  - User logs into their brokerage (Schwab, Fidelity, etc.)
  - Token returned and stored securely
- Remove requirement for users to create Schwab developer apps

### 3.3 Normalize Broker Data
- Create unified data interfaces: `BrokerAccount`, `BrokerPosition`, `BrokerOrder`
- Map each broker's response format to unified schema
- Update all trading components to use normalized interfaces

### 3.4 Retire Legacy Broker Functions
- Deprecate `execute-td-trade` (TD Ameritrade API is sunset)
- Deprecate `execute-etrade-trade` (placeholder, non-functional)
- Clean up unused credential fields from `user_api_credentials`

---

## Phase 4: Multi-Tenant / Organization Support (Week 6-8)
> Scale from individual traders to teams and firms

### 4.1 Organization Data Model
- Create `organizations` table (name, type, created_by, settings)
- Create `org_members` table (org_id, user_id, role: owner/admin/trader/viewer)
- Create `org_risk_policies` table (max position size, allowed symbols, daily loss limits per trader)

### 4.2 Org Admin Dashboard
- Org creation and member invitation flow
- Role-based access: Risk Manager sees all positions, Trader sees own
- Aggregated P&L across all org traders
- Compliance officer view: audit logs, trade reviews

### 4.3 Org-Level Risk Controls
- Per-trader position limits enforced server-side
- Org-wide daily loss circuit breaker
- Symbol allowlist/blocklist per org
- Pre-trade risk check edge function

---

## Phase 5: Platform Polish & UX (Week 8-10)
> Professional-grade user experience

### 5.1 Mobile Responsive Trading
- Redesign trading dashboard for tablet/mobile breakpoints
- Collapsible panels, swipeable tabs for chart/positions/orders
- Touch-friendly order entry

### 5.2 Onboarding Wizard
- Step-by-step setup: Profile → Connect Broker → Set Risk Preferences → First Trade Tutorial
- Progressive disclosure of advanced features
- Contextual help tooltips throughout

### 5.3 Notification System
- Web Push notifications for price alerts, order fills, risk warnings
- Email notifications for critical events (margin call, daily loss limit hit)
- In-app notification center with history

### 5.4 Status & Health Page
- Real-time API health monitoring (Schwab, Polygon, FMP status)
- System status banner when any data source is degraded
- Uptime tracking

---

## Phase 6: Advanced Trading Features (Week 10-12)
> Elite-level capabilities

### 6.1 Options Flow
- Unusual options activity scanner
- Multi-leg options builder (spreads, strangles, iron condors)
- Options P&L visualization with Greeks

### 6.2 Level 2 / Market Depth
- Order book visualization component
- Time & Sales with filtering
- DOM (Depth of Market) trading ladder

### 6.3 Advanced Order Types
- Bracket orders with OCO (One-Cancels-Other)
- Trailing stop with configurable triggers
- Conditional orders (if SPY drops 2%, sell XYZ)
- Tax lot selection for sells

### 6.4 Portfolio Intelligence
- Sector/industry exposure breakdown
- Correlation matrix across holdings
- Dividend calendar and income projection
- Tax-loss harvesting suggestions

---

## Phase 7: Scalability & Infrastructure (Ongoing)
> Prepare for thousands of concurrent users

### 7.1 Caching Layer
- Redis/edge caching for market data (same quote served to all users requesting AAPL)
- Cache invalidation strategy per data type
- Reduce redundant API calls by 80%+

### 7.2 WebSocket Connection Pooling
- Shared WebSocket connections for market data
- Fan-out architecture: one Polygon connection serves many users
- Connection health monitoring and auto-reconnect

### 7.3 Database Optimization
- Add indexes on frequently queried columns (user_id + symbol, timestamps)
- Partition large tables (candles, predictions) by date
- Archive old data to cold storage

### 7.4 Monitoring & Observability
- Error tracking (Sentry or similar)
- Performance metrics dashboard
- Alerting on error rate spikes, slow queries, API failures

---

## Priority Matrix

| Phase | Impact | Effort | Risk if Skipped |
|-------|--------|--------|-----------------|
| P1: Safety | 🔴 Critical | Low | Users trade on fake data |
| P2: Security | 🔴 Critical | Medium | Credential breach |
| P3: Broker Integration | 🔴 Critical | High | Can't go to market |
| P4: Multi-Tenant | 🟡 High | High | Limited to individuals |
| P5: UX Polish | 🟡 High | Medium | Poor retention |
| P6: Advanced Features | 🟢 Medium | High | Feature gap vs competitors |
| P7: Infrastructure | 🟢 Medium | Medium | Scaling problems later |

---

## Key External Dependencies
- [ ] Legal counsel for RIA/compliance review
- [ ] Mesh Connect or SnapTrade partnership/API access
- [ ] Schwab API partner application (if not using aggregator)
- [ ] SSL certificate for custom domain
- [ ] Apple Developer account (if PWA push notifications needed)
