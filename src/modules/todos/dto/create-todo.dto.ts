import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Priority, TodoStatus } from '@prisma/client';

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  targetDate: string; // YYYY-MM-DD format

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsEnum(TodoStatus)
  @IsOptional()
  status?: TodoStatus;
}
