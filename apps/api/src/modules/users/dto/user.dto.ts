import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'G...XYZ' })
  @IsString()
  @IsOptional()
  walletAddress?: string;
}
