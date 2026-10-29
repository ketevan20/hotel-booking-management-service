import { IsBoolean, IsOptional } from 'class-validator';

export class CheckOutDto {
    @IsOptional() @IsBoolean()
    allowUnpaid?: boolean; // admin only
}