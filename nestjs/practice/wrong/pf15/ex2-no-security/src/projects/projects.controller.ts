import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permissions } from '../auth/decorators.js'
import { ApiErrors } from '../common/openapi.js'
import { UUID } from '../common/uuid.pipe.js'
import { CreateProjectDto, ListQuery, UpdateProjectDto } from './projects.dto.js'
import { ProjectsService } from './projects.service.js'

@ApiTags('projects')
@ApiErrors(401, 403)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Permissions('projects:write')
  @Post()
  @ApiErrors(400)
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto)
  }

  @Permissions('projects:read')
  @Get()
  @ApiErrors(400)
  list(@Query() q: ListQuery) {
    return this.projects.list(q.cursor, q.limit)
  }

  @Permissions('projects:read')
  @Get(':id')
  @ApiErrors(404)
  get(@Param('id', UUID) id: string) {
    return this.projects.get(id)
  }

  @Permissions('projects:write')
  @Patch(':id')
  @ApiErrors(400, 404)
  update(@Param('id', UUID) id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto)
  }

  @Permissions('projects:delete')
  @Delete(':id')
  @HttpCode(204)
  @ApiErrors(404)
  remove(@Param('id', UUID) id: string) {
    return this.projects.remove(id)
  }
}
