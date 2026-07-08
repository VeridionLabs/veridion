import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateReportDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate audit report' })
  generate(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generate(userId, dto);
  }

  @Get(':auditId')
  @ApiOperation({ summary: 'Get report for an audit' })
  getReport(@Param('auditId') auditId: string, @CurrentUser('id') userId: string) {
    return this.reportsService.getReport(auditId, userId);
  }
}
