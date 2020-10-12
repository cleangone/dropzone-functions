import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { DropProcessor } from "./DropProcessor"
import { InvoiceProcessor } from "./InvoiceProcessor"
import { ItemProcessor } from "./ItemProcessor"
import { SmsProcessor } from "./SmsProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { TagProcessor } from "./TagProcessor"
import { ErrorProcessor } from "./ErrorProcessor"
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { DropPayload } from "./DropPayload"
import { Log } from "./Log"

"use strict"
admin.initializeApp()
const db = admin.firestore()
const storage = admin.storage()
const log = new Log()

const settingsWrapper = new SettingsWrapper()
const emailer = new Emailer(db, admin.auth(), settingsWrapper)
// lazy instantiation because each function has a sep instance of each global var
let actionProcessor:  ActionProcessor
let dropProcessor:    DropProcessor
let invoiceProcessor: InvoiceProcessor
let itemProcessor:    ItemProcessor
let smsProcessor:     SmsProcessor
let timerProcessor:   TimerProcessor
let tagProcessor:     TagProcessor
let errorProcessor:   ErrorProcessor

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

export const startDropCountdown = functions.https.onRequest(async (req, res) => {
   if (!dropProcessor) { dropProcessor = new DropProcessor(db) }
   const dropPayload = req.body as DropPayload
   try {
      await dropProcessor.startCountdown(dropPayload)
      res.sendStatus(200)
   }
   catch (error) {
      log.error("startDropCountdown error", error)
      res.status(500).send(error)
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

export const processSmsInbound = functions.https.onRequest(async (req, res) => {
   try {
      // log.info("processSmsInbound", req.query) 
      if (!smsProcessor) { smsProcessor = new SmsProcessor(db) }
      await smsProcessor.receiveSms(req.query)
      res.sendStatus(200)
   }
   catch (error) {
      // log.error("processSmsInbound error", error)
      res.status(500).send(error)
   }
})
export const processSmsOutbound = functions.firestore
   .document('smsOutbound/{id}')
   .onCreate((snapshot, context) => {
      if (!smsProcessor) { smsProcessor = new SmsProcessor(db) }
      return smsProcessor.sendSms(snapshot) 
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