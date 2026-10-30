import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomNightsModule } from 'src/room-nights/room-nights.module';
import { Booking, BookingSchema } from 'src/bookings/schemas/booking.schema';
import { Room, RoomSchema } from 'src/rooms/schemas/room.schema';
import { RoomNight, RoomNightSchema } from 'src/room-nights/schemas/room-night.schema';

@Module({
  imports: [
    RoomNightsModule,
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomNight.name, schema: RoomNightSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
