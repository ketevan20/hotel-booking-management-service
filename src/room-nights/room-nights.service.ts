import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { RoomNight } from './schemas/room-night.schema';
import { Connection, Model, Types } from 'mongoose';
import { HotelsService } from 'src/hotels/hotels.service';
import { Room } from 'src/rooms/schemas/room.schema';
import { eachNight, parseDay, todayIn } from 'src/common/dates';
import { RoomNightType } from 'src/enums/roomNight.enum';
import { MaintenanceDto } from './dto/maintenance.dto';
import { Booking } from 'src/bookings/schemas/booking.schema';
import { BookingStatus } from 'src/enums/bookings.enum';
import { nightsBetween } from 'src/common/pricing';

@Injectable()
export class RoomNightsService {
  constructor(
    @InjectModel(RoomNight.name) private readonly nightModel: Model<RoomNight>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    private readonly hotelsService: HotelsService,
  ) { }

    async getStatus(hotelId: string, date?: string) {
    const hotel = await this.hotelsService.findById(hotelId);
    const todayStr = todayIn(hotel?.timezone ?? 'UTC');
    const today = parseDay(todayStr);
    const day = parseDay(date ?? todayStr);
    const hId = new Types.ObjectId(hotelId);

    const [rooms, nights] = await Promise.all([
      this.roomModel
        .find({ hotelId: hId, isActive: true })
        .collation({ locale: 'en', numericOrdering: true })
        .sort({ number: 1 })
        .lean(),
      this.nightModel.find({ hotelId: hId, date: day }).lean(),
    ]);

    const bookingIds = nights
      .filter((n) => n.bookingId)
      .map((n) => n.bookingId as Types.ObjectId);
    const bookings = bookingIds.length
      ? await this.bookingModel
          .find({ _id: { $in: bookingIds }, hotelId: hId })
          .select('status guest.name checkIn checkOut')
          .lean()
      : [];
    const bookingById = new Map(bookings.map((b) => [b._id.toString(), b]));
    const byRoom = new Map(nights.map((n) => [n.roomId.toString(), n]));

    return {
      date: day.toISOString().slice(0, 10),
      rooms: rooms.map((room) => {
        const night = byRoom.get(room._id.toString());
        const booking = night?.bookingId
          ? bookingById.get(night.bookingId.toString())
          : undefined;

        let status = 'available';
        if (night) {
          if (night.type === RoomNightType.Maintenance) {
            status = 'out_of_service';
          } else {
            const stayed =
              booking?.status === BookingStatus.CheckedIn ||
              booking?.status === BookingStatus.CheckedOut;
            status = stayed && day <= today ? 'occupied' : 'reserved';
          }
        }

        return {
          roomId: room._id,
          number: room.number,
          type: room.type,
          status,
          bookingId: night?.bookingId ?? null,
          booking: booking
            ? {
                id: booking._id,
                status: booking.status,
                guestName: booking.guest.name,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
              }
            : null,
        };
      }),
    };
  }F

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

    // Rooms with no booking and no block on any night from `from` up to (not including) `to`
  async getAvailable(hotelId: string, from: string, to: string) {
    const start = parseDay(from);
    const end = parseDay(to);
    const nights = nightsBetween(start, end);
    if (nights < 1 || nights > 366) {
      throw new BadRequestException('"to" must be after "from", within a year');
    }
    const hId = new Types.ObjectId(hotelId);

    const busyRoomIds = await this.nightModel.distinct('roomId', {
      hotelId: hId,
      date: { $gte: start, $lt: end },
    });

    return this.roomModel
      .find({ hotelId: hId, isActive: true, _id: { $nin: busyRoomIds } })
      .select('number type capacity price')
      .collation({ locale: 'en', numericOrdering: true })
      .sort({ number: 1 })
      .lean();
  }
}
