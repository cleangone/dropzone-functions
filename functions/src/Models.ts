export class Action {
   public static readonly TYPE_BID            = 'Bid'
   public static readonly TYPE_PURCHASE_REQ   = 'Purchase Request'

   public static readonly STATUS_CREATED      = 'Created'
   public static readonly STATUS_PROCESSED    = 'Processed'

   public static readonly RESULT_HIGH_BID     = 'High Bid'
   public static readonly RESULT_INCREASED    = 'Increased'
   public static readonly RESULT_OUTBID       = 'Outbid'
   public static readonly RESULT_PURCHASED    = 'Purchased'
   public static readonly RESULT_ALREADY_SOLD = 'Already Sold'
   public static readonly RESULT_WINNING_BID  = 'Winning Bid'

   public static isBid(action: any) { return action.actionType === this.TYPE_BID }
   public static isPurchaseRequest(action: any) { return action.actionType === this.TYPE_PURCHASE_REQ }
   public static isWinningBid(action: any) { return action.actionResult === this.RESULT_WINNING_BID }
}

export class Drop {
   public static readonly STATUS_SCHEDULE  = 'Schedule'
   public static readonly STATUS_SCHEDULED = 'Scheduled'
   public static readonly STATUS_STARTUP   = 'Start Countdown'
   public static readonly STATUS_COUNTDOWN = 'Countdown'
   public static readonly STATUS_LIVE = 'Live'

   public static isSchedule(drop: any) { return drop.status === this.STATUS_SCHEDULED }
   public static isStartup(drop: any)  { return drop.status === this.STATUS_STARTUP }
}
export class Email {
   public static readonly PURCHASE_SUCCESS = 'emailPurchaseSuccess'
   public static readonly PURCHASE_FAIL    = 'emailPurchaseFail'
   public static readonly WINNING_BID      = 'winningBid'
}

export class Item {
   public static readonly STATUS_DROPPING = 'Dropping'
   public static readonly STATUS_HOLD     = 'On Hold'
   public static readonly STATUS_SOLD     = 'Sold'
}

export class Invoice {
   public static readonly STATUS_CREATED = 'Created'
   public static readonly STATUS_UPDATED = 'Updated'
   public static readonly STATUS_SENT    = 'Sent'
   public static readonly STATUS_PAID    = 'Paid'
   public static readonly STATUS_SHIPPED = 'Shipped'

   public static isCreated(invoice: any) { return invoice.status === this.STATUS_CREATED }
   public static isUpdated(invoice: any) { return invoice.status === this.STATUS_UPDATED }
   public static isPaid(invoice: any)    { return invoice.status === this.STATUS_PAID }
   public static isShipped(invoice: any) { return invoice.status === this.STATUS_SHIPPED }
}
