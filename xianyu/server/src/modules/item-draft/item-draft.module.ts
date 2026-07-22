import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemDraftController } from './item-draft.controller';
import { ItemDraftFilesController } from './item-draft-files.controller';
import { ItemDraftEntity } from './item-draft.entity';
import { ItemDraftService } from './item-draft.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemDraftEntity])],
  controllers: [ItemDraftController, ItemDraftFilesController],
  providers: [ItemDraftService],
  exports: [ItemDraftService],
})
export class ItemDraftModule {}
