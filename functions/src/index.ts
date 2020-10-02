import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { DropProcessor } from "./DropProcessor"
import { InvoiceProcessor } from "./InvoiceProcessor"
import { ItemProcessor } from "./ItemProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { TagProcessor } from "./TagProcessor"
import { ErrorProcessor } from "./ErrorProcessor"
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { DropPayload } from "./DropPayload"

"use strict"
admin.initializeApp()
const db = admin.firestore()
const storage = admin.storage()

const settingsWrapper = new SettingsWrapper()
const emailer = new Emailer(db, admin.auth(), settingsWrapper)
// lazy instantiation because each function has a sep instance of each global var
let actionProcessor: ActionProcessor
let dropProcessor: DropProcessor
let invoiceProcessor: InvoiceProcessor
let itemProcessor: ItemProcessor
let timerProcessor: TimerProcessor
let tagProcessor: TagProcessor
let errorProcessor: ErrorProcessor

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

export const processError = functions.firestore
   .document('errors/{id}')
   .onCreate((snapshot, context) => {
      if (!errorProcessor) { errorProcessor = new ErrorProcessor(db, emailer) }
      return errorProcessor.processError(snapshot)
})

export const processInvoice = functions.firestore
   .document('invoices/{id}')
   .onWrite((change, context) => {
      if (!invoiceProcessor) { invoiceProcessor = new InvoiceProcessor(db, emailer, settingsWrapper) }
      return invoiceProcessor.processInvoice(change, context.params.id)
})

export const processItem = functions.firestore
   .document('items/{id}')
   .onWrite((change, context) => {
      if (!itemProcessor) { itemProcessor = new ItemProcessor(db, storage) }
      return itemProcessor.processItem(change, context.params.id)
})

export const processTag = functions.firestore
   .document('tags/{id}')
   .onWrite((change, context) => {
      if (!tagProcessor) { tagProcessor = new TagProcessor(db) }
      return tagProcessor.processTag(change, context.params.id)
})

export const processTimer = functions.firestore
   .document('timers/{id}')
   .onWrite(async (change, context) => {
      if (!timerProcessor) { timerProcessor = new TimerProcessor(db, emailer, settingsWrapper) }
      return timerProcessor.processTimer(change, context.params.id)
})