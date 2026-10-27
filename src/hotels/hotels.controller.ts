import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, UseGuards } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { AuthGuard, type AuthUser } from 'src/auth/guards/auth.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@UseGuards(AuthGuard, RolesGuard)
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) { }

  @Get('me')
  async getMine(@CurrentUser() user: AuthUser) {
    const hotel = await this.hotelsService.findById(user.hotelId);
    if (!hotel) throw new NotFoundException();
    return hotel;
  }

  @Roles(Role.Admin)
  @Patch('me')
  async updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateHotelDto) {
    const hotel = await this.hotelsService.update(user.hotelId, dto);
    if (!hotel) throw new NotFoundException();
    return hotel;
  }
}
