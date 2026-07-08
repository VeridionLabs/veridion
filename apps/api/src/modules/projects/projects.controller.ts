import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created' })
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') userId: string) {
    return this.projectsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects for the current user' })
  findAll(@Query() query: ProjectQueryDto, @CurrentUser('id') userId: string) {
    return this.projectsService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.findOne(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.remove(id, userId);
  }
}
