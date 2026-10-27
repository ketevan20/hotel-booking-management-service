import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Room } from './schemas/room.schema';
import { isValidObjectId, Model, Types } from 'mongoose';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private readonly roomModel: Model<Room>,) { }

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
    // TODO (bookings phase): refuse to deactivate a room that has future bookings
    room.isActive = isActive;
    room.deactivatedAt = isActive ? undefined : new Date();
    return room.save();
  }

  async remove(hotelId: string, id: string) {
    const room = await this.findOne(hotelId, id);
    if (await this.hasBookingHistory(room.id)) {
      throw new ConflictException(
        'This room has bookings. Deactivate it instead of deleting it',
      );
    }
    await room.deleteOne();
    return { message: 'Room deleted' };
  }

  // TODO (bookings phase): return true if any booking ever referenced this room.
  // Until the bookings module exists, deleting a room is always allowed.
  private async hasBookingHistory(_roomId: string): Promise<boolean> {
    return false;
  }

  private toHttpError(err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return new ConflictException('A room with this number already exists');
    }
    return err;
  }
}
