import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { Room, RoomSchema } from 'src/rooms/schemas/room.schema';
import { RoomNight, RoomNightSchema } from 'src/room-nights/schemas/room-night.schema';
import { GuestsModule } from 'src/guests/guests.module';
import { HotelsModule } from 'src/hotels/hotels.module';

@Module({
  imports: [
    HotelsModule,
    GuestsModule,
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomNight.name, schema: RoomNightSchema },
    ])
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule { }
