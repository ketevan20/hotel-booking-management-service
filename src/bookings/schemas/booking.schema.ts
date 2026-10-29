import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { BookingSource, BookingStatus } from 'src/enums/bookings.enum';
import { PaymentMethod, PaymentType } from 'src/enums/payments.enum';

// The guest's details as they were when the booking was made
@Schema({ _id: false })
export class GuestSnapshot {
  @Prop({ required: true }) name!: string;
  @Prop() phone?: string;
  @Prop() country?: string;
}
const GuestSnapshotSchema = SchemaFactory.createForClass(GuestSnapshot);

// One entry per room, each with its own dates and prices
@Schema({ _id: false })
export class BookingRoom {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true })
  roomId!: Types.ObjectId;

  @Prop({ required: true }) 
  roomNumber!: string; // copied, so history survives a renamed room

  @Prop({ required: true }) 
  checkIn!: Date; // date-only, 00:00 UTC

  @Prop({ required: true }) 
  checkOut!: Date; // the first night NOT stayed

  @Prop({ required: true, min: 0 }) 
  listPrice!: number; // the room's price when booked

  @Prop({ required: true, min: 0 }) 
  agreedPrice!: number; // what this guest pays per night
}

const BookingRoomSchema = SchemaFactory.createForClass(BookingRoom);

// "10 people for nights 1-3, then 4 people for nights 4-5"
@Schema({ _id: false })
export class DinnerPeriod {
  @Prop({ required: true }) 
  from!: Date; // first night with dinner

  @Prop({ required: true }) 
  to!: Date; // not included

  @Prop({ required: true, min: 1 }) 
  persons!: number;

  @Prop({ required: true, min: 0 }) 
  pricePerPerson!: number; // copied from the hotel settings
}
const DinnerPeriodSchema = SchemaFactory.createForClass(DinnerPeriod);

@Schema()
export class Payment {
  @Prop({ enum: PaymentType, required: true }) type!: PaymentType;
  @Prop({ required: true, min: 0 }) amount!: number;
  @Prop({ enum: PaymentMethod, required: true }) method!: PaymentMethod;
  @Prop({ default: () => new Date() }) date!: Date;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  recordedBy?: Types.ObjectId;
  @Prop({ trim: true }) note?: string;
}
const PaymentSchema = SchemaFactory.createForClass(Payment);

@Schema({ _id: false })
export class HistoryEntry {
  @Prop({ default: () => new Date() }) at!: Date;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  by?: Types.ObjectId;
  @Prop({ required: true }) action!: string; // e.g. 'created', 'checked_in', 'price_changed'
  @Prop({ type: mongoose.Schema.Types.Mixed })
  details?: Record<string, unknown>;
}
const HistoryEntrySchema = SchemaFactory.createForClass(HistoryEntry);

@Schema({ timestamps: true })
export class Booking {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true })
  hotelId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true })
  guestId!: Types.ObjectId;

  @Prop({ type: GuestSnapshotSchema, required: true })
  guest!: GuestSnapshot;

  @Prop({ required: true, min: 1 })
  totalGuests!: number;

  @Prop({ type: [BookingRoomSchema], default: [] })
  rooms!: BookingRoom[];

  // Earliest check-in and latest check-out over all rooms (for filtering and sorting)
  @Prop({ required: true }) checkIn!: Date;
  @Prop({ required: true }) checkOut!: Date;

  @Prop({ type: [DinnerPeriodSchema], default: [] })
  dinner!: DinnerPeriod[];

  @Prop({ type: [PaymentSchema], default: [] })
  payments!: Payment[];

  // Always calculated by the server, never sent by the client
  @Prop({ default: 0 }) roomTotal!: number;
  @Prop({ default: 0 }) dinnerTotal!: number;
  @Prop({ default: 0 }) total!: number;

  @Prop({ enum: BookingStatus, default: BookingStatus.Confirmed })
  status!: BookingStatus;

  @Prop({ enum: BookingSource, default: BookingSource.Direct })
  source!: BookingSource;

  @Prop({ trim: true }) notes?: string;

  @Prop() checkedInAt?: Date;
  @Prop() checkedOutAt?: Date;
  @Prop() cancelledAt?: Date;
  @Prop({ trim: true }) cancelReason?: string;

  @Prop({ type: [HistoryEntrySchema], default: [] })
  history!: HistoryEntry[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export type BookingDocument = HydratedDocument<Booking>;
export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index({ hotelId: 1, checkIn: 1 });
BookingSchema.index({ hotelId: 1, status: 1 });
BookingSchema.index({ hotelId: 1, guestId: 1 });
BookingSchema.index({ hotelId: 1, 'rooms.roomId': 1 });