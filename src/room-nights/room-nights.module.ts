import { Module } from '@nestjs/common';
import { RoomNightsService } from './room-nights.service';
import { RoomNightsController } from './room-nights.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomNight, RoomNightSchema } from './schemas/room-night.schema';
import { HotelsModule } from 'src/hotels/hotels.module';
import { Room, RoomSchema } from 'src/rooms/schemas/room.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoomNight.name, schema: RoomNightSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [RoomNightsController],
  providers: [RoomNightsService],
  exports: [RoomNightsService],
})
export class RoomNightsModule {}
