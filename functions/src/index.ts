import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ActionProcessor } from "./ActionProcessor"
import { TimerProcessor } from "./TimerProcessor"
import { Emailer } from "./Emailer"

"use strict"
admin.initializeApp()
const db = admin.firestore()
let emailer = new Emailer(db, admin.auth())
let actionProcessor = new ActionProcessor(db)
let timerProcessor = new TimerProcessor(db, emailer)

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
