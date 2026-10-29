import { Module } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { GuestsController } from './guests.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Guest, GuestSchema } from './schemas/guest.schema';
import { Booking, BookingSchema } from 'src/bookings/schemas/booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Guest.name, schema: GuestSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService]
})
export class GuestsModule { }
