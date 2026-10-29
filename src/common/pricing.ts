const DAY_MS = 24 * 60 * 60 * 1000;

export function nightsBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

const money = (value: number) => Math.round(value * 100) / 100;

export function calculateTotals(
    rooms: { checkIn: Date; checkOut: Date; agreedPrice: number }[],
    dinner: { from: Date; to: Date; persons: number; pricePerPerson: number }[],
) {
    const roomTotal = money(
        rooms.reduce(
            (sum, r) => sum + r.agreedPrice * nightsBetween(r.checkIn, r.checkOut),
            0,
        ),
    );
    const dinnerTotal = money(
        dinner.reduce(
            (sum, d) => sum + d.persons * d.pricePerPerson * nightsBetween(d.from, d.to),
            0,
        ),
    );
    return { roomTotal, dinnerTotal, total: money(roomTotal + dinnerTotal) };
}