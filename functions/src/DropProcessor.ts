import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const DROP_STATUS_SCHEDULE  = 'Schedule'
const DROP_STATUS_SCHEDULED = 'Scheduled'
const DROP_STATUS_STARTUP   = 'Start Countdown'
const DROP_STATUS_COUNTDOWN = 'Countdown'

"use strict"
const log = functions.logger

export class DropProcessor {
   db: admin.firestore.Firestore
   
   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   async processDrop(change: any, dropId: string) {
      log.info("processDrop")
      let dropDesc = "drops[id: " + dropId + "]"
      if (!change.after.exists) { return logInfo(dropDesc + " deleted") }
   
      const drop = change.after.data()
      if (!drop) { return logError(dropDesc + " data does not exist") }
      
      dropDesc = "drops[id: " + dropId + ", status: " + drop.status + "]"
      log.info("Processing " + dropDesc)
      if (drop.status === DROP_STATUS_SCHEDULE) {
         return change.after.ref.update({ status: DROP_STATUS_SCHEDULED })
      }
      else if (drop.status === DROP_STATUS_STARTUP) {
         const timerId = "d-" + drop.id
         const timerDesc = "timers[id: " + timerId + "]"
         
         const timerRef = this.db.collection("timers").doc(timerId)
         log.info("Setting " + timerDesc)
         log.info("startDate ", drop.startDate)
         // let seconds = drop.startDate.seconds
         const timer = { id: timerId, dropId: drop.id, expireDate: drop.startDate.seconds * 1000 }
         return timerRef.set(timer).then(() => { 
            return change.after.ref.update({ status: DROP_STATUS_COUNTDOWN })
         })
         .catch(error => { return logError("Error setting " + timerDesc, error) })
      }
      else { return logInfo("Bypassing " + dropDesc) }
   }
}

function logInfo(msg: string) {
   log.info(msg) 
   return null
}

function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return null
}