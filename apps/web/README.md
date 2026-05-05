# TradeVault — Trading Journal App

A premium, self-hosted trading journal built with Next.js 14, TypeScript, and Prisma.

![TradeVault Dashboard](./public/dashboard-mock.png)

## Features
- **Dashboard**: Equity curve, key metrics, and daily P&L.
- **Trade Log**: Searchable, filterable history of all trades.
- **Analytics**: Advanced breakdown by strategy, symbol, and day of week.
- **Journal**: Daily psychological journal with mood and confidence tracking.
- **Calendar**: Monthly heat-map of trading performance.
- **Dark Mode**: Premium dark UI designed for focus.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser.

### 3. Database Setup (Optional for Demo)
The app currently runs with **mock data** for demonstration. To connect a real database:

1. Create a `.env` file:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/tradevault"
   NEXTAUTH_SECRET="your-secret"
   ```
2. Push schema to DB:
   ```bash
   npx prisma db push
   ```
3. Run the seed script:
   ```bash
   npx prisma db seed
   ```

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: CSS Modules (Vanilla CSS)
- **Database**: PostgreSQL (via Prisma ORM)
- **Icons**: Lucide React
- **Charts**: Custom SVG + CSS charts (for zero bundle bloat)

## License
MIT
