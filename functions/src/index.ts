import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { InvoiceProcessor } from "./InvoiceProcessor"
import { Emailer } from "./Emailer"

"use strict"
admin.initializeApp()
const db = admin.firestore()
const emailer = new Emailer(db, admin.auth())
const actionProcessor = new ActionProcessor(db)
const timerProcessor = new TimerProcessor(db, emailer)
const invoiceProcessor = new InvoiceProcessor(db, emailer)

export const processAction = functions.firestore
   .document('actions/{actionId}')
   .onCreate((snapshot, context) => {
      return actionProcessor.processAction(snapshot)
})

export const processTimer = functions.firestore
   .document('timers/{timerId}')
   .onWrite(async (change, context) => {
      return timerProcessor.processTimer(change, context.params.timerId)
})

export const processInvoice = functions.firestore
   .document('invoices/{invoiceId}')
   .onWrite((change, context) => {
      return invoiceProcessor.processInvoice(change, context.params.invoiceId)
})

// convenience methods to log and return
// function logInfo(msg: string) {
//    log.info(msg)
//    return null
// }

// function logError(msg: string, error: any = null) {
//    if (error) { log.error(msg, error)}
//    else { log.error(msg) }

//    return null
// }
