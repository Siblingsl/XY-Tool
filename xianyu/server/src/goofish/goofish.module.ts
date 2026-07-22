import { Module } from '@nestjs/common';
import { GoofishSdkService } from './goofish-sdk.service';
import { GoofishMtopService } from './goofish-mtop.service';
import { ImWebSocketService } from './im-websocket.service';

@Module({
  providers: [GoofishSdkService, GoofishMtopService, ImWebSocketService],
  exports: [GoofishSdkService, GoofishMtopService, ImWebSocketService],
})
export class GoofishModule {}
