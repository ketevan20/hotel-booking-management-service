import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { IdType } from 'src/enums/idType.enum';

@Schema({ timestamps: true })
export class Guest {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true })
  hotelId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop()
  phoneDigits?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ enum: IdType })
  idType?: IdType;

  // sensitive: left out of normal queries, requested explicitly in the detail view
  @Prop({ trim: true, select: false })
  idNumber?: string;

  @Prop({ trim: true })
  notes?: string;
}

export type GuestDocument = HydratedDocument<Guest>;
export const GuestSchema = SchemaFactory.createForClass(Guest);

GuestSchema.index({ hotelId: 1, name: 1 });
GuestSchema.index({ hotelId: 1, phoneDigits: 1 });