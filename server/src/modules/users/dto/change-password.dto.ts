import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 修改密码 DTO。
 * 规则与注册保持一致（至少 6 位），并要求提供旧密码。
 */
export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码', example: 'oldsecret123' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ description: '新密码（至少 6 位，不能含空格）', example: 'newsecret456', minLength: 6 })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64)
  @Matches(/^\S+$/, { message: '密码不能包含空格' })
  newPassword: string;
}
