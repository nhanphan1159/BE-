import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { CreateSubTaskDto } from './dto/create-subtask.dto';

// Normalizes any date to UTC Midnight to prevent timezone discrepancy with PostgreSQL Date
function parseDateOnly(dateInput: string | Date): Date {
  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }
    const d = new Date(dateInput);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
}

@Injectable()
export class TodosService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter?: { date?: string; month?: string; range?: 'today' | 'past' | 'future' | 'all' }) {
    const where: any = {};

    if (filter?.date) {
      const target = parseDateOnly(filter.date);
      where.targetDate = target;
    } else if (filter?.month) {
      const [year, month] = filter.month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      where.targetDate = { gte: startOfMonth, lte: endOfMonth };
    } else if (filter?.range && filter.range !== 'all') {
      const today = parseDateOnly(new Date());

      if (filter.range === 'today') {
        where.targetDate = today;
      } else if (filter.range === 'past') {
        where.targetDate = { lt: today };
      } else if (filter.range === 'future') {
        where.targetDate = { gt: today };
      }
    }

    return this.prisma.todo.findMany({
      where,
      include: {
        subtasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ targetDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
      include: {
        subtasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!todo) throw new NotFoundException(`Todo with ID ${id} not found`);
    return todo;
  }

  async create(createTodoDto: CreateTodoDto) {
    return this.prisma.todo.create({
      data: {
        title: createTodoDto.title,
        description: createTodoDto.description,
        targetDate: parseDateOnly(createTodoDto.targetDate),
        priority: createTodoDto.priority,
        status: createTodoDto.status,
      },
      include: {
        subtasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async update(id: string, updateTodoDto: UpdateTodoDto) {
    await this.findOne(id);
    const data: any = { ...updateTodoDto };
    if (updateTodoDto.targetDate) {
      data.targetDate = parseDateOnly(updateTodoDto.targetDate);
    }

    return this.prisma.todo.update({
      where: { id },
      data,
      include: {
        subtasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.todo.delete({
      where: { id },
    });
  }

  // Subtask Management - returns full updated todo to keep UI fresh
  async addSubTask(todoId: string, createSubTaskDto: CreateSubTaskDto) {
    await this.findOne(todoId);
    await this.prisma.subTask.create({
      data: {
        title: createSubTaskDto.title,
        isCompleted: createSubTaskDto.isCompleted ?? false,
        todoId,
      },
    });
    return this.findOne(todoId);
  }

  async toggleSubTask(subTaskId: string) {
    const subtask = await this.prisma.subTask.findUnique({
      where: { id: subTaskId },
    });
    if (!subtask) throw new NotFoundException(`SubTask not found`);

    const updated = await this.prisma.subTask.update({
      where: { id: subTaskId },
      data: { isCompleted: !subtask.isCompleted },
    });
    return this.findOne(updated.todoId);
  }

  async removeSubTask(subTaskId: string) {
    const subtask = await this.prisma.subTask.findUnique({
      where: { id: subTaskId },
    });
    if (!subtask) throw new NotFoundException(`SubTask not found`);

    await this.prisma.subTask.delete({
      where: { id: subTaskId },
    });
    return this.findOne(subtask.todoId);
  }
}
