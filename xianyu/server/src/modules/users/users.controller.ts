import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * 个人中心接口。
 */
@ApiTags('个人中心')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '查看个人信息' })
  async me(@CurrentUser() user: JwtPayload) {
    const u = await this.usersService.findById(user.sub);
    return {
      id: u?.id,
      username: u?.username,
      nickname: u?.nickname,
      role: u?.role,
      tenantId: u?.tenantId,
      createdAt: u?.createdAt,
    };
  }

  @Put('profile')
  @ApiOperation({ summary: '修改昵称' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.usersService.updateNickname(user.sub, dto.nickname);
    return { ok: true, nickname: dto.nickname };
  }

  @Put('password')
  @ApiOperation({ summary: '修改密码', description: '改密后吊销所有会话，需重新登录' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.updatePassword(
      user.sub,
      dto.oldPassword,
      dto.newPassword,
    );
    return { ok: true, message: '密码已修改，请重新登录' };
  }
}
