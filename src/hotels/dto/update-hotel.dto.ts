import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsISO4217CurrencyCode, IsNumber, IsOptional, IsString, MaxLength, Min, } from 'class-validator';

export class UpdateHotelDto {
    @IsOptional() @IsString() @MaxLength(100)
    name?: string;

    @IsOptional() @IsString() @MaxLength(100)
    country?: string;

    @IsOptional() @IsString() @MaxLength(100)
    city?: string;

    @IsOptional() @IsString() @MaxLength(200)
    address?: string;

    @IsOptional() @IsString() @MaxLength(30)
    phone?: string;

    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(50)
    taxId?: string;

    @IsOptional() @IsISO4217CurrencyCode()
    currency?: string;

    @IsOptional() @IsString() @MaxLength(60)
    timezone?: string;

    @IsOptional() @IsBoolean()
    dinnerEnabled?: boolean;

    @IsOptional() @IsNumber() @Min(0)
    dinnerPricePerPerson?: number;

    @IsOptional() @IsString() @MaxLength(10)
    invoicePrefix?: string;

    @IsOptional() @IsBoolean()
    onboardingCompleted?: boolean;
}