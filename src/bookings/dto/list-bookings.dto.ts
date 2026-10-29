import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BookingRange, BookingSortBy, BookingStatus } from 'src/enums/bookings.enum';

export class ListBookingsDto {
    @IsOptional() @IsString() @MaxLength(100)
    search?: string; // guest name, phone, or room number

    @IsOptional() @IsEnum(BookingRange)
    range?: BookingRange; // leave out to see all dates

    @IsOptional() @IsEnum(BookingStatus)
    status?: BookingStatus;

    @IsOptional() @IsEnum(BookingSortBy)
    sortBy?: BookingSortBy;

    @IsOptional() @IsEnum(['asc', 'desc'])
    order?: 'asc' | 'desc';

    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    limit?: number;
}     