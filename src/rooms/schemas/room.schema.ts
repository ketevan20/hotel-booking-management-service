import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Room {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true })
  hotelId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  number!: string;

  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ required: true, min: 1 })
  capacity!: number;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;

  // Used later so past occupancy only counts rooms that existed on those days
  @Prop()
  deactivatedAt?: Date;
}

export type RoomDocument = HydratedDocument<Room>;
export const RoomSchema = SchemaFactory.createForClass(Room);

// Room numbers are unique within one hotel, not across hotels
RoomSchema.index({ hotelId: 1, number: 1 }, { unique: true });