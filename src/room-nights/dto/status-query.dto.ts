import { IsOptional, Matches } from 'class-validator';

export class StatusQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must look like 2026-11-10' })
  date?: string;
}