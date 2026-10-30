import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { Invoice } from './schemas/invoice.schema';
import { InvoiceStatus } from 'src/enums/invoices.enum';

const day = (date: Date) => date.toISOString().slice(0, 10);

// Put regular.ttf and bold.ttf in backend/assets/fonts to print non-Latin text (e.g. Georgian)
const fontsDir = join(process.cwd(), 'assets', 'fonts');
const pick = (file: string, fallback: string) =>
    existsSync(join(fontsDir, file)) ? join(fontsDir, file) : fallback;

export function renderInvoicePdf(invoice: Invoice, res: Response) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const regular = pick('regular.ttf', 'Helvetica');
    const bold = pick('bold.ttf', 'Helvetica-Bold');
    const money = (value: number) => `${value.toFixed(2)} ${invoice.hotel.currency}`;

    doc.pipe(res);

    // --- header: hotel on the left, invoice info on the right ---
    doc.font(bold).fontSize(18).text(invoice.hotel.name, 50, 50, { width: 280 });
    doc.font(regular).fontSize(10);
    const place = [invoice.hotel.address, invoice.hotel.city, invoice.hotel.country]
        .filter(Boolean)
        .join(', ');
    if (place) doc.text(place, { width: 280 });
    if (invoice.hotel.phone) doc.text(`Tel: ${invoice.hotel.phone}`);
    if (invoice.hotel.email) doc.text(invoice.hotel.email);
    if (invoice.hotel.taxId) doc.text(`Tax ID: ${invoice.hotel.taxId}`);

    doc.font(bold).fontSize(22).text('INVOICE', 350, 50, { width: 195, align: 'right' });
    doc.font(regular).fontSize(10);
    doc.text(`No: ${invoice.number}`, 350, 80, { width: 195, align: 'right' });
    doc.text(`Date: ${day(invoice.issueDate)}`, 350, 94, { width: 195, align: 'right' });
    if (invoice.status === InvoiceStatus.Void) {
        doc.font(bold).fillColor('red').text('VOID', 350, 108, { width: 195, align: 'right' });
        doc.fillColor('black');
    }

    // --- bill to ---
    doc.font(bold).fontSize(10).text('Bill to', 50, 160);
    doc.font(regular);
    doc.text(invoice.guest.name);
    if (invoice.guest.phone) doc.text(invoice.guest.phone);
    if (invoice.guest.country) doc.text(invoice.guest.country);
    doc.text(`Stay: ${day(invoice.checkIn)} to ${day(invoice.checkOut)}`, 350, 160, {
        width: 195,
        align: 'right',
    });

    // --- table ---
    let y = 240;
    const newPageIfNeeded = (needed: number) => {
        if (y + needed > 760) {
            doc.addPage();
            y = 50;
        }
    };
    const row = (cells: string[], font: string) => {
        const height = Math.max(doc.font(font).fontSize(10).heightOfString(cells[0], { width: 270 }), 12);
        newPageIfNeeded(height + 8);
        doc.font(font).fontSize(10);
        doc.text(cells[0], 50, y, { width: 270 });
        doc.text(cells[1], 330, y, { width: 40, align: 'right' });
        doc.text(cells[2], 375, y, { width: 80, align: 'right' });
        doc.text(cells[3], 460, y, { width: 85, align: 'right' });
        y += height + 6;
    };

    row(['Description', 'Qty', 'Unit price', 'Amount'], bold);
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 6;

    for (const line of invoice.lines) {
        const description = line.listUnitPrice
            ? `${line.description} (list price ${line.listUnitPrice.toFixed(2)})`
            : line.description;
        row([description, String(line.quantity), line.unitPrice.toFixed(2), line.amount.toFixed(2)], regular);
    }
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 10;

    // --- totals ---
    const totalRow = (label: string, value: string, font: string) => {
        newPageIfNeeded(20);
        doc.font(font).fontSize(10);
        doc.text(label, 330, y, { width: 125, align: 'right' });
        doc.text(value, 460, y, { width: 85, align: 'right' });
        y += 16;
    };
    totalRow('Rooms', money(invoice.roomTotal), regular);
    if (invoice.dinnerTotal > 0) totalRow('Dinner', money(invoice.dinnerTotal), regular);
    totalRow('Total', money(invoice.total), bold);
    totalRow('Paid', money(invoice.paid), regular);
    totalRow('Balance due', money(invoice.balanceDue), bold);

    // --- payments ---
    if (invoice.payments.length > 0) {
        y += 10;
        newPageIfNeeded(30);
        doc.font(bold).fontSize(10).text('Payments', 50, y);
        y += 16;
        for (const payment of invoice.payments) {
            newPageIfNeeded(16);
            const sign = payment.type === 'refund' ? '-' : '';
            doc.font(regular).fontSize(9).text(
                `${day(payment.date)}   ${payment.type}   ${payment.method}   ${sign}${payment.amount.toFixed(2)}`,
                50,
                y,
            );
            y += 13;
        }
    }

    doc.end();
}