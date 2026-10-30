import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Res } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import type { AuthUser } from 'src/auth/guards/auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { renderInvoicePdf } from './invoice-pdf';
import type { Response } from 'express';

@UseGuards(AuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) { }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.generate(user, dto.bookingId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListInvoicesDto) {
    return this.invoicesService.list(user.hotelId, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.findOne(user.hotelId, id);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response ) {
    const invoice = await this.invoicesService.findOne(user.hotelId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoice.number.replace(/[^\w.-]/g, '_')}.pdf"`,
    );
    renderInvoicePdf(invoice, res);
  }

  @Roles(Role.Admin)
  @Post(':id/void')
  voidInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidInvoiceDto ) {
    return this.invoicesService.voidInvoice(user.hotelId, id, dto.reason);
  }
}
