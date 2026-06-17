import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** 注册 DTO */
export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_@.-]+$/, {
    message: '用户名只能包含字母、数字、_@.-',
  })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64)
  password: string;

  @IsString()
  @MaxLength(50)
  nickname?: string;
}

/** 登录 DTO */
export class LoginDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  password: string;
}
