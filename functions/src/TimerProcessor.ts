import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"

const ITEM_STATUS_HOLD = 'On Hold'

"use strict"
const log = functions.logger

export class TimerProcessor {
   db: admin.firestore.Firestore
   emailer:Emailer
   settingsWrapper: SettingsWrapper
   settingsGetter: SettingsGetter

   constructor(db: admin.firestore.Firestore, emailer:Emailer, settingsWrapper: SettingsWrapper) {
      log.info("TimerProcessor.constructor")
      this.db = db
      this.emailer = emailer
      this.settingsWrapper = settingsWrapper
      this.settingsGetter = new SettingsGetter(db, settingsWrapper) 
   }

   async processTimer(change: any, timerId: string) {
      log.info("processTimer")
      if (this.settingsGetter.settingsPromiseExists()) {
         log.info("waiting for settingsPromise")
         await(this.settingsGetter.getSettingsPromise())
         log.info("settingsPromise complete", this.settingsWrapper)
         this.settingsGetter.resetSettingsPromise()
      }
      
      const timerDesc = "timers[id: " + timerId + "]"
      if (!change.after.exists) { 
         log.info(timerDesc + " deleted")
         return null 
      } 

      const timer = change.after.data();
      if (!timer) { return logError(timerDesc + " data does not exist") }

      const nowTime = (new Date()).getTime();
      const dropDoneDate = timer.dropDoneDate;
      if (dropDoneDate < nowTime) { 
         log.info(timerDesc + " expired") 
         return this.updateItem(change, timerId)
      }
      else {
         let remainingSeconds = Math.floor((dropDoneDate - nowTime)/1000)
         const sleepTime = remainingSeconds > 10 ? 2000 : 1000
         await sleep(sleepTime)
         remainingSeconds = Math.floor((dropDoneDate - nowTime)/1000)
         return change.after.ref.update({ remainingSeconds: remainingSeconds })
      }
   }

   async updateItem(change: any, timerId: string) {
      const itemId = timerId
      const itemDesc = "items[id: " + itemId + "]"
      const itemRef = this.db.collection("items").doc(itemId);
   
      log.info("Getting " + itemDesc)
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
    
         log.info("Updating " + itemDesc)
         const itemUpdate = { status: ITEM_STATUS_HOLD, buyerId: item.currBidderId }               
         return itemRef.update(itemUpdate).then(() => {        
            const timerDesc = "timers[id: " + timerId + "]"
            console.log("Deleting " + timerDesc) 
            return change.after.ref.delete().then(() => {   
               const subject = "Winning bid"
               const htmlMsg =  
                  "You are the winning bidder on item " + this.settingsWrapper.itemLink(item.id, item.name)
                  "<p>You will be contacted with the location of the alley in which to deliver the briefcase full of cash</p>"
               
               return this.emailer.sendEmail(item.currBidderId, subject, htmlMsg)
               .catch(error => { return logError("Error sending Email", error) }) 
            })
         })
         .catch(error => { return logError("Error updating " + itemDesc, error) })
      })
      .catch(error => { return logError("Error getting " + itemDesc, error) })
   }
}
   
async function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return null
}