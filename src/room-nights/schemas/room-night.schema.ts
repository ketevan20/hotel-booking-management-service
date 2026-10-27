import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { RoomNightType } from 'src/enums/roomNight.enum';

@Schema({ timestamps: true })
export class RoomNight {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true })
  hotelId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true })
  roomId!: Types.ObjectId;

  @Prop({ required: true })
  date!: Date; // the night, at 00:00 UTC

  @Prop({ enum: RoomNightType, required: true })
  type!: RoomNightType;

  // set for booking nights (the bookings module comes later)
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' })
  bookingId?: Types.ObjectId;

  @Prop({ trim: true })
  note?: string;
}

export type RoomNightDocument = HydratedDocument<RoomNight>;
export const RoomNightSchema = SchemaFactory.createForClass(RoomNight);

// The double-booking protection: one record per room per night, enforced by the database
RoomNightSchema.index({ roomId: 1, date: 1 }, { unique: true });
// For "all rooms on this date" lookups
RoomNightSchema.index({ hotelId: 1, date: 1 });