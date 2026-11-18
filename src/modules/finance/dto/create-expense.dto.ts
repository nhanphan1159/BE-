import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { JarType } from '@prisma/client';

export class CreateExpenseDto {
  @IsEnum(JarType)
  @IsNotEmpty()
  jarType: JarType;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  transactionDate?: string;
}
