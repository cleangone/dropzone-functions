import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { InvoiceProcessor } from "./InvoiceProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"

"use strict"
admin.initializeApp()
const db = admin.firestore()
const settingsWrapper = new SettingsWrapper()
const emailer = new Emailer(db, admin.auth(), settingsWrapper)
// lazy instantiation because each function has a sep instance of each global var
let actionProcessor:ActionProcessor
let timerProcessor:TimerProcessor
let invoiceProcessor:InvoiceProcessor

export const processAction = functions.firestore
   .document('actions/{id}')
   .onCreate((snapshot, context) => {
      if (!actionProcessor) { actionProcessor = new ActionProcessor(db, emailer, settingsWrapper) }
      return actionProcessor.processAction(snapshot)
})

export const processTimer = functions.firestore
   .document('timers/{id}')
   .onWrite(async (change, context) => {
      if (!timerProcessor) { timerProcessor = new TimerProcessor(db, emailer, settingsWrapper) }
      return timerProcessor.processTimer(change, context.params.id)
})

export const processInvoice = functions.firestore
   .document('invoices/{id}')
   .onWrite((change, context) => {
      if (!invoiceProcessor) { invoiceProcessor = new InvoiceProcessor(db, emailer, settingsWrapper) }
      return invoiceProcessor.processInvoice(change, context.params.invoiceId)
})