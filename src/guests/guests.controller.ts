import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import type { AuthUser } from 'src/auth/guards/auth.guard' 
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { SearchGuestsDto } from './dto/search-guests.dto';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';

@UseGuards(AuthGuard, RolesGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) { }

  @Get()
  search(@CurrentUser() user: AuthUser, @Query() query: SearchGuestsDto) {
    return this.guestsService.search(user.hotelId, query.q, query.limit);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guestsService.findOne(user.hotelId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGuestDto) {
    return this.guestsService.create(user.hotelId, dto);
  }

  @Patch(':id')
  update( @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateGuestDto ) {
    return this.guestsService.update(user.hotelId, id, dto);
  }

  @Roles(Role.Admin)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guestsService.remove(user.hotelId, id);
  }
}
