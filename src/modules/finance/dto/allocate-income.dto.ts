import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class AllocateIncomeDto {
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  totalAmount: number;

  @IsString()
  @IsOptional()
  note?: string;

  // Custom percentages if user wants to tweak default 55/10/10/10/10/5
  @IsOptional()
  customAllocations?: {
    [key: string]: number; // jar type -> amount
  };
}
