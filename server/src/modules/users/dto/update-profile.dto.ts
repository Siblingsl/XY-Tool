import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 修改昵称 DTO */
export class UpdateProfileDto {
  @ApiProperty({ description: '新昵称', example: '小明' })
  @IsString()
  @MaxLength(50, { message: '昵称最多 50 个字符' })
  nickname: string;
}
