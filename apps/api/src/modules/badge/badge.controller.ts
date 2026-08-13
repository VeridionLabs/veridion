import { Controller, Get, Param, Response } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';

import { BadgeService } from './badge.service';

@ApiTags('Badge')
@Controller('badge')
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get(':contractId.svg')
  @ApiOperation({ summary: 'Get dynamic SVG security badge for a contract' })
  async getBadge(
    @Param('contractId') contractId: string,
    @Response() response: ExpressResponse,
  ) {
    const svg = await this.badgeService.generateBadge(contractId);
    
    response.set('Content-Type', 'image/svg+xml');
    response.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    response.send(svg);
  }
}
