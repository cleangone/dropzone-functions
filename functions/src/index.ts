import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { DropProcessor } from "./DropProcessor"
import { InvoiceProcessor } from "./InvoiceProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { DropPayload } from "./DropPayload"

"use strict"
admin.initializeApp()
const db = admin.firestore()
const settingsWrapper = new SettingsWrapper()
const emailer = new Emailer(db, admin.auth(), settingsWrapper)
// lazy instantiation because each function has a sep instance of each global var
let actionProcessor:ActionProcessor
let dropProcessor:DropProcessor
let invoiceProcessor:InvoiceProcessor
let timerProcessor:TimerProcessor

export const processAction = functions.firestore
   .document('actions/{id}')
   .onCreate((snapshot, context) => {
      if (!actionProcessor) { actionProcessor = new ActionProcessor(db, emailer, settingsWrapper) }
      return actionProcessor.processAction(snapshot)
})

export const processDrop = functions.firestore
   .document('drops/{id}')
   .onWrite((change, context) => {
      if (!dropProcessor) { dropProcessor = new DropProcessor(db) }
      return dropProcessor.processDrop(change, context.params.id)
})

export const startDropCountdown = functions.https
   .onRequest(async (req, response) => {
      if (!dropProcessor) { dropProcessor = new DropProcessor(db) }
      const dropPayload = req.body as DropPayload
      try {
         await dropProcessor.startCountdown(dropPayload)
         response.sendStatus(200)
      }
      catch (error) {
         console.error(error)
         response.status(500).send(error)
      }
})

export const processInvoice = functions.firestore
   .document('invoices/{id}')
   .onWrite((change, context) => {
      if (!invoiceProcessor) { invoiceProcessor = new InvoiceProcessor(db, emailer, settingsWrapper) }
      return invoiceProcessor.processInvoice(change, context.params.id)
})

export const processTimer = functions.firestore
   .document('timers/{id}')
   .onWrite(async (change, context) => {
      if (!timerProcessor) { timerProcessor = new TimerProcessor(db, emailer, settingsWrapper) }
      return timerProcessor.processTimer(change, context.params.id)
})