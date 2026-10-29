import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested, } from 'class-validator';
import { BookingSource } from 'src/enums/bookings.enum';
import { PaymentMethod } from 'src/enums/payments.enum';
import { CreateGuestDto } from 'src/guests/dto/create-guest.dto';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MSG = { message: 'must look like 2026-11-10' };

export class BookingRoomInputDto {
    @IsMongoId()
    roomId!: string;

    @Matches(DAY, DAY_MSG)
    checkIn!: string;

    @Matches(DAY, DAY_MSG)
    checkOut!: string; // the first night NOT stayed

    // Only an admin may send this. Without it, the room's list price is used
    @IsOptional() @IsNumber() @Min(0)
    agreedPrice?: number;
}

export class DinnerPeriodInputDto {
    @Matches(DAY, DAY_MSG)
    from!: string;

    @Matches(DAY, DAY_MSG)
    to!: string; // not included

    @IsInt() @Min(1)
    persons!: number;
}

export class DepositInputDto {
    @IsNumber() @Min(0.01)
    amount!: number;

    @IsEnum(PaymentMethod)
    method!: PaymentMethod;
}

export class CreateBookingDto {
    @IsOptional() @IsMongoId()
    guestId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => CreateGuestDto)
    guest?: CreateGuestDto;

    @IsInt() @Min(1)
    totalGuests!: number;

    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => BookingRoomInputDto)
    rooms!: BookingRoomInputDto[];

    @IsOptional() @IsArray() @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => DinnerPeriodInputDto)
    dinner?: DinnerPeriodInputDto[];

    @IsOptional()
    @ValidateNested()
    @Type(() => DepositInputDto)
    deposit?: DepositInputDto;

    @IsOptional() @IsEnum(BookingSource)
    source?: BookingSource;

    @IsOptional() @IsString() @MaxLength(1000)
    notes?: string;
}