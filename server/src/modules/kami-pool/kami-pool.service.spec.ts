import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KamiPoolService } from './kami-pool.service';
import { KamiPoolEntity, KamiItemEntity } from './kami-pool.entity';

/**
 * 卡密池服务单测示例。
 *
 * 重点验证资金相关逻辑：acquireItem 的悲观锁取卡密流程。
 * 使用 mock DataSource/Repository，不连真实 DB。
 *
 * 这是测试框架示例，证明 jest + ts-jest + @nestjs/testing 可用，
 * 后续团队可照此模式补充 releaseItem / releaseExpiredLocks 等用例。
 */
describe('KamiPoolService', () => {
  let service: KamiPoolService;
  let poolRepo: { findOne: jest.Mock };
  let itemRepo: Record<string, jest.Mock>;
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { createQueryBuilder: jest.Mock; save: jest.Mock };
  };

  beforeEach(async () => {
    poolRepo = { findOne: jest.fn() };
    itemRepo = {};

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn(),
        save: jest.fn(),
      },
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KamiPoolService,
        { provide: getRepositoryToken(KamiPoolEntity), useValue: poolRepo },
        { provide: getRepositoryToken(KamiItemEntity), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(KamiPoolService);
  });

  describe('acquireItem', () => {
    it('卡密池不存在时返回 null', async () => {
      poolRepo.findOne.mockResolvedValue(null);

      const result = await service.acquireItem(999, 1, 1);

      expect(result).toBeNull();
      expect(queryRunner.connect).not.toHaveBeenCalled();
    });

    it('有库存时锁定卡密并返回', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 1, tenantId: 1 });
      const item: Partial<KamiItemEntity> = {
        id: 10,
        poolId: 1,
        status: 'unused',
        content: 'CDK-XXXX',
      };
      // 模拟 createQueryBuilder 链式调用
      queryRunner.manager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(item),
      });
      queryRunner.manager.save.mockImplementation(async (saved) => saved);

      const result = await service.acquireItem(1, 100, 1);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('locked');
      expect(result!.orderId).toBe(100);
      expect(result!.lockedUntil).toBeInstanceOf(Date);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('无库存（unused 卡密为空）时返回 null 并提交事务', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 1, tenantId: 1 });
      queryRunner.manager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.acquireItem(1, 100, 1);

      expect(result).toBeNull();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('事务异常时回滚并抛出', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 1, tenantId: 1 });
      queryRunner.manager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockRejectedValue(new Error('DB 连接断开')),
      });

      await expect(service.acquireItem(1, 100, 1)).rejects.toThrow('DB 连接断开');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
