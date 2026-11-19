import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarType, TransactionType } from '@prisma/client';
import { AllocateIncomeDto } from './dto/allocate-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';

const DEFAULT_JARS = [
  {
    type: JarType.NEC,
    name: 'Necessities (NEC)',
    targetPercentage: 55,
    color: '#3b82f6',
    description: 'Living expenses, rent, groceries, utilities, transportation (55%)',
  },
  {
    type: JarType.FFA,
    name: 'Financial Freedom (FFA)',
    targetPercentage: 10,
    color: '#10b981',
    description: 'Babylon Rule: Pay yourself first 10% for wealth-generating investments',
  },
  {
    type: JarType.LTSS,
    name: 'Long-term Savings (LTSS)',
    targetPercentage: 10,
    color: '#8b5cf6',
    description: 'Emergency fund, future large purchases, long-term goals (10%)',
  },
  {
    type: JarType.EDU,
    name: 'Education (EDU)',
    targetPercentage: 10,
    color: '#f59e0b',
    description: 'Self-development, courses, books, personal growth (10%)',
  },
  {
    type: JarType.PLAY,
    name: 'Play (PLAY)',
    targetPercentage: 10,
    color: '#ec4899',
    description: 'Entertainment, leisure, travel, dining out, relaxation (10%)',
  },
  {
    type: JarType.GIVE,
    name: 'Give (GIVE)',
    targetPercentage: 5,
    color: '#06b6d4',
    description: 'Charity, community support, gifts for family and friends (5%)',
  },
];

