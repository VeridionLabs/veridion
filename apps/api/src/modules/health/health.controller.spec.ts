import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health status', async () => {
    const result = await controller.check();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('version');
  });

  it('should return ready status', async () => {
    const result = await controller.ready();
    expect(result.status).toBe('ready');
  });
});
