import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import type { AuthUser } from 'src/auth/guards/auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { ListBookingsDto } from './dto/list-bookings.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CheckInDto } from './dto/check-in.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) { }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsDto) {
    return this.bookingsService.list(user.hotelId, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.findOne(user.hotelId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(user, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancel(user, id, dto.reason);
  }

  @Post(':id/payments')
  addPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPaymentDto ) {
    return this.bookingsService.addPayment(user, id, dto);
  }

  @Post(':id/check-in')
  checkIn( @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CheckInDto ) {
    return this.bookingsService.checkIn(user, id, dto);
  }

  @Get(':id/check-out-summary')
  checkOutSummary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.checkOutSummary(user.hotelId, id);
  }

  @Post(':id/check-out')
  checkOut(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CheckOutDto ) {
    return this.bookingsService.checkOut(user, id, dto);
  }
}
