import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Room, RoomSchema } from './schemas/room.schema';
import { Booking, BookingSchema } from 'src/bookings/schemas/booking.schema';
import { RoomNight, RoomNightSchema } from 'src/room-nights/schemas/room-night.schema';
import { HotelsModule } from 'src/hotels/hotels.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: RoomNight.name, schema: RoomNightSchema },
    ]),
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService]
})
export class RoomsModule { }
