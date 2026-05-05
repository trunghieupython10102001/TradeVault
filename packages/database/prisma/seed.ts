
import { PrismaClient, TradeSide, TradeStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';
import 'dotenv/config';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  // 1. Create User
  const passwordHash = await hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'trader@example.com' },
    update: {},
    create: {
      email: 'trader@example.com',
      name: 'Demo Trader',
      passwordHash,
    },
  });

  console.log(`Created user: ${user.id}`);

  // 2. Create Account
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Paper Trading',
      broker: 'Interactive Brokers',
      initialBalance: 100000,
      currency: 'USD',
      isDefault: true,
    },
  });

  console.log(`Created account: ${account.id}`);

  // 3. Create Tags
  const strategies = ['Breakout', 'Trend Follow', 'Mean Reversion', 'Scalping', 'Swing'];
  await prisma.tag.createMany({
    data: strategies.map((s) => ({
      userId: user.id,
      name: s,
      color: '#6366f1',
    })),
    skipDuplicates: true,
  });

  // 4. Create Trades
  const trades = [
    {
      symbol: 'AAPL',
      side: TradeSide.LONG,
      status: TradeStatus.CLOSED,
      entryPrice: 198.50,
      exitPrice: 203.20,
      quantity: 100,
      pnl: 470.00, // (203.20 - 198.50) * 100 = 470
      pnlPercent: 2.37,
      strategy: 'Breakout',
      entryDate: new Date('2026-02-11T10:30:00Z'),
      exitDate: new Date('2026-02-11T14:45:00Z'),
      rating: 4,
    },
    {
      symbol: 'TSLA',
      side: TradeSide.SHORT,
      status: TradeStatus.CLOSED,
      entryPrice: 312.00,
      exitPrice: 319.50,
      quantity: 30,
      pnl: -225.00, // (312 - 319.5) * 30 = -225
      pnlPercent: -2.4,
      strategy: 'Mean Reversion',
      entryDate: new Date('2026-02-11T09:35:00Z'),
      exitDate: new Date('2026-02-11T11:20:00Z'),
      rating: 2,
    },
    {
      symbol: 'NVDA',
      side: TradeSide.LONG,
      status: TradeStatus.CLOSED,
      entryPrice: 875.00,
      exitPrice: 897.50,
      quantity: 40,
      pnl: 900.00, // (897.5 - 875) * 40 = 900
      pnlPercent: 2.57,
      strategy: 'Trend Follow',
      entryDate: new Date('2026-02-10T10:00:00Z'),
      exitDate: new Date('2026-02-10T15:30:00Z'),
      rating: 5,
    },
    {
      symbol: 'SPY',
      side: TradeSide.LONG,
      status: TradeStatus.OPEN,
      entryPrice: 502.30,
      quantity: 200,
      strategy: 'Swing',
      entryDate: new Date('2026-02-12T09:30:00Z'),
      rating: 0,
    },
  ];

  for (const t of trades) {
    await prisma.trade.create({
      data: {
        userId: user.id,
        accountId: account.id,
        ...t,
      },
    });
  }

  console.log(`Seeded ${trades.length} trades.`);

  // 5. Create Journal Entry
  await prisma.journalEntry.create({
    data: {
      userId: user.id,
      entryDate: new Date('2026-02-11T00:00:00Z'),
      content: 'Solid day of trading. Stuck to my plan and executed well on the AAPL breakout setup.',
      mood: 'GOOD',
      confidenceLevel: 8,
    },
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
