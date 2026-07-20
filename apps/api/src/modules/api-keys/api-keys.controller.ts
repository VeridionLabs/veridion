import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List all API keys for current user' })
  findAll(@CurrentUser('id') userId: string) {
    return this.apiKeysService.findByUser(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@CurrentUser('id') userId: string, @Param('id') keyId: string) {
    return this.apiKeysService.revoke(userId, keyId);
  }
}
