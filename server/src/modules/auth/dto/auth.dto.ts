import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 注册 DTO */
export class RegisterDto {
  @ApiProperty({ description: '用户名（3-50位，字母数字_@.-）', example: 'shopadmin' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_@.-]+$/, {
    message: '用户名只能包含字母、数字、_@.-',
  })
  username: string;

  @ApiProperty({ description: '密码（至少6位）', example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64)
  password: string;

  @ApiProperty({ description: '昵称（可选）', required: false, example: '小明' })
  @IsString()
  @MaxLength(50)
  nickname?: string;
}

/** 登录 DTO */
export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'shopadmin' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ description: '密码', example: 'secret123' })
  @IsString()
  password: string;
}
