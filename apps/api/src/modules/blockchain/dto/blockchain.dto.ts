import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class VerifyAuditDto {
  @ApiProperty()
  @IsUUID()
  auditId: string;

  @ApiProperty({ example: 'G...XYZ' })
  @IsString()
  walletAddress: string;
}
