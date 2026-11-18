import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TodosModule } from './modules/todos/todos.module';
import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [PrismaModule, TodosModule, FinanceModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
