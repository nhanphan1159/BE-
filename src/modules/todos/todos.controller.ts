import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { CreateSubTaskDto } from './dto/create-subtask.dto';

@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  findAll(
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Query('range') range?: 'today' | 'past' | 'future' | 'all',
  ) {
    return this.todosService.findAll({ date, month, range });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.todosService.findOne(id);
  }

  @Post()
  create(@Body() createTodoDto: CreateTodoDto) {
    return this.todosService.create(createTodoDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTodoDto: UpdateTodoDto) {
    return this.todosService.update(id, updateTodoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.todosService.remove(id);
  }

  @Post(':id/subtasks')
  addSubTask(@Param('id') id: string, @Body() createSubTaskDto: CreateSubTaskDto) {
    return this.todosService.addSubTask(id, createSubTaskDto);
  }

  @Patch('subtasks/:subtaskId/toggle')
  toggleSubTask(@Param('subtaskId') subtaskId: string) {
    return this.todosService.toggleSubTask(subtaskId);
  }

  @Delete('subtasks/:subtaskId')
  removeSubTask(@Param('subtaskId') subtaskId: string) {
    return this.todosService.removeSubTask(subtaskId);
  }
}
