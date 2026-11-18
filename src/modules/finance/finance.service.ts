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
    const { totalAmount, note, customAllocations } = dto;
    const jars = await this.getJars();

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
            transactionDate: new Date(),
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

  async getTransactions(params?: { jarType?: JarType; limit?: number }) {
    const where: any = {};
    if (params?.jarType) {
      where.jar = { type: params.jarType };
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
