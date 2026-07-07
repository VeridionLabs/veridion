import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @ApiProperty({ example: 'My DeFi Protocol' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'A decentralized exchange protocol' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://github.com/user/repo' })
  @IsString()
  @IsOptional()
  repoUrl?: string;

  @ApiProperty({ example: 'ethereum' })
  @IsString()
  chain: string;

  @ApiProperty({ example: 'solidity' })
  @IsString()
  language: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  organizationId?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Updated Name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  repoUrl?: string;
}

export class ProjectQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}
