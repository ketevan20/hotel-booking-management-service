import { Transform } from 'class-transformer';
import { IsEmail, IsISO4217CurrencyCode, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  hotelName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country!: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  // bcrypt only uses the first 72 bytes, so longer passwords add nothing
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}