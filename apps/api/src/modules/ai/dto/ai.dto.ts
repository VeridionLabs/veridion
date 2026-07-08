import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
