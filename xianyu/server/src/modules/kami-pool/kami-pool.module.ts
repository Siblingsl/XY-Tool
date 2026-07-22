import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KamiPoolEntity, KamiItemEntity } from './kami-pool.entity';
import { KamiPoolService } from './kami-pool.service';
import { KamiPoolController } from './kami-pool.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KamiPoolEntity, KamiItemEntity])],
  providers: [KamiPoolService],
  controllers: [KamiPoolController],
  exports: [KamiPoolService],
})
export class KamiPoolModule {}
