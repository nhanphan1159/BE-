import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_FINANCE_RESET !== 'DELETE PRODUCTION DATA') {
    throw new Error('Set CONFIRM_FINANCE_RESET=DELETE PRODUCTION DATA before resetting finance data.');
  }

  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(databaseUrl) && process.env.ALLOW_LOCAL_RESET !== 'true') {
    throw new Error('Production reset refused because DATABASE_URL points to a local database.');
  }

  await prisma.$transaction([
    prisma.transactionEdit.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.jar.updateMany({ data: { balance: 0 } }),
  ]);

  console.log('Finance data reset successfully. All jar balances are 0.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
