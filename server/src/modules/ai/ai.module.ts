import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfigEntity } from './ai-config.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

/**
 * 全系统公共 AI 接入（OpenAI 兼容）。
 * Global 导出 AiService，业务模块直接注入即可。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiConfigEntity])],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
