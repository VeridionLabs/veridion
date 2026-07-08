import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAuditDto {
  @ApiProperty()
  @IsUUID()
  projectId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  commitHash?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contractPath?: string;
}

export class AuditQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
