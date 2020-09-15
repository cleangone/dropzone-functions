import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
const { CloudTasksClient } = require('@google-cloud/tasks')
import { uuid } from 'uuidv4'
import { Drop } from "./Models"
import { DropPayload } from "./DropPayload"
import { Config } from "./Config"


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
      
      if (Drop.isSchedule(drop)) {
         log.info("Drop.isSchedule") 
         
         const functionUrl = 
            "https://" + Config.FIREBASE_LOCATION + "-" +  Config.PROJECT_ID +  ".cloudfunctions.net/startDropCountdown"
         const cloudTaskId = uuid()
         const dropPayload: DropPayload = { dropId: drop.id, cloudTaskId: cloudTaskId }
         const startCountdownSeconds = drop.startDate.seconds - 60 // start countdown a minute before drop.startDate 
         const cloudTask = {
            httpRequest: {
              httpMethod: "POST",
              url: functionUrl,
              body: Buffer.from(JSON.stringify(dropPayload)).toString("base64"),
              headers: { "Content-Type": "application/json" },
            },
            scheduleTime: { seconds: startCountdownSeconds }
         }

         log.info("Creating gcloud task")         
         const tasksClient = new CloudTasksClient()
         const queuePath = tasksClient.queuePath(Config.PROJECT_ID, Config.GCLOUD_QUEUE_LOCATION, Config.GCLOUD_QUEUE_NAME)
         await tasksClient.createTask({ parent: queuePath, task: cloudTask })

         log.info("Setting drop to scheduled")         
         return change.after.ref.update({ status: Drop.STATUS_SCHEDULED, cloudTaskId: cloudTaskId })
      }
      else if (Drop.isStartCountdown(drop)) {
         const timerId = "d-" + drop.id
         const timerDesc = "timers[id: " + timerId + "]"
          
         const timerRef = this.db.collection("timers").doc(timerId)
         log.info("Setting " + timerDesc)
         const timer = { id: timerId, dropId: drop.id, expireDate: drop.startDate.seconds * 1000 }
         return timerRef.set(timer).then(() => { 
            return change.after.ref.update({ status: Drop.STATUS_COUNTDOWN })
         })
         .catch(error => { return logError("Error setting " + timerDesc, error) })
      }
      else { 
         // setup, countdown, scheduled, live, dropped
         return logInfo("Bypassing " + dropDesc) }
   }

   async startCountdown(dropPayload: DropPayload) {
      log.info("startCountdown", dropPayload)
      const dropDesc = "drop[id: " + dropPayload.dropId + "]"
            
      const dropRef = this.db.collection("drops").doc(dropPayload.dropId)
      return dropRef.get().then(doc => {
         if (!doc.exists) { throw new Error(logReturnError("Doc does not exist for " + dropDesc)) }
         const drop = doc.data()
         if (!drop) { throw new Error(logReturnError("Doc.data does not exist for " + dropDesc)) }
      
         // verify drop still scheduled with payload's cloudTaskId
         const bypassMsg = "Bypassing " + dropDesc + " start countdown"
         if (!Drop.isScheduled(drop)) { return logInfo(bypassMsg + " because not scheduled") }
         if (!(drop.cloudTaskId === dropPayload.cloudTaskId)) { return logInfo(bypassMsg + " because cloudTaskId does not match") }

         return dropRef.update({ status: Drop.STATUS_START_COUNTDOWN })
      })
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

function logReturnError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return msg
}