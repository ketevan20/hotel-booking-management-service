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
import { addDays, eachNight, parseDay, rangeFor, todayIn } from 'src/common/dates';
import { calculateTotals, nightsBetween } from 'src/common/pricing';
import { PaymentType } from 'src/enums/payments.enum';
import { RoomNightType } from 'src/enums/roomNight.enum';
import { ListBookingsDto } from './dto/list-bookings.dto';
import { escapeRegex } from 'src/common/phone';
import { BookingSortBy, BookingStatus } from 'src/enums/bookings.enum';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CheckInDto } from './dto/check-in.dto';
import { UpdateGuestDto } from 'src/guests/dto/update-guest.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';

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

  private async findDocument(hotelId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const booking = await this.bookingModel.findOne({
      _id: new Types.ObjectId(id),
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!booking) throw new NotFoundException();
    return booking;
  }

  async update(actor: AuthUser, id: string, dto: UpdateBookingDto) {
    const booking = await this.findDocument(actor.hotelId, id);
    const hotelId = new Types.ObjectId(actor.hotelId);
    const by = new Types.ObjectId(actor.id);
    const isAdmin = actor.role === Role.Admin;

    const structural =
      dto.rooms !== undefined ||
      dto.dinner !== undefined ||
      dto.totalGuests !== undefined ||
      dto.guestId !== undefined;

    if (structural && booking.status !== BookingStatus.Confirmed) {
      throw new ConflictException(
        'Rooms, dates, dinner and guests can only be changed before check-in',
      );
    }
    if (!structural && dto.notes === undefined && dto.source === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const changed: string[] = [];
    const previousTotal = booking.total;

    if (dto.notes !== undefined) {
      booking.notes = dto.notes;
      changed.push('notes');
    }
    if (dto.source !== undefined) {
      booking.source = dto.source;
      changed.push('source');
    }

    let roomsChanged = false;
    let newNights: {
      hotelId: Types.ObjectId;
      roomId: Types.ObjectId;
      date: Date;
      type: RoomNightType;
      bookingId: Types.ObjectId;
    }[] = [];

    if (structural) {
      const hotel = await this.hotelsService.findById(actor.hotelId);
      if (!hotel) throw new NotFoundException('Hotel not found');
      const today = todayIn(hotel.timezone);

      if (dto.guestId !== undefined) {
        const guest = await this.guestsService.findOne(actor.hotelId, dto.guestId);
        booking.guestId = guest._id;
        booking.guest = { name: guest.name, phone: guest.phone, country: guest.country };
        changed.push('guest');
      }

      // --- rooms ---
      const roomIds = dto.rooms
        ? dto.rooms.map((r) => r.roomId)
        : booking.rooms.map((r) => r.roomId.toString());
      if (new Set(roomIds).size !== roomIds.length) {
        throw new BadRequestException('A room can appear only once in a booking');
      }
      const roomDocs = await this.roomModel.find({
        _id: { $in: roomIds.map((rid) => new Types.ObjectId(rid)) },
        hotelId,
      });
      if (roomDocs.length !== roomIds.length) {
        throw new NotFoundException('One or more rooms were not found');
      }
      const roomById = new Map(roomDocs.map((r) => [r.id, r]));
      const existing = new Map(booking.rooms.map((r) => [r.roomId.toString(), r]));

      let rooms = booking.rooms.map((r) => ({
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        listPrice: r.listPrice,
        agreedPrice: r.agreedPrice,
      }));

      if (dto.rooms) {
        rooms = dto.rooms.map((input) => {
          const room = roomById.get(input.roomId)!;
          const prev = existing.get(input.roomId);
          if (!prev && !room.isActive) {
            throw new NotFoundException(`Room ${room.number} is inactive`);
          }

          const checkIn = parseDay(input.checkIn);
          const checkOut = parseDay(input.checkOut);
          const nights = nightsBetween(checkIn, checkOut);
          if (nights < 1 || nights > 366) {
            throw new BadRequestException(
              `Room ${room.number}: check-out must be after check-in, within a year`,
            );
          }

          // a past start date is only a problem if this change introduces it
          const startUnchanged = prev && prev.checkIn.getTime() === checkIn.getTime();
          if (!startUnchanged && input.checkIn < today && !isAdmin) {
            throw new ForbiddenException('Only an admin can set a start date in the past');
          }

          // keep the price this room already had; only an admin can change it
          const currentAgreed = prev?.agreedPrice ?? room.price;
          const agreedPrice = input.agreedPrice ?? currentAgreed;
          if (agreedPrice !== currentAgreed && !isAdmin) {
            throw new ForbiddenException('Only an admin can change the price');
          }

          return {
            roomId: room._id,
            roomNumber: room.number,
            checkIn,
            checkOut,
            listPrice: prev?.listPrice ?? room.price,
            agreedPrice,
          };
        });
        roomsChanged = true;
        changed.push('rooms');
      }

      const totalGuests = dto.totalGuests ?? booking.totalGuests;
      const capacity = rooms.reduce(
        (sum, r) => sum + (roomById.get(r.roomId.toString())?.capacity ?? 0),
        0,
      );
      if (totalGuests > capacity) {
        throw new BadRequestException(
          `Total guests (${totalGuests}) exceed the capacity of the rooms (${capacity})`,
        );
      }
      if (dto.totalGuests !== undefined) {
        booking.totalGuests = totalGuests;
        changed.push('totalGuests');
      }

      const checkIn = new Date(Math.min(...rooms.map((r) => r.checkIn.getTime())));
      const checkOut = new Date(Math.max(...rooms.map((r) => r.checkOut.getTime())));

      // --- dinner ---
      let dinner = booking.dinner.map((d) => ({
        from: d.from,
        to: d.to,
        persons: d.persons,
        pricePerPerson: d.pricePerPerson,
      }));
      if (dto.dinner !== undefined) {
        if (dto.dinner.length > 0 && !hotel.dinnerEnabled) {
          throw new BadRequestException('Dinner is not enabled for this hotel');
        }
        dinner = dto.dinner.map((p) => {
          const from = parseDay(p.from);
          const to = parseDay(p.to);
          // a period that already existed keeps the price it was sold at
          const same = booking.dinner.find(
            (d) => d.from.getTime() === from.getTime() && d.to.getTime() === to.getTime(),
          );
          return {
            from,
            to,
            persons: p.persons,
            pricePerPerson: same?.pricePerPerson ?? hotel.dinnerPricePerPerson,
          };
        });
        changed.push('dinner');
      }
      for (const d of dinner) {
        if (nightsBetween(d.from, d.to) < 1 || d.from < checkIn || d.to > checkOut) {
          throw new BadRequestException(
            'Dinner periods must be inside the stay. Send an updated dinner list',
          );
        }
      }

      const totals = calculateTotals(rooms, dinner);
      booking.rooms = rooms;
      booking.checkIn = checkIn;
      booking.checkOut = checkOut;
      booking.dinner = dinner;
      booking.roomTotal = totals.roomTotal;
      booking.dinnerTotal = totals.dinnerTotal;
      booking.total = totals.total;

      if (roomsChanged) {
        newNights = rooms.flatMap((room) =>
          eachNight(room.checkIn, room.checkOut).map((date) => ({
            hotelId,
            roomId: room.roomId,
            date,
            type: RoomNightType.Booking,
            bookingId: booking._id,
          })),
        );
      }
    }

    booking.history.push({
      at: new Date(),
      by,
      action: 'updated',
      details: { fields: changed, total: { from: previousTotal, to: booking.total } },
    });

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (roomsChanged) {
          await this.nightModel.deleteMany({ bookingId: booking._id }, { session });
          await this.nightModel.insertMany(newNights, { session });
        }
        await booking.save({ session });
      });
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

    return this.findOne(actor.hotelId, id);
  }

  async cancel(actor: AuthUser, id: string, reason?: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const bookingId = new Types.ObjectId(id);
    const hotelId = new Types.ObjectId(actor.hotelId);

    const set: Record<string, unknown> = {
      status: BookingStatus.Cancelled,
      cancelledAt: new Date(),
    };
    if (reason) set.cancelReason = reason;

    let cancelled = false;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // the status condition makes sure two cancellations can't both succeed
        const updated = await this.bookingModel.findOneAndUpdate(
          { _id: bookingId, hotelId, status: BookingStatus.Confirmed },
          {
            $set: set,
            $push: {
              history: {
                at: new Date(),
                by: new Types.ObjectId(actor.id),
                action: 'cancelled',
                details: { reason: reason ?? null },
              },
            },
          },
          { new: true, session },
        );
        cancelled = !!updated;
        if (updated) {
          // the nights are released; the payments (deposit) stay as they are
          await this.nightModel.deleteMany({ bookingId }, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    if (!cancelled) {
      const exists = await this.bookingModel.exists({ _id: bookingId, hotelId });
      if (!exists) throw new NotFoundException();
      throw new ConflictException('Only confirmed bookings can be cancelled');
    }

    return this.findOne(actor.hotelId, id);
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }

  async addPayment(actor: AuthUser, id: string, dto: AddPaymentDto) {
    const booking = await this.findDocument(actor.hotelId, id);
    if (booking.status === BookingStatus.Cancelled) {
      throw new ConflictException('Cancelled bookings cannot receive payments');
    }

    const isRefund = dto.type === PaymentType.Refund;
    if (isRefund && actor.role !== Role.Admin) {
      throw new ForbiddenException('Only an admin can record a refund');
    }

    const paid = this.paidAmount(booking.payments);
    const balance = this.round(booking.total - paid);
    if (isRefund && dto.amount > paid) {
      throw new BadRequestException(`You cannot refund more than was paid (${paid})`);
    }
    if (!isRefund && dto.amount > balance) {
      throw new BadRequestException(`The amount is higher than the balance (${balance})`);
    }

    const by = new Types.ObjectId(actor.id);
    booking.payments.push({
      type: dto.type,
      amount: dto.amount,
      method: dto.method,
      date: new Date(),
      recordedBy: by,
      note: dto.note,
    });
    booking.history.push({
      at: new Date(),
      by,
      action: 'payment_added',
      details: { type: dto.type, amount: dto.amount, method: dto.method },
    });
    await booking.save();
    return this.findOne(actor.hotelId, id);
  }

  async checkIn(actor: AuthUser, id: string, dto: CheckInDto) {
    const booking = await this.findDocument(actor.hotelId, id);
    if (booking.status !== BookingStatus.Confirmed) {
      throw new ConflictException('Only confirmed bookings can be checked in');
    }

    const hotel = await this.hotelsService.findById(actor.hotelId);
    const today = parseDay(todayIn(hotel?.timezone ?? 'UTC'));
    if (today < booking.checkIn) {
      throw new ConflictException(
        `Too early: this booking starts on ${booking.checkIn.toISOString().slice(0, 10)}. ` +
        'To check in earlier, move the start date first (it works only if the rooms are free)',
      );
    }
    if (today >= booking.checkOut) {
      throw new ConflictException('This booking has already ended');
    }

    const by = new Types.ObjectId(actor.id);
    const push: Record<string, any> = {
      history: { at: new Date(), by, action: 'checked_in' },
    };

    if (dto.deposit) {
      const paid = this.paidAmount(booking.payments);
      if (dto.deposit.amount > this.round(booking.total - paid)) {
        throw new BadRequestException('The deposit is higher than the balance');
      }
      push.payments = {
        type: PaymentType.Deposit,
        amount: dto.deposit.amount,
        method: dto.deposit.method,
        date: new Date(),
        recordedBy: by,
      };
    }

    // the guest's ID/passport is saved on the guest record, not on the booking
    const guestUpdate: UpdateGuestDto = {};
    if (dto.idType) guestUpdate.idType = dto.idType;
    if (dto.idNumber) guestUpdate.idNumber = dto.idNumber;
    if (Object.keys(guestUpdate).length > 0) {
      await this.guestsService.update(actor.hotelId, booking.guestId.toString(), guestUpdate);
    }

    // the status condition stops two staff members from checking in at once
    const updated = await this.bookingModel.findOneAndUpdate(
      { _id: booking._id, hotelId: booking.hotelId, status: BookingStatus.Confirmed },
      { $set: { status: BookingStatus.CheckedIn, checkedInAt: new Date() }, $push: push },
      { new: true },
    );
    if (!updated) {
      throw new ConflictException('This booking was just changed. Reload it and try again');
    }
    return this.findOne(actor.hotelId, id);
  }

  // What the booking would cost if the guest left today
  private computeCheckOut(booking: BookingDocument, today: Date) {
    // charge at least one night; after the planned end nothing is cut
    const departure =
      today < booking.checkOut
        ? new Date(Math.max(today.getTime(), addDays(booking.checkIn, 1).getTime()))
        : booking.checkOut;

    const rooms = booking.rooms
      .map((r) => ({
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        checkIn: r.checkIn,
        checkOut: new Date(Math.min(r.checkOut.getTime(), departure.getTime())),
        listPrice: r.listPrice,
        agreedPrice: r.agreedPrice,
      }))
      .filter((r) => r.checkOut > r.checkIn); // a room that was never used drops out

    const dinner = booking.dinner
      .map((d) => ({
        from: d.from,
        to: new Date(Math.min(d.to.getTime(), departure.getTime())),
        persons: d.persons,
        pricePerPerson: d.pricePerPerson,
      }))
      .filter((d) => d.to > d.from);

    const totals = calculateTotals(rooms, dinner);
    const paid = this.paidAmount(booking.payments);
    return {
      departure,
      early: departure < booking.checkOut,
      rooms,
      dinner,
      ...totals,
      paid,
      balance: this.round(totals.total - paid),
    };
  }

  async checkOutSummary(hotelId: string, id: string) {
    const booking = await this.findDocument(hotelId, id);
    if (booking.status !== BookingStatus.CheckedIn) {
      throw new ConflictException('Only checked-in bookings can be checked out');
    }
    const hotel = await this.hotelsService.findById(hotelId);
    const today = parseDay(todayIn(hotel?.timezone ?? 'UTC'));

    const result = this.computeCheckOut(booking, today);
    return {
      ...result,
      departure: result.departure.toISOString().slice(0, 10),
      currentTotal: booking.total,
    };
  }

  async checkOut(actor: AuthUser, id: string, dto: CheckOutDto) {
    const booking = await this.findDocument(actor.hotelId, id);
    if (booking.status !== BookingStatus.CheckedIn) {
      throw new ConflictException('Only checked-in bookings can be checked out');
    }
    if (dto.allowUnpaid && actor.role !== Role.Admin) {
      throw new ForbiddenException('Only an admin can close a booking with an unpaid balance');
    }

    const hotel = await this.hotelsService.findById(actor.hotelId);
    const today = parseDay(todayIn(hotel?.timezone ?? 'UTC'));
    const c = this.computeCheckOut(booking, today);

    if (c.balance < -0.005) {
      throw new ConflictException(`The guest has overpaid by ${-c.balance}. Record a refund first`);
    }
    if (c.balance > 0.005 && !dto.allowUnpaid) {
      throw new ConflictException(`The guest still owes ${c.balance}. Record the payment first`);
    }

    const checkOut = new Date(Math.max(...c.rooms.map((r) => r.checkOut.getTime())));
    let done = false;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await this.bookingModel.findOneAndUpdate(
          { _id: booking._id, hotelId: booking.hotelId, status: BookingStatus.CheckedIn },
          {
            $set: {
              status: BookingStatus.CheckedOut,
              checkedOutAt: new Date(),
              rooms: c.rooms,
              dinner: c.dinner,
              roomTotal: c.roomTotal,
              dinnerTotal: c.dinnerTotal,
              total: c.total,
              checkOut,
            },
            $push: {
              history: {
                at: new Date(),
                by: new Types.ObjectId(actor.id),
                action: 'checked_out',
                details: {
                  early: c.early,
                  departure: c.departure.toISOString().slice(0, 10),
                  total: { from: booking.total, to: c.total },
                  unpaid: dto.allowUnpaid ? c.balance : 0,
                },
              },
            },
          },
          { new: true, session },
        );
        done = !!updated;
        if (!updated) return;

        // release the nights that were not used
        for (const room of booking.rooms) {
          const kept = c.rooms.find((r) => r.roomId.equals(room.roomId));
          await this.nightModel.deleteMany(
            {
              bookingId: booking._id,
              roomId: room.roomId,
              date: { $gte: kept ? kept.checkOut : room.checkIn },
            },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!done) {
      throw new ConflictException('This booking was just changed. Reload it and try again');
    }
    return this.findOne(actor.hotelId, id);
  }

  async extend(actor: AuthUser, id: string, dto: ExtendBookingDto) {
    const booking = await this.findDocument(actor.hotelId, id);
    // if (booking.status !== BookingStatus.CheckedIn) {
    //   throw new ConflictException('Only checked-in bookings can be extended');
    // }

    const hotelId = new Types.ObjectId(actor.hotelId);
    const by = new Types.ObjectId(actor.id);
    const isAdmin = actor.role === Role.Admin;

    const hotel = await this.hotelsService.findById(actor.hotelId);
    if (!hotel) throw new NotFoundException('Hotel not found');
    const today = parseDay(todayIn(hotel.timezone));

    const sent = dto.rooms.map((r) => r.roomId);
    if (new Set(sent).size !== sent.length) {
      throw new BadRequestException('A room can appear only once in the request');
    }

    const rooms = booking.rooms.map((r) => ({
      roomId: r.roomId,
      roomNumber: r.roomNumber,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      listPrice: r.listPrice,
      agreedPrice: r.agreedPrice,
    }));
    const used = new Set(rooms.map((r) => r.roomId.toString()));

    const newNights: {
      hotelId: Types.ObjectId;
      roomId: Types.ObjectId;
      date: Date;
      type: RoomNightType;
      bookingId: Types.ObjectId;
    }[] = [];
    const moved: typeof rooms = [];
    const summary: Record<string, unknown>[] = [];
    let extensionStart = Number.POSITIVE_INFINITY;

    for (const input of dto.rooms) {
      const entry = rooms.find((r) => r.roomId.toString() === input.roomId);
      if (!entry) {
        throw new BadRequestException('One of the rooms is not part of this booking');
      }
      const newCheckOut = parseDay(input.newCheckOut);
      const added = nightsBetween(entry.checkOut, newCheckOut);
      if (added < 1) {
        throw new BadRequestException(
          `Room ${entry.roomNumber}: the new check-out must be after the current one ` +
          `(${entry.checkOut.toISOString().slice(0, 10)})`,
        );
      }
      if (added > 366) {
        throw new BadRequestException(`Room ${entry.roomNumber}: the extension is too long`);
      }
      if (entry.checkOut < today) {
        throw new BadRequestException(
          `Room ${entry.roomNumber}: this stay has already ended. Make a new booking for it`,
        );
      }
      extensionStart = Math.min(extensionStart, entry.checkOut.getTime());

      if (input.moveToRoomId) {
        if (used.has(input.moveToRoomId)) {
          throw new BadRequestException('The room to move to is already part of this booking');
        }
        const target = await this.roomModel.findOne({
          _id: new Types.ObjectId(input.moveToRoomId),
          hotelId,
          isActive: true,
        });
        if (!target) throw new NotFoundException('The room to move to was not found');

        const agreedPrice = input.agreedPrice ?? target.price;
        if (agreedPrice !== target.price && !isAdmin) {
          throw new ForbiddenException('Only an admin can change the price');
        }
        used.add(input.moveToRoomId);

        const entryForTarget = {
          roomId: target._id,
          roomNumber: target.number,
          checkIn: entry.checkOut, // the guest moves on the day the old stay ended
          checkOut: newCheckOut,
          listPrice: target.price,
          agreedPrice,
        };
        moved.push(entryForTarget);
        newNights.push(
          ...eachNight(entryForTarget.checkIn, newCheckOut).map((date) => ({
            hotelId,
            roomId: target._id,
            date,
            type: RoomNightType.Booking,
            bookingId: booking._id,
          })),
        );
        summary.push({
          room: entry.roomNumber,
          movedTo: target.number,
          from: entry.checkOut.toISOString().slice(0, 10),
          to: input.newCheckOut,
        });
      } else {
        if (input.agreedPrice !== undefined) {
          throw new BadRequestException('The price of an extended room does not change');
        }
        newNights.push(
          ...eachNight(entry.checkOut, newCheckOut).map((date) => ({
            hotelId,
            roomId: entry.roomId,
            date,
            type: RoomNightType.Booking,
            bookingId: booking._id,
          })),
        );
        summary.push({
          room: entry.roomNumber,
          from: entry.checkOut.toISOString().slice(0, 10),
          to: input.newCheckOut,
        });
        entry.checkOut = newCheckOut;
      }
    }

    const allRooms = [...rooms, ...moved];
    const checkOut = new Date(Math.max(...allRooms.map((r) => r.checkOut.getTime())));

    // dinner for the added nights
    const dinner = booking.dinner.map((d) => ({
      from: d.from,
      to: d.to,
      persons: d.persons,
      pricePerPerson: d.pricePerPerson,
    }));
    for (const period of dto.dinner ?? []) {
      if (!hotel.dinnerEnabled) {
        throw new BadRequestException('Dinner is not enabled for this hotel');
      }
      const from = parseDay(period.from);
      const to = parseDay(period.to);
      if (nightsBetween(from, to) < 1 || from.getTime() < extensionStart || to > checkOut) {
        throw new BadRequestException('Dinner periods must cover only the added nights');
      }
      if (dinner.some((d) => from < d.to && to > d.from)) {
        throw new BadRequestException('A dinner period overlaps an existing one');
      }
      dinner.push({ from, to, persons: period.persons, pricePerPerson: hotel.dinnerPricePerPerson });
    }

    const previousTotal = booking.total;
    const totals = calculateTotals(allRooms, dinner);
    booking.rooms = allRooms;
    booking.dinner = dinner;
    booking.checkOut = checkOut;
    booking.roomTotal = totals.roomTotal;
    booking.dinnerTotal = totals.dinnerTotal;
    booking.total = totals.total;
    booking.history.push({
      at: new Date(),
      by,
      action: 'extended',
      details: { rooms: summary, total: { from: previousTotal, to: totals.total } },
    });

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.nightModel.insertMany(newNights, { session });
        await booking.save({ session });
      });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException(
          'A room is already booked or blocked on some of the extra nights. ' +
          'Move that room with moveToRoomId, or choose an earlier check-out',
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }

    return this.findOne(actor.hotelId, id);
  }
}
