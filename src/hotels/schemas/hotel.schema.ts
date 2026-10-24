import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { HotelStatus } from 'src/enums/hotelStatus.enum';

@Schema({ timestamps: true })
export class Hotel {
    @Prop({ required: true, trim: true })
    name!: string;

    @Prop({ required: true, trim: true })
    country!: string;

    @Prop({ trim: true })
    city?: string;

    @Prop({ trim: true })
    address?: string;

    @Prop({ trim: true })
    phone?: string;

    @Prop({ trim: true, lowercase: true })
    email?: string;

    @Prop({ trim: true })
    taxId?: string;

    @Prop({ default: 'GEL' })
    currency!: string;

    @Prop({ default: 'Asia/Tbilisi' })
    timezone!: string;

    @Prop({ default: false })
    dinnerEnabled!: boolean;

    @Prop({ default: 0, min: 0 })
    dinnerPricePerPerson!: number;

    @Prop({ trim: true })
    invoicePrefix?: string;

    @Prop({ default: 0 })
    invoiceCounter!: number;

    @Prop({ enum: HotelStatus, default: HotelStatus.Active })
    status!: HotelStatus;

    @Prop({ default: false })
    onboardingCompleted!: boolean;
}

export type HotelDocument = HydratedDocument<Hotel>;
export const HotelSchema = SchemaFactory.createForClass(Hotel);