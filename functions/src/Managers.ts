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
   public static readonly STATUS_SCHEDULING = 'Scheduling'
   public static readonly STATUS_SCHEDULED  = 'Scheduled'
   public static readonly STATUS_START_COUNTDOWN = 'Start Countdown'
   public static readonly STATUS_COUNTDOWN  = 'Countdown'
   public static readonly STATUS_LIVE       = 'Live'
   
   public static isScheduling(drop: any)     { return drop.status === this.STATUS_SCHEDULING }
   public static isScheduled(drop: any)      { return drop.status === this.STATUS_SCHEDULED }
   public static isStartCountdown(drop: any) { return drop.status === this.STATUS_START_COUNTDOWN }
   public static isCountdown(drop: any)      { return drop.status === this.STATUS_COUNTDOWN }
}

export class EmailMgr {
   public static readonly TYPE_PURCHASE_SUCCESS = 'emailPurchaseSuccess'
   public static readonly TYPE_PURCHASE_FAIL    = 'emailPurchaseFail'
   public static readonly TYPE_WINNING_BID      = 'winningBid'
   public static readonly TYPE_SHIPPING         = 'emailShipping'
}

export class InvoiceMgr {
   public static readonly STATUS_CREATED   = 'Created'
   public static readonly STATUS_REVISED   = 'Revised'
   public static readonly STATUS_PAID_FULL = 'Paid in Full'
   public static readonly STATUS_SHIPPED   = 'Shipped'
   
   public static readonly SEND_STATUS_SENDING = 'Sending'
   public static readonly SEND_STATUS_SENT    = 'Sent'
   
   public static isCreated(invoice: any)  { return invoice.status === this.STATUS_CREATED }
   public static isRevised(invoice: any)  { return invoice.status === this.STATUS_REVISED }
   public static isPaidFull(invoice: any) { return invoice.status === this.STATUS_PAID_FULL }
   public static isShipped(invoice: any)  { return invoice.status === this.STATUS_SHIPPED }

   public static isSending(invoice: any) { return invoice.sendStatus === this.SEND_STATUS_SENDING }
}

export class ItemMgr {
   public static readonly STATUS_SETUP     = 'Setup'
   public static readonly STATUS_AVAILABLE = 'Available'
   public static readonly STATUS_DROPPING  = 'Dropping'
   public static readonly STATUS_HOLD      = 'On Hold'
   public static readonly STATUS_SOLD      = 'Sold'

   public static isAvailable(item: any)  { return item.status === this.STATUS_AVAILABLE }
}
