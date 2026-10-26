import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from 'src/enums/role.enum';

@Schema({ timestamps: true })
export class User {
    @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true })
    hotelId!: Types.ObjectId;

    @Prop({ required: true, trim: true })
    name!: string;

    @Prop({ trim: true })
    phone?: string;

    @Prop({ required: true, unique: true, lowercase: true, trim: true })
    email!: string;

    @Prop({ required: true, select: false })
    passwordHash!: string;

    @Prop({ enum: Role, required: true })
    role!: Role;

    @Prop({ default: false })
    isOwner!: boolean;

    @Prop({ default: true })
    isActive!: boolean;

    @Prop({ default: false })
    emailVerified!: boolean;

    @Prop({ select: false })
    emailVerificationTokenHash?: string;

    @Prop({ select: false })
    emailVerificationExpiresAt?: Date;

    @Prop({ select: false })
    passwordResetTokenHash?: string;

    @Prop({ select: false })
    passwordResetExpiresAt?: Date;

    @Prop()
    lastLoginAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User', default: null })
    createdBy!: Types.ObjectId | null;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// Only one owner per hotel, enforced by the database itself
UserSchema.index(
    { hotelId: 1 },
    { unique: true, partialFilterExpression: { isOwner: true } },
);