import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { Connection, isValidObjectId, Model, QueryFilter, Types } from 'mongoose';
import { Booking, BookingDocument } from 'src/bookings/schemas/booking.schema';
import { HotelsService } from 'src/hotels/hotels.service';
import { AuthUser } from 'src/auth/guards/auth.guard';
import { BookingStatus } from 'src/enums/bookings.enum';
import { InvoiceStatus } from 'src/enums/invoices.enum';
import { nightsBetween } from 'src/common/pricing';
import { PaymentType } from 'src/enums/payments.enum';
import { ListInvoicesDto } from './dto/list-invoices.dto';


const round = (value: number) => Math.round(value * 100) / 100;
const day = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectConnection() private readonly connection: Connection,
    private readonly hotelsService: HotelsService,
  ) { }

  async generate(actor: AuthUser, bookingId: string): Promise<InvoiceDocument> {
    if (!isValidObjectId(bookingId)) throw new NotFoundException();
    const hotelId = new Types.ObjectId(actor.hotelId);

    const booking = await this.bookingModel.findOne({
      _id: new Types.ObjectId(bookingId),
      hotelId,
    });
    if (!booking) throw new NotFoundException();
    if (
      booking.status !== BookingStatus.CheckedIn &&
      booking.status !== BookingStatus.CheckedOut
    ) {
      throw new ConflictException(
        'An invoice can only be created for a checked-in or checked-out booking',
      );
    }

    const existing = await this.invoiceModel.findOne({
      bookingId: booking._id,
      status: InvoiceStatus.Issued,
    });
    if (existing) return this.reuseOrReject(existing, booking);

    const hotel = await this.hotelsService.findById(actor.hotelId);
    if (!hotel) throw new NotFoundException();

    const lines = [
      ...booking.rooms.map((r) => {
        const nights = nightsBetween(r.checkIn, r.checkOut);
        return {
          description: `Room ${r.roomNumber} (${day(r.checkIn)} - ${day(r.checkOut)})`,
          quantity: nights,
          unitPrice: r.agreedPrice,
          listUnitPrice: r.listPrice !== r.agreedPrice ? r.listPrice : undefined,
          amount: round(nights * r.agreedPrice),
        };
      }),
      ...booking.dinner.map((d) => {
        const nights = nightsBetween(d.from, d.to);
        return {
          description: `Dinner, ${d.persons} person(s), ${nights} night(s) (${day(d.from)} - ${day(d.to)})`,
          quantity: d.persons * nights,
          unitPrice: d.pricePerPerson,
          amount: round(d.persons * nights * d.pricePerPerson),
        };
      }),
    ];

    const paid = this.paidAmount(booking.payments);
    const payments = booking.payments.map((p) => ({
      date: p.date,
      type: p.type,
      method: p.method,
      amount: p.amount,
    }));

    const session = await this.connection.startSession();
    try {
      let invoice: InvoiceDocument | undefined;
      await session.withTransaction(async () => {
        const number = await this.hotelsService.nextInvoiceNumber(hotelId, session);
        const [created] = await this.invoiceModel.create(
          [
            {
              hotelId,
              bookingId: booking._id,
              number,
              hotel: {
                name: hotel.name,
                address: hotel.address,
                city: hotel.city,
                country: hotel.country,
                phone: hotel.phone,
                email: hotel.email,
                taxId: hotel.taxId,
                currency: hotel.currency,
              },
              guest: {
                name: booking.guest.name,
                phone: booking.guest.phone,
                country: booking.guest.country,
              },
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              lines,
              roomTotal: booking.roomTotal,
              dinnerTotal: booking.dinnerTotal,
              total: booking.total,
              paid,
              balanceDue: round(booking.total - paid),
              payments,
              createdBy: new Types.ObjectId(actor.id),
            },
          ],
          { session },
        );
        invoice = created;
      });
      return invoice!;
    } catch (err) {
      // two requests at the same moment: return the invoice the other one created
      if ((err as { code?: number })?.code === 11000) {
        const again = await this.invoiceModel.findOne({
          bookingId: booking._id,
          status: InvoiceStatus.Issued,
        });
        if (again) return this.reuseOrReject(again, booking);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async list(hotelId: string, query: ListInvoicesDto) {
    const filter: QueryFilter<Invoice> = { hotelId: new Types.ObjectId(hotelId) };
    if (query.bookingId) filter.bookingId = new Types.ObjectId(query.bookingId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .select('-lines -payments')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.invoiceModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async findOne(hotelId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!invoice) throw new NotFoundException();
    return invoice;
  }

  async voidInvoice(hotelId: string, id: string, reason?: string) {
    const invoice = await this.findOne(hotelId, id);
    if (invoice.status === InvoiceStatus.Void) {
      throw new ConflictException('This invoice is already void');
    }
    invoice.status = InvoiceStatus.Void;
    invoice.voidedAt = new Date();
    invoice.voidReason = reason;
    return invoice.save();
  }

  private reuseOrReject(existing: InvoiceDocument, booking: BookingDocument) {
    if (existing.total === booking.total) return existing;
    throw new ConflictException(
      `Invoice ${existing.number} no longer matches the booking total. ` +
      'An admin must void it before a new one can be created',
    );
  }

  private paidAmount(payments: { type: PaymentType; amount: number }[]) {
    return round(
      payments.reduce(
        (sum, p) => sum + (p.type === PaymentType.Refund ? -p.amount : p.amount),
        0,
      ),
    );
  }
}
