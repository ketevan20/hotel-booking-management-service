import { IsIn, IsOptional } from 'class-validator';

export class SummaryQueryDto {
    @IsOptional() @IsIn(['today', 'week', 'month'])
    range?: 'today' | 'week' | 'month';
}