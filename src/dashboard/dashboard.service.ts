import { Injectable } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { PaymentType } from 'src/enums/payments.enum';
import { nightsBetween } from 'src/common/pricing';
import { InjectModel } from '@nestjs/mongoose';
import { Booking } from 'src/bookings/schemas/booking.schema';
import { Room } from 'src/rooms/schemas/room.schema';
import { RoomNight } from 'src/room-nights/schemas/room-night.schema';
import { HotelsService } from 'src/hotels/hotels.service';
import { RoomNightsService } from 'src/room-nights/room-nights.service';
import { Model, Types } from 'mongoose';
import { addDays, dayIn, eachNight, parseDay, rangeFor, todayIn } from 'src/common/dates';
import { RoomNightType } from 'src/enums/roomNight.enum';
import { BookingStatus } from 'src/enums/bookings.enum';
import { AuthUser } from 'src/auth/guards/auth.guard';
import { Role } from 'src/enums/role.enum';

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
const key = (date: Date) => date.toISOString().slice(0, 10);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// Number of nights of [aFrom, aTo) that fall inside [from, to)
const overlapNights = (aFrom: Date, aTo: Date, from: Date, to: Date) => {
  const start = Math.max(aFrom.getTime(), from.getTime());
  const end = Math.min(aTo.getTime(), to.getTime());
  return end > start ? nightsBetween(new Date(start), new Date(end)) : 0;
};

