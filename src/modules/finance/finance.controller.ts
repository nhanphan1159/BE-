import { Controller, Get, Post, Body, Query, Patch, Param, Delete } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AllocateIncomeDto } from './dto/allocate-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JarType } from '@prisma/client';
import { CreateInvestmentDto } from './dto/create-investment.dto';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  getSummary() {
    return this.financeService.getFinancialSummary();
  }

  @Get('jars')
  getJars() {
    return this.financeService.getJars();
  }

  @Post('income/allocate')
  allocateIncome(@Body() dto: AllocateIncomeDto) {
    return this.financeService.allocateIncome(dto);
  }

  @Post('expense')
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(dto);
  }

  @Patch('expense/:id')
  updateExpense(@Param('id') id: string, @Body() dto: CreateExpenseDto) {
    return this.financeService.updateExpense(id, dto);
  }

  @Get('transactions/:id/history')
  getTransactionHistory(@Param('id') id: string) {
    return this.financeService.getTransactionHistory(id);
  }

  @Get('transactions')
  getTransactions(
    @Query('jarType') jarType?: JarType,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.financeService.getTransactions({ jarType, limit: parsedLimit, month, year });
  }

  @Get('period-comparison')
  getPeriodComparison(
    @Query('groupBy') groupBy: 'month' | 'year' = 'month',
    @Query('year') year?: string,
    @Query('period') period?: string,
  ) {
    return this.financeService.getPeriodComparison(groupBy, year, period);
  }

  @Get('investments')
  getInvestments() {
    return this.financeService.getInvestments();
  }

  @Post('investments')
  createInvestment(@Body() dto: CreateInvestmentDto) {
    return this.financeService.createInvestment(dto);
  }

  @Patch('investments/:id')
  updateInvestment(@Param('id') id: string, @Body() dto: CreateInvestmentDto) {
    return this.financeService.updateInvestment(id, dto);
  }

  @Delete('investments/:id')
  deleteInvestment(@Param('id') id: string) {
    return this.financeService.deleteInvestment(id);
  }

  @Post('ai/analyze')
  analyzePortfolio(@Body() body: { symbols?: string[] }) {
    return this.financeService.analyzeInvestmentsWithAi(body?.symbols);
  }
}
