import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaymentMethod, PaymentType } from 'src/enums/payments.enum';

export class AddPaymentDto {
  @IsEnum(PaymentType)
  type!: PaymentType;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}