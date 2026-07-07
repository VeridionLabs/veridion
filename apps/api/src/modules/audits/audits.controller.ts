import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditsService } from './audits.service';
import { CreateAuditDto, AuditQueryDto } from './dto/audit.dto';

@ApiTags('Audits')
@Controller('audits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new audit scan' })
  create(@Body() dto: CreateAuditDto, @CurrentUser('id') userId: string) {
    return this.auditsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List audits' })
  findAll(@Query() query: AuditQueryDto, @CurrentUser('id') userId: string) {
    return this.auditsService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get audit by ID with findings' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.auditsService.findOne(id, userId);
  }
}
