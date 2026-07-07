import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';

export class AiChatDto {
  @ApiProperty()
  @IsUUID()
  auditId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  context?: {
    findingId?: string;
    codeSnippet?: string;
  };
}