@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.initDefaultJars();
    } catch {
      // Will initialize when database is connected
    }
  }

  async initDefaultJars() {
    const count = await this.prisma.jar.count();
    if (count === 0) {
      for (const jar of DEFAULT_JARS) {
        await this.prisma.jar.create({
          data: {
            ...jar,
            balance: 0,
          },
        });
      }
    }
  }

  async getJars() {
    await this.initDefaultJars();
    return this.prisma.jar.findMany({
      orderBy: { targetPercentage: 'desc' },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });
  }

  async allocateIncome(dto: AllocateIncomeDto) {
    const { totalAmount, note, customAllocations, transactionDate } = dto;
    const jars = await this.getJars();
    const allocatedDate = transactionDate ? new Date(transactionDate) : new Date();

    const transactions = [];

    for (const jar of jars) {
      let jarAmount = 0;
      if (customAllocations && customAllocations[jar.type] !== undefined) {
        jarAmount = customAllocations[jar.type];
      } else {
        jarAmount = Math.round((totalAmount * jar.targetPercentage) / 100);
      }

      if (jarAmount > 0) {
        const updatedJar = await this.prisma.jar.update({
          where: { type: jar.type },
          data: { balance: { increment: jarAmount } },
        });

        const tx = await this.prisma.transaction.create({
          data: {
            jarId: updatedJar.id,
            amount: jarAmount,
            type: TransactionType.INCOME,
            category: 'Income Allocation',
            note: note || `Income allocated to ${jar.name}`,
            transactionDate: allocatedDate,
          },
        });
        transactions.push(tx);
      }
    }

    return {
      success: true,
      totalAllocated: totalAmount,
      transactions,
    };
  }

  async createExpense(dto: CreateExpenseDto) {
    const { jarType, amount, category, note, transactionDate } = dto;

    const jar = await this.prisma.jar.findUnique({
      where: { type: jarType },
    });

    if (!jar) {
      throw new BadRequestException(`Jar ${jarType} not found`);
    }

    const updatedJar = await this.prisma.jar.update({
      where: { type: jarType },
      data: { balance: { decrement: amount } },
    });

    const tx = await this.prisma.transaction.create({
      data: {
        jarId: jar.id,
        amount,
        type: TransactionType.EXPENSE,
        category: category || 'General Expense',
        note: note || '',
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      },
    });

    return {
      transaction: tx,
      currentJarBalance: updatedJar.balance,
      isOverspent: updatedJar.balance < 0,
    };
  }

  async updateExpense(id: string, dto: CreateExpenseDto) {
    const existing = await this.prisma.transaction.findUnique({ where: { id }, include: { jar: true } });
    if (!existing || existing.type !== TransactionType.EXPENSE) throw new BadRequestException('Expense not found');
    const nextJar = await this.prisma.jar.findUnique({ where: { type: dto.jarType } });
    if (!nextJar) throw new BadRequestException(`Jar ${dto.jarType} not found`);
    return this.prisma.$transaction(async (tx) => {
      await tx.transactionEdit.create({ data: { transactionId: id, snapshot: { jarId: existing.jarId, amount: existing.amount, category: existing.category, note: existing.note, transactionDate: existing.transactionDate.toISOString() } } });
      if (existing.jarId === nextJar.id) {
        await tx.jar.update({ where: { id: existing.jarId }, data: { balance: { increment: existing.amount - dto.amount } } });
      } else {
        await tx.jar.update({ where: { id: existing.jarId }, data: { balance: { increment: existing.amount } } });
        await tx.jar.update({ where: { id: nextJar.id }, data: { balance: { decrement: dto.amount } } });
      }
      return tx.transaction.update({ where: { id }, data: { jarId: nextJar.id, amount: dto.amount, category: dto.category || 'General Expense', note: dto.note || '', transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : existing.transactionDate }, include: { jar: { select: { name: true, type: true, color: true } }, editHistory: { orderBy: { editedAt: 'desc' } } } });
    });
  }

  async getTransactionHistory(id: string) {
    return this.prisma.transactionEdit.findMany({ where: { transactionId: id }, orderBy: { editedAt: 'desc' } });
  }

  async getTransactions(params?: { jarType?: JarType; limit?: number; month?: string; year?: string }) {
    const where: any = {};
    if (params?.jarType) {
      where.jar = { type: params.jarType };
    }
    if (params?.month) {
      const match = params.month.match(/^(\d{4})-(\d{2})$/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        where.transactionDate = {
          gte: new Date(Date.UTC(year, month, 1)),
          lt: new Date(Date.UTC(year, month + 1, 1)),
        };
      }
    } else if (params?.year) {
      const year = Number(params.year);
      if (Number.isInteger(year)) {
        where.transactionDate = {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        };
      }
    }

    return this.prisma.transaction.findMany({
      where,
      take: params?.limit || 500,
      orderBy: { transactionDate: 'desc' },
      include: {
        jar: {
          select: { name: true, type: true, color: true },
        },
      },
    });
  }

  async getPeriodComparison(groupBy: 'month' | 'year', year?: string, period?: string) {
    const transactions = await this.prisma.transaction.findMany({
      select: { amount: true, type: true, transactionDate: true },
      orderBy: { transactionDate: 'asc' },
    });

    const sumPeriod = (start: Date, end: Date) => {
      const periodTransactions = transactions.filter((tx) =>
        tx.transactionDate >= start && tx.transactionDate < end,
      );
      const income = periodTransactions
        .filter((tx) => tx.type === TransactionType.INCOME)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const expense = periodTransactions
        .filter((tx) => tx.type === TransactionType.EXPENSE)
        .reduce((sum, tx) => sum + tx.amount, 0);
      return { income, expense, net: income - expense };
    };

    if (groupBy === 'year') {
      const selectedYear = period && /^\d{4}$/.test(period)
        ? Number(period)
        : year && /^\d{4}$/.test(year)
          ? Number(year)
          : new Date().getUTCFullYear();

      return [-1, 0, 1].map((offset) => {
        const value = selectedYear + offset;
        const start = new Date(Date.UTC(value, 0, 1));
        const end = new Date(Date.UTC(value + 1, 0, 1));
        return {
          label: String(value),
          period: String(value),
          ...sumPeriod(start, end),
        };
      });
    }

    const monthMatch = period?.match(/^(\d{4})-(\d{2})$/);
    const selectedYear = monthMatch
      ? Number(monthMatch[1])
      : year && /^\d{4}$/.test(year)
        ? Number(year)
        : new Date().getUTCFullYear();
    const selectedMonth = monthMatch ? Number(monthMatch[2]) - 1 : new Date().getUTCMonth();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return [-1, 0, 1].map((offset) => {
      const date = new Date(Date.UTC(selectedYear, selectedMonth + offset, 1));
      const valueYear = date.getUTCFullYear();
      const valueMonth = date.getUTCMonth();
      const periodValue = `${valueYear}-${String(valueMonth + 1).padStart(2, '0')}`;
      return {
        label: `${monthNames[valueMonth]} ${valueYear}`,
        period: periodValue,
        ...sumPeriod(
          new Date(Date.UTC(valueYear, valueMonth, 1)),
          new Date(Date.UTC(valueYear, valueMonth + 1, 1)),
        ),
      };
    });
  }

  async getFinancialSummary() {
    const jars = await this.getJars();
    const totalBalance = jars.reduce((acc, curr) => acc + curr.balance, 0);

    const investmentAndSavings = jars
      .filter((j) => j.type === JarType.FFA || j.type === JarType.LTSS)
      .reduce((acc, curr) => acc + curr.balance, 0);

    const ffaJar = jars.find((j) => j.type === JarType.FFA);

    return {
      totalBalance,
      investmentAndSavings,
      babylonAsset: ffaJar ? ffaJar.balance : 0,
      jars,
    };
  }
}
