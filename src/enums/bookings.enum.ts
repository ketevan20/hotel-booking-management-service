export enum BookingStatus {
  Confirmed = 'confirmed',
  CheckedIn = 'checked_in',
  CheckedOut = 'checked_out',
  Cancelled = 'cancelled',
  NoShow = 'no_show',
}

export enum BookingSource {
  Direct = 'direct',
  Phone = 'phone',
  WalkIn = 'walk_in',
  Other = 'other',
}

export enum BookingRange {
  Today = 'today',
  Week = 'week',
  Month = 'month',
}

export enum BookingSortBy {
  CheckIn = 'checkIn',
  CheckOut = 'checkOut',
  Guest = 'guest',
  CreatedAt = 'createdAt',
}