type RevenueBooking = {
  rooms: { checkIn: Date; checkOut: Date; agreedPrice: number }[];
  dinner: { from: Date; to: Date; persons: number; pricePerPerson: number }[];
};
type CancelledBooking = {
  cancelledAt?: Date;
  payments: { type: PaymentType; amount: number }[];
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomNight.name) private readonly nightModel: Model<RoomNight>,
    private readonly hotelsService: HotelsService,
    private readonly roomNightsService: RoomNightsService,
  ) { }

  private async context(hotelId: string) {
    const hotel = await this.hotelsService.findById(hotelId);
    const tz = hotel?.timezone ?? 'UTC';
    return { tz, todayStr: todayIn(tz), hId: new Types.ObjectId(hotelId) };
  }

  // For each day: how many rooms existed, were booked, were blocked
  private async dailyOccupancy(hId: Types.ObjectId, from: Date, to: Date) {
    const [rooms, nights] = await Promise.all([
      this.roomModel.find({ hotelId: hId }).select('createdAt deactivatedAt').lean(),
      this.nightModel
        .find({ hotelId: hId, date: { $gte: from, $lt: to } })
        .select('date type')
        .lean(),
    ]);

    const booked = new Map<string, number>();
    const blocked = new Map<string, number>();
    for (const night of nights) {
      const map = night.type === RoomNightType.Maintenance ? blocked : booked;
      const k = key(night.date);
      map.set(k, (map.get(k) ?? 0) + 1);
    }

    return eachNight(from, to).map((date) => {
      const k = key(date);
      const existing = rooms.filter(
        (room) =>
          (room.createdAt ? key(room.createdAt) : '0000-00-00') <= k &&
          (!room.deactivatedAt || key(room.deactivatedAt) > k),
      ).length;
      const maintenance = blocked.get(k) ?? 0;
      return {
        date,
        booked: booked.get(k) ?? 0,
        available: Math.max(existing - maintenance, 0), // rooms that could be sold that day
      };
    });
  }

  private revenueFor(
    bookings: RevenueBooking[],
    cancelled: CancelledBooking[],
    from: Date,
    to: Date,
    tz: string,
  ) {
    let rooms = 0;
    let dinner = 0;
    let cancellations = 0;

    for (const booking of bookings) {
      for (const r of booking.rooms) {
        rooms += r.agreedPrice * overlapNights(r.checkIn, r.checkOut, from, to);
      }
      for (const d of booking.dinner) {
        dinner += d.persons * d.pricePerPerson * overlapNights(d.from, d.to, from, to);
      }
    }
    for (const c of cancelled) {
      if (!c.cancelledAt) continue;
      const day = dayIn(c.cancelledAt, tz);
      if (day >= key(from) && day < key(to)) {
        const kept = sum(
          c.payments.map((p) => (p.type === PaymentType.Refund ? -p.amount : p.amount)),
        );
        cancellations += Math.max(kept, 0);
      }
    }

    return {
      rooms: round(rooms),
      dinner: round(dinner),
      cancellations: round(cancellations),
      total: round(rooms + dinner + cancellations),
    };
  }

  private async revenueData(hId: Types.ObjectId, from: Date, to: Date) {
    const [bookings, cancelled] = await Promise.all([
      this.bookingModel
        .find({
          hotelId: hId,
          status: {
            $in: [BookingStatus.Confirmed, BookingStatus.CheckedIn, BookingStatus.CheckedOut],
          },
          checkIn: { $lt: to },
          checkOut: { $gt: from },
        })
        .select('rooms dinner')
        .lean(),
      this.bookingModel
        .find({
          hotelId: hId,
          status: BookingStatus.Cancelled,
          cancelledAt: { $gte: addDays(from, -1), $lt: addDays(to, 1) },
        })
        .select('cancelledAt payments')
        .lean(),
    ]);
    return { bookings, cancelled };
  }

  async summary(actor: AuthUser, range: 'today' | 'week' | 'month' = 'today') {
    const { tz, todayStr, hId } = await this.context(actor.hotelId);
    const { from, to } = rangeFor(range, todayStr);

    const [days, checkedIn, status] = await Promise.all([
      this.dailyOccupancy(hId, from, to),
      this.bookingModel
        .find({
          hotelId: hId,
          checkedInAt: { $gte: addDays(from, -1), $lt: addDays(to, 1) },
        })
        .select('checkedInAt')
        .lean(),
      this.roomNightsService.getStatus(actor.hotelId), // today's statuses
    ]);

    const checkIns = checkedIn.filter((b) => {
      if (!b.checkedInAt) return false;
      const day = dayIn(b.checkedInAt, tz);
      return day >= key(from) && day < key(to);
    }).length;

    const booked = days.map((d) => d.booked);
    const free = days.map((d) => Math.max(d.available - d.booked, 0));
    const totalAvailable = sum(days.map((d) => d.available));

    const occupiedRooms = range === 'today' ? booked[0] : round(sum(booked) / days.length, 1);
    const availableRooms = range === 'today' ? free[0] : round(sum(free) / days.length, 1);

    let revenue: ReturnType<DashboardService['revenueFor']> | null = null;
    if (actor.role === Role.Admin) {
      const data = await this.revenueData(hId, from, to);
      revenue = this.revenueFor(data.bookings, data.cancelled, from, to, tz);
    }

    const counts = { occupied: 0, reserved: 0, available: 0, out_of_service: 0 };
    for (const room of status.rooms) counts[room.status as keyof typeof counts] += 1;

    return {
      range,
      from: key(from),
      to: key(to), // not included
      average: range !== 'today', // occupied and available are averages per night
      occupiedRooms,
      availableRooms,
      occupancyRate: totalAvailable > 0 ? round((sum(booked) / totalAvailable) * 100, 1) : 0,
      checkIns,
      revenue,
      roomStatus: { date: status.date, totalRooms: status.rooms.length, ...counts },
    };
  }

  async weeklyOccupancy(hotelId: string) {
    const { todayStr, hId } = await this.context(hotelId);
    const { from, to } = rangeFor('week', todayStr);
    const days = await this.dailyOccupancy(hId, from, to);
    return {
      from: key(from),
      to: key(to),
      days: days.map((d) => ({
        date: key(d.date),
        booked: d.booked,
        available: d.available,
        rate: d.available > 0 ? round((d.booked / d.available) * 100, 1) : 0,
      })),
    };
  }

  async revenueByMonth(hotelId: string, months = 12) {
    const { tz, todayStr, hId } = await this.context(hotelId);
    const today = parseDay(todayStr);
    const monthStart = (offset: number) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));

    const { bookings, cancelled } = await this.revenueData(
      hId,
      monthStart(-(months - 1)),
      monthStart(1),
    );

    const result: ({ month: string } & ReturnType<DashboardService['revenueFor']>)[] = [];
    for (let i = -(months - 1); i <= 0; i++) {
      const from = monthStart(i);
      const to = monthStart(i + 1);
      result.push({
        month: key(from).slice(0, 7),
        ...this.revenueFor(bookings, cancelled, from, to, tz),
      });
    }
    return result;
  }
}
