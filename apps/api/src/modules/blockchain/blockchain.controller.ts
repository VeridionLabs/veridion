import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlockchainService } from './blockchain.service';
import { VerifyAuditDto } from './dto/blockchain.dto';

@ApiTags('Blockchain')
@Controller('blockchain')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify audit on Stellar blockchain' })
  verify(@Body() dto: VerifyAuditDto, @CurrentUser('id') userId: string) {
    return this.blockchainService.verify(userId, dto);
  }

  @Get('audit/:auditId')
  @ApiOperation({ summary: 'Get on-chain verification status' })
  getVerification(@Param('auditId') auditId: string) {
    return this.blockchainService.getVerification(auditId);
  }
}
