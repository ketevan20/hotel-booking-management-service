import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidInvoiceDto {
    @IsOptional() @IsString() @MaxLength(500)
    reason?: string;
}