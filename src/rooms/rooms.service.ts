import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Room, RoomDocument } from './schemas/room.schema';
import { isValidObjectId, Model, Types } from 'mongoose';
import { HotelsService } from 'src/hotels/hotels.service';
import { Booking } from 'src/bookings/schemas/booking.schema';
import { RoomNight } from 'src/room-nights/schemas/room-night.schema';
import { parseDay, todayIn } from 'src/common/dates';
import { RoomNightType } from 'src/enums/roomNight.enum';

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(RoomNight.name) private readonly nightModel: Model<RoomNight>,
    private readonly hotelsService: HotelsService,
  ) { }

  findAll(hotelId: string) {
    return this.roomModel
      .find({ hotelId: new Types.ObjectId(hotelId) })
      .collation({ locale: 'en', numericOrdering: true }) // 2 before 10
      .sort({ number: 1 });
  }

  async findOne(hotelId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const room = await this.roomModel.findOne({
      _id: new Types.ObjectId(id),
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) throw new NotFoundException();
    return room;
  }

  async create(hotelId: string, dto: CreateRoomDto) {
    try {
      return await this.roomModel.create({
        ...dto,
        hotelId: new Types.ObjectId(hotelId),
      });
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  async update(hotelId: string, id: string, dto: UpdateRoomDto) {
    const room = await this.findOne(hotelId, id);
    Object.assign(room, dto);
    try {
      return await room.save();
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  async setActive(hotelId: string, id: string, isActive: boolean) {
    const room = await this.findOne(hotelId, id);
    if (!isActive && (await this.hasFutureBookings(hotelId, room))) {
      throw new ConflictException(
        'This room has current or future bookings. Move or cancel them first',
      );
    }
    room.isActive = isActive;
    room.deactivatedAt = isActive ? undefined : new Date();
    return room.save();
  }

  async remove(hotelId: string, id: string) {
    const room = await this.findOne(hotelId, id);
    if (await this.hasBookingHistory(hotelId, room)) {
      throw new ConflictException(
        'This room has bookings. Deactivate it instead of deleting it',
      );
    }
    // only maintenance blocks can exist at this point; they go with the room
    await this.nightModel.deleteMany({ roomId: room._id });
    await room.deleteOne();
    return { message: 'Room deleted' };
  }

  // TODO (bookings phase): return true if any booking ever referenced this room.
  // Until the bookings module exists, deleting a room is always allowed.
  private async hasBookingHistory(hotelId: string, room: RoomDocument) {
    return !!(await this.bookingModel.exists({
      hotelId: new Types.ObjectId(hotelId),
      'rooms.roomId': room._id,
    }));
  }

  private async hasFutureBookings(hotelId: string, room: RoomDocument) {
    const hotel = await this.hotelsService.findById(hotelId);
    const today = parseDay(todayIn(hotel?.timezone ?? 'UTC'));
    return !!(await this.nightModel.exists({
      roomId: room._id,
      type: RoomNightType.Booking,
      date: { $gte: today }, // tonight counts, so a guest in the room blocks it too
    }));
  }

  private toHttpError(err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return new ConflictException('A room with this number already exists');
    }
    return err;
  }
}
