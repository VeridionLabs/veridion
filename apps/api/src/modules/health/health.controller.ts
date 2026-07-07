import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { prisma } from '@veridion/database';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  async check() {
    let dbStatus = 'unhealthy';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'healthy';
    } catch {
      // DB is down
    }

    return {
      status: dbStatus === 'healthy' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'healthy',
        database: dbStatus,
      },
      version: '0.1.0',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  async ready() {
    return { status: 'ready' };
  }
}
