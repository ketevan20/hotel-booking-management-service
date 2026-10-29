import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Guest } from './schemas/guest.schema';
import { ClientSession, isValidObjectId, Model, QueryFilter, Types } from 'mongoose';
import { escapeRegex, phoneDigits } from 'src/common/phone';

@Injectable()
export class GuestsService {
  constructor(@InjectModel(Guest.name) private readonly guestModel: Model<Guest>) { }

  search(hotelId: string, q?: string, limit = 20) {
    const filter: QueryFilter<Guest> = { hotelId: new Types.ObjectId(hotelId) };
    const term = q?.trim();

    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: QueryFilter<Guest>[] = [{ name: rx }, { email: rx }];
      const digits = term.replace(/\D/g, '');
      if (digits.length >= 3) or.push({ phoneDigits: new RegExp(digits) });
      filter.$or = or;
    }

    return this.guestModel.find(filter).sort({ name: 1 }).limit(limit);
  }

  // Detail view: includes the ID number
  async findOne(hotelId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const guest = await this.guestModel
      .findOne({
        _id: new Types.ObjectId(id),
        hotelId: new Types.ObjectId(hotelId),
      })
      .select('+idNumber');
    if (!guest) throw new NotFoundException();
    return guest;
  }

  async create(hotelId: string, dto: CreateGuestDto, session?: ClientSession) {
    const { allowDuplicate, ...data } = dto;
    const digits = phoneDigits(data.phone);
    if (digits && !allowDuplicate) {
      await this.assertNoDuplicatePhone(hotelId, digits);
    }
    const [guest] = await this.guestModel.create(
      [{ ...data, phoneDigits: digits, hotelId: new Types.ObjectId(hotelId) }],
      { session },
    );
    return guest;
  }

  async update(hotelId: string, id: string, dto: UpdateGuestDto) {
    const guest = await this.findOne(hotelId, id);
    const { allowDuplicate, ...data } = dto;

    if (data.phone !== undefined) {
      const digits = phoneDigits(data.phone);
      if (digits && digits !== guest.phoneDigits && !allowDuplicate) {
        await this.assertNoDuplicatePhone(hotelId, digits, guest._id);
      }
      guest.phoneDigits = digits;
    }

    Object.assign(guest, data);
    return guest.save();
  }

  async remove(hotelId: string, id: string) {
    const guest = await this.findOne(hotelId, id);
    if (await this.hasBookings(guest.id)) {
      throw new ConflictException(
        'This guest has bookings and cannot be deleted',
      );
    }
    await guest.deleteOne();
    return { message: 'Guest deleted' };
  }

  // TODO (bookings phase): return true if any booking references this guest.
  // Until the bookings module exists, deleting a guest is always allowed.
  private async hasBookings(_guestId: string): Promise<boolean> {
    return false;
  }

  // A warning, not a block: the client repeats the request with allowDuplicate: true
  private async assertNoDuplicatePhone(
    hotelId: string,
    digits: string,
    excludeId?: Types.ObjectId,
  ) {
    const filter: QueryFilter<Guest> = {
      hotelId: new Types.ObjectId(hotelId),
      phoneDigits: new RegExp(`${digits.slice(-9)}$`),
    };
    if (excludeId) filter._id = { $ne: excludeId };

    const duplicates = await this.guestModel
      .find(filter)
      .limit(5)
      .select('name phone country');

    if (duplicates.length > 0) {
      throw new ConflictException({
        message: 'A guest with this phone number already exists',
        code: 'DUPLICATE_PHONE',
        duplicates,
      });
    }
  }
}
