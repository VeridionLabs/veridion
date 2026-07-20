import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production API Key' })
  @IsString()
  @MaxLength(100)
  name: string;
}

export class ApiKeyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  key?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastUsedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}
