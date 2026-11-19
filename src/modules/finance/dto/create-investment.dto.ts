import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateInvestmentDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  averageCost: number;

  @IsNumber()
  @IsPositive()
  currentPrice: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  targetPrice?: number;

  @IsString()
  @IsOptional()
  market?: string;

  @IsString()
  @IsOptional()
  sector?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
