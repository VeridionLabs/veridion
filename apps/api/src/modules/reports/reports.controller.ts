import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/report.dto';

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
