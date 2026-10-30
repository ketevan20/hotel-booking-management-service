import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { InvoiceStatus } from 'src/enums/invoices.enum';
import { PaymentMethod, PaymentType } from 'src/enums/payments.enum';

@Schema({ _id: false })
export class InvoiceHotel {
    @Prop({ required: true }) name!: string;
    @Prop() address?: string;
    @Prop() city?: string;
    @Prop() country?: string;
    @Prop() phone?: string;
    @Prop() email?: string;
    @Prop() taxId?: string;
    @Prop({ required: true }) currency!: string;
}
const InvoiceHotelSchema = SchemaFactory.createForClass(InvoiceHotel);

@Schema({ _id: false })
export class InvoiceGuest {
    @Prop({ required: true }) name!: string;
    @Prop() phone?: string;
    @Prop() country?: string;
}
const InvoiceGuestSchema = SchemaFactory.createForClass(InvoiceGuest);

@Schema({ _id: false })
export class InvoiceLine {
    @Prop({ required: true }) description!: string;
    @Prop({ required: true }) quantity!: number;
    @Prop({ required: true }) unitPrice!: number;
    @Prop() listUnitPrice?: number; // only when a different price was agreed
    @Prop({ required: true }) amount!: number;
}
const InvoiceLineSchema = SchemaFactory.createForClass(InvoiceLine);

@Schema({ _id: false })
export class InvoicePayment {
    @Prop({ required: true }) date!: Date;
    @Prop({ enum: PaymentType, required: true }) type!: PaymentType;
    @Prop({ enum: PaymentMethod, required: true }) method!: PaymentMethod;
    @Prop({ required: true }) amount!: number;
}
const InvoicePaymentSchema = SchemaFactory.createForClass(InvoicePayment);

@Schema({ timestamps: true })
export class Invoice {
    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true })
    hotelId!: Types.ObjectId;

    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true })
    bookingId!: Types.ObjectId;

    @Prop({ required: true }) number!: string;

    @Prop({ enum: InvoiceStatus, default: InvoiceStatus.Issued })
    status!: InvoiceStatus;

    @Prop({ default: () => new Date() }) issueDate!: Date;

    @Prop({ type: InvoiceHotelSchema, required: true }) hotel!: InvoiceHotel;
    @Prop({ type: InvoiceGuestSchema, required: true }) guest!: InvoiceGuest;

    @Prop({ required: true }) checkIn!: Date;
    @Prop({ required: true }) checkOut!: Date;

    @Prop({ type: [InvoiceLineSchema], default: [] }) lines!: InvoiceLine[];

    @Prop({ required: true }) roomTotal!: number;
    @Prop({ required: true }) dinnerTotal!: number;
    @Prop({ required: true }) total!: number;
    @Prop({ required: true }) paid!: number;
    @Prop({ required: true }) balanceDue!: number;

    @Prop({ type: [InvoicePaymentSchema], default: [] }) payments!: InvoicePayment[];

    @Prop() voidedAt?: Date;
    @Prop({ trim: true }) voidReason?: string;

    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
    createdBy?: Types.ObjectId;
}

export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ hotelId: 1, number: 1 }, { unique: true });
// At most one active invoice per booking, enforced by the database
InvoiceSchema.index(
    { bookingId: 1 },
    { unique: true, partialFilterExpression: { status: 'issued' } },
);
InvoiceSchema.index({ hotelId: 1, createdAt: -1 });