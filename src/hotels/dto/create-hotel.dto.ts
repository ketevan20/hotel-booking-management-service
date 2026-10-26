import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { HotelStatus } from "src/enums/hotelStatus.enum";

export class CreateHotelDto {
    @IsNotEmpty()
    @IsString()
    name!: string

    @IsNotEmpty()
    @IsString()
    country!: string;

    @IsOptional()
    @IsString()
    city?: string

    @IsOptional()
    @IsString()
    address?: string

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    taxId?: string;

    @IsNotEmpty()
    @IsString()
    currency!: string;

    @IsNotEmpty()
    @IsString()
    timezone!: string;

    @IsNotEmpty()
    @IsBoolean()
    dinnerEnabled!: boolean;

    @IsNotEmpty()
    @IsNumber()
    dinnerPricePerPerson!: number;

    @IsOptional()
    @IsString()
    invoicePrefix?: string;

    @IsNotEmpty()
    @IsNumber()
    invoiceCounter!: number;

    @IsNotEmpty()
    @IsEnum(HotelStatus)
    status!: HotelStatus;

    @IsNotEmpty()
    @IsBoolean()
    onboardingCompleted!: boolean;
}
