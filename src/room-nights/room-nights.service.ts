import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomNightDto } from './dto/create-room-night.dto';
import { UpdateRoomNightDto } from './dto/update-room-night.dto';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { RoomNight } from './schemas/room-night.schema';
import { Connection, Model, Types } from 'mongoose';
import { HotelsService } from 'src/hotels/hotels.service';
import { Room } from 'src/rooms/schemas/room.schema';
import { eachNight, parseDay, todayIn } from 'src/common/dates';
import { RoomNightType } from 'src/enums/roomNight.enum';
import { MaintenanceDto } from './dto/maintenance.dto';

@Injectable()
export class RoomNightsService {
  constructor(
    @InjectModel(RoomNight.name) private readonly nightModel: Model<RoomNight>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectConnection() private readonly connection: Connection,
    private readonly hotelsService: HotelsService,
  ) { }

  async getStatus(hotelId: string, date?: string) {
    const hotel = await this.hotelsService.findById(hotelId);
    const day = parseDay(date ?? todayIn(hotel?.timezone ?? 'UTC'));
    const hId = new Types.ObjectId(hotelId);

    const [rooms, nights] = await Promise.all([
      this.roomModel
        .find({ hotelId: hId, isActive: true })
        .collation({ locale: 'en', numericOrdering: true })
        .sort({ number: 1 })
        .lean(),
      this.nightModel.find({ hotelId: hId, date: day }).lean(),
    ]);

    const byRoom = new Map(nights.map((n) => [n.roomId.toString(), n]));

    return {
      date: day.toISOString().slice(0, 10),
      rooms: rooms.map((room) => {
        const night = byRoom.get(room._id.toString());
        const status = !night
          ? 'available'
          : night.type === RoomNightType.Maintenance
            ? 'out_of_service'
            : 'reserved'; // 'occupied' arrives with check-in, in the bookings phase
        return {
          roomId: room._id,
          number: room.number,
          type: room.type,
          status,
          bookingId: night?.bookingId ?? null,
        };
      }),
    };
  }

  async blockMaintenance(hotelId: string, dto: MaintenanceDto) {
    const room = await this.roomModel.findOne({
      _id: new Types.ObjectId(dto.roomId),
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) throw new NotFoundException('Room not found');

    const nights = eachNight(parseDay(dto.from), parseDay(dto.to));
    if (nights.length === 0 || nights.length > 366) {
      throw new BadRequestException('"to" must be after "from", within a year');
    }

    const docs = nights.map((date) => ({
      hotelId: room.hotelId,
      roomId: room._id,
      date,
      type: RoomNightType.Maintenance,
      note: dto.note,
    }));

    // All nights or none: one taken night cancels the whole block
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.nightModel.insertMany(docs, { session });
      });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException(
          'The room already has a booking or block on some of these nights',
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }

    return { blockedNights: nights.length };
  }

  async releaseMaintenance(hotelId: string, dto: MaintenanceDto) {
    const from = parseDay(dto.from);
    const to = parseDay(dto.to);
    const result = await this.nightModel.deleteMany({
      hotelId: new Types.ObjectId(hotelId),
      roomId: new Types.ObjectId(dto.roomId),
      type: RoomNightType.Maintenance, // never touches booking nights
      date: { $gte: from, $lt: to },
    });
    return { releasedNights: result.deletedCount };
  }
}
