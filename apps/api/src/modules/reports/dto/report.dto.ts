import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsEnum, IsBoolean, IsOptional } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty()
  @IsUUID()
  auditId: string;

  @ApiProperty({ enum: ['PDF', 'MARKDOWN', 'HTML', 'JSON'] })
  @IsEnum(['PDF', 'MARKDOWN', 'HTML', 'JSON'])
  format: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  includeAiSummary: boolean = true;
}
