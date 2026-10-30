import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import type { AuthUser } from 'src/auth/guards/auth.guard' 
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { RevenueQueryDto } from './dto/revenue-query.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: SummaryQueryDto) {
    return this.dashboardService.summary(user, query.range);
  }

  @Get('occupancy')
  occupancy(@CurrentUser() user: AuthUser) {
    return this.dashboardService.weeklyOccupancy(user.hotelId);
  }

  @Roles(Role.Admin)
  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: RevenueQueryDto) {
    return this.dashboardService.revenueByMonth(user.hotelId, query.months);
  }
}
