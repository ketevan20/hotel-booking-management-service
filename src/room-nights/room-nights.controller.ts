import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { RoomNightsService } from './room-nights.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import type { AuthUser } from 'src/auth/guards/auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { StatusQueryDto } from './dto/status-query.dto';
import { MaintenanceDto } from './dto/maintenance.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('room-nights')
export class RoomNightsController {
  constructor(private readonly roomNightsService: RoomNightsService) { }

  @Get('status')
  status(@CurrentUser() user: AuthUser, @Query() query: StatusQueryDto) {
    return this.roomNightsService.getStatus(user.hotelId, query.date);
  }

  @Roles(Role.Admin)
  @Post('maintenance')
  block(@CurrentUser() user: AuthUser, @Body() dto: MaintenanceDto) {
    return this.roomNightsService.blockMaintenance(user.hotelId, dto);
  }

  @Roles(Role.Admin)
  @Post('maintenance/release')
  release(@CurrentUser() user: AuthUser, @Body() dto: MaintenanceDto) {
    return this.roomNightsService.releaseMaintenance(user.hotelId, dto);
  }
}
