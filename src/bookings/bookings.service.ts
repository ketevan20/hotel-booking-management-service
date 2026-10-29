import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Booking, BookingDocument, Payment } from './schemas/booking.schema';
import { Connection, isValidObjectId, Model, QueryFilter, Types } from 'mongoose';
import { Room } from 'src/rooms/schemas/room.schema';
import { RoomNight } from 'src/room-nights/schemas/room-night.schema';
import { HotelsService } from 'src/hotels/hotels.service';
import { GuestsService } from 'src/guests/guests.service';
import { AuthUser } from 'src/auth/guards/auth.guard';
import { Role } from 'src/enums/role.enum';
import { eachNight, parseDay, rangeFor, todayIn } from 'src/common/dates';
import { calculateTotals, nightsBetween } from 'src/common/pricing';
import { PaymentType } from 'src/enums/payments.enum';
import { RoomNightType } from 'src/enums/roomNight.enum';
import { ListBookingsDto } from './dto/list-bookings.dto';
import { escapeRegex } from 'src/common/phone';
import { BookingSortBy } from 'src/enums/bookings.enum';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomNight.name) private readonly nightModel: Model<RoomNight>,
    @InjectConnection() private readonly connection: Connection,
    private readonly hotelsService: HotelsService,
    private readonly guestsService: GuestsService,
  ) { }

  async create(actor: AuthUser, dto: CreateBookingDto): Promise<BookingDocument> {
    const hotelId = new Types.ObjectId(actor.hotelId);
    const isAdmin = actor.role === Role.Admin;

    const hotel = await this.hotelsService.findById(actor.hotelId);
    if (!hotel) throw new NotFoundException('Hotel not found');
    const today = todayIn(hotel.timezone);

    // 404 if the guest belongs to another hotel
    if (!dto.guestId === !dto.guest) {
      throw new BadRequestException('Send either guestId or guest, not both and not neither');
    }
    const existingGuest = dto.guestId
      ? await this.guestsService.findOne(actor.hotelId, dto.guestId) // 404 if it belongs to another hotel
      : null;
    const guestInfo = existingGuest ?? dto.guest!;
    const guestSnapshot = {
      name: guestInfo.name,
      phone: guestInfo.phone,
      country: guestInfo.country,
    };

    // --- rooms ---
    const roomIds = dto.rooms.map((r) => r.roomId);
    if (new Set(roomIds).size !== roomIds.length) {
      throw new BadRequestException('A room can appear only once in a booking');
    }
    const rooms = await this.roomModel.find({
      _id: { $in: roomIds.map((id) => new Types.ObjectId(id)) },
      hotelId,
      isActive: true,
    });
    if (rooms.length !== roomIds.length) {
      throw new NotFoundException('One or more rooms were not found or are inactive');
    }
    const roomById = new Map(rooms.map((r) => [r.id, r]));

    const bookingRooms = dto.rooms.map((input) => {
      const room = roomById.get(input.roomId)!;
      const checkIn = parseDay(input.checkIn);
      const checkOut = parseDay(input.checkOut);
      const nights = nightsBetween(checkIn, checkOut);
      if (nights < 1 || nights > 366) {
        throw new BadRequestException(
          `Room ${room.number}: check-out must be after check-in, within a year`,
        );
      }
      if (input.checkIn < today && !isAdmin) {
        throw new ForbiddenException('Only an admin can create a booking that starts in the past');
      }
      const agreedPrice = input.agreedPrice ?? room.price;
      if (agreedPrice !== room.price && !isAdmin) {
        throw new ForbiddenException('Only an admin can change the price');
      }
      return {
        roomId: room._id,
        roomNumber: room.number,
        checkIn,
        checkOut,
        listPrice: room.price,
        agreedPrice,
      };
    });

    const capacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
    if (dto.totalGuests > capacity) {
      throw new BadRequestException(
        `Total guests (${dto.totalGuests}) exceed the capacity of the chosen rooms (${capacity})`,
      );
    }

    // earliest check-in and latest check-out over all rooms
    const checkIn = new Date(Math.min(...bookingRooms.map((r) => r.checkIn.getTime())));
    const checkOut = new Date(Math.max(...bookingRooms.map((r) => r.checkOut.getTime())));

    // --- dinner ---
    const dinner = (dto.dinner ?? []).map((period) => {
      if (!hotel.dinnerEnabled) {
        throw new BadRequestException('Dinner is not enabled for this hotel');
      }
      const from = parseDay(period.from);
      const to = parseDay(period.to);
      if (nightsBetween(from, to) < 1 || from < checkIn || to > checkOut) {
        throw new BadRequestException('Dinner periods must be inside the stay');
      }
      return {
        from,
        to,
        persons: period.persons,
        pricePerPerson: hotel.dinnerPricePerPerson,
      };
    });

    // --- totals and deposit ---
    const totals = calculateTotals(bookingRooms, dinner);
    if (dto.deposit && dto.deposit.amount > totals.total) {
      throw new BadRequestException('The deposit is higher than the booking total');
    }
    const payments = dto.deposit
      ? [
        {
          type: PaymentType.Deposit,
          amount: dto.deposit.amount,
          method: dto.deposit.method,
          date: new Date(),
          recordedBy: new Types.ObjectId(actor.id),
        },
      ]
      : [];

    // --- history ---
    const by = new Types.ObjectId(actor.id);
    const history: { at: Date; by: Types.ObjectId; action: string; details?: Record<string, unknown> }[] = [
      { at: new Date(), by, action: 'created' },
    ];
    const changedPrices = bookingRooms.filter((r) => r.agreedPrice !== r.listPrice);
    if (changedPrices.length > 0) {
      history.push({
        at: new Date(),
        by,
        action: 'agreed_price_set',
        details: {
          rooms: changedPrices.map((r) => ({
            room: r.roomNumber,
            listPrice: r.listPrice,
            agreedPrice: r.agreedPrice,
          })),
        },
      });
    }

    // --- save everything, or nothing ---
    const session = await this.connection.startSession();
    try {
      let booking: BookingDocument | undefined;

      await session.withTransaction(async () => {
        const guest =
          existingGuest ??
          (await this.guestsService.create(actor.hotelId, dto.guest!, session));

        const [created] = await this.bookingModel.create(
          [
            {
              hotelId,
              guestId: guest._id,
              guest: guestSnapshot,
              totalGuests: dto.totalGuests,
              rooms: bookingRooms,
              checkIn,
              checkOut,
              dinner,
              payments,
              ...totals,
              source: dto.source,
              notes: dto.notes,
              history,
              createdBy: by,
            },
          ],
          { session },
        );

        const nights = bookingRooms.flatMap((room) =>
          eachNight(room.checkIn, room.checkOut).map((date) => ({
            hotelId,
            roomId: room.roomId,
            date,
            type: RoomNightType.Booking,
            bookingId: created._id,
          })),
        );
        await this.nightModel.insertMany(nights, { session });

        booking = created;
      });

      return booking!;
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException(
          'One of the rooms is already booked or blocked on some of these nights',
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async list(hotelId: string, query: ListBookingsDto) {
    const filter: QueryFilter<Booking> = { hotelId: new Types.ObjectId(hotelId) };

    if (query.status) filter.status = query.status;

    if (query.range) {
      const hotel = await this.hotelsService.findById(hotelId);
      const { from, to } = rangeFor(query.range, todayIn(hotel?.timezone ?? 'UTC'));
      // the stay overlaps the range: it starts before the range ends and ends after it starts
      filter.checkIn = { $lt: to };
      filter.checkOut = { $gt: from };
    }

    const term = query.search?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: QueryFilter<Booking>[] = [{ 'guest.name': rx }, { 'rooms.roomNumber': rx }];
      const digits = term.replace(/\D/g, '');
      if (digits.length >= 3) {
        // matches the phone however it was typed: 555 12 34 == 555-12-34
        or.push({ 'guest.phone': new RegExp(digits.split('').join('\\D*')) });
      }
      filter.$or = or;
    }

    const sortField =
      query.sortBy === BookingSortBy.Guest
        ? 'guest.name'
        : (query.sortBy ?? BookingSortBy.CheckIn);
    const direction = query.order === 'desc' ? -1 : 1;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [docs, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .select('-history')
        .collation({ locale: 'en' })
        .sort({ [sortField]: direction, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    const items = docs.map(({ payments, ...booking }) => {
      const paid = this.paidAmount(payments ?? []);
      return { ...booking, paid, balance: Math.round((booking.total - paid) * 100) / 100 };
    });

    return { items, total, page, limit };
  }

  async findOne(hotelId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const booking = await this.bookingModel.findOne({
      _id: new Types.ObjectId(id),
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!booking) throw new NotFoundException();

    const paid = this.paidAmount(booking.payments);
    return {
      ...booking.toObject(),
      paid,
      balance: Math.round((booking.total - paid) * 100) / 100,
    };
  }

  private paidAmount(payments: Pick<Payment, 'type' | 'amount'>[]) {
    const sum = payments.reduce(
      (total, p) => total + (p.type === PaymentType.Refund ? -p.amount : p.amount),
      0,
    );
    return Math.round(sum * 100) / 100;
  }
}
