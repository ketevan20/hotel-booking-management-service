import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AvailableQueryDto {
  @Matches(DAY, { message: 'from must look like 2026-11-10' })
  from!: string;

  @Matches(DAY, { message: 'to must look like 2026-11-13' })
  to!: string; // the first night not needed
}