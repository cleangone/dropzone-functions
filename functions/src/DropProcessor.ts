import * as admin from 'firebase-admin'
const { CloudTasksClient } = require('@google-cloud/tasks')
import { uuid } from 'uuidv4'
import { Drop } from "./Managers"
import { DropPayload } from "./DropPayload"
import { Config } from "./Config"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class DropProcessor {
   db: admin.firestore.Firestore
   
   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   async processDrop(change: any, dropId: string) {
      log.info("processDrop")
      let dropDesc = "drops[id: " + dropId + "]"
      if (!change.after.exists) { return log.info(dropDesc + " deleted") }
   
      const drop = change.after.data()
      if (!drop) { return log.error(dropDesc + " data does not exist") }
      
      dropDesc = "drops[id: " + dropId + ", status: " + drop.status + "]"
      log.info("Processing " + dropDesc)
      
      if (Drop.isScheduling(drop)) {
         log.info("Drop.isScheduling") 
         
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
         .catch(error => { return log.error("Error setting " + timerDesc, error) })
      }
      else { 
         // setup, countdown, scheduled, live, dropped
         return log.info("Bypassing " + dropDesc) }
   }

   async startCountdown(dropPayload: DropPayload) {
      log.info("startCountdown", dropPayload)
      const dropDesc = "drop[id: " + dropPayload.dropId + "]"
            
      const dropRef = this.db.collection("drops").doc(dropPayload.dropId)
      return dropRef.get().then(doc => {
         if (!doc.exists) { throw new Error(log.returnError("Doc does not exist for " + dropDesc)) }
         const drop = doc.data()
         if (!drop) { throw new Error(log.returnError("Doc.data does not exist for " + dropDesc)) }
      
         // verify drop still scheduled with payload's cloudTaskId
         const bypassMsg = "Bypassing " + dropDesc + " start countdown"
         if (!Drop.isScheduled(drop)) { return log.info(bypassMsg + " because not scheduled") }
         if (!(drop.cloudTaskId === dropPayload.cloudTaskId)) { return log.info(bypassMsg + " because cloudTaskId does not match") }

         return dropRef.update({ status: Drop.STATUS_START_COUNTDOWN })
      })
   }
}
