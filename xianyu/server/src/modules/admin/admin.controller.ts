import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

class SetUserStatusDto {
  @ApiProperty({ description: '状态', enum: ['active', 'disabled'] })
  @IsIn(['active', 'disabled'])
  status: 'active' | 'disabled';
}

/**
 * 运营后台接口（仅 system 角色可访问）。
 *
 * 用于平台运营方：
 * - 查看所有租户列表与用量
 * - 封禁/解封异常租户
 *
 * system 角色无法自助注册，需手动在 DB 把某用户 role 改为 'system'。
 */
@ApiTags('运营后台')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('tenants')
  @ApiOperation({ summary: '列出所有租户（system 专用）' })
  listTenants() {
    return this.service.listTenants();
  }

  @Get('tenants/:id/usage')
  @ApiOperation({ summary: '查询单租户用量（账号/订单/卡密）' })
  getUsage(@Param('id') id: string) {
    return this.service.getTenantUsage(Number(id));
  }

  @Put('users/:id/status')
  @ApiOperation({ summary: '封禁/解封租户', description: '改 user.status，不能用于 system 运营账号' })
  setUserStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.service.setUserStatus(Number(id), dto.status);
  }
}
