import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"

const DROP_STATUS_LIVE = 'Live'
const ITEM_STATUS_HOLD = 'On Hold'

const EMAIL_WINNING_BID = 'winningBid'

"use strict"
const log = functions.logger

/*
   timer:
      id - ("i-" + itemId) or ("d-" + dropId) for viewing in console
      itemId or dropId
      expireDate
      remainingSeconds - changing this field is what drives the function 
*/

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
      const expireDate = timer.expireDate;
      if (expireDate < nowTime) { 
         log.info(timerDesc + " expired") 
         if (timer.itemId) { return this.updateItem(change, timer) }
         else if (timer.dropId) { return this.updateDrop(change, timer) }
         else { return logError(timerDesc + " does not have itemId or dropId") }
      }
      else {
         let remainingSeconds = Math.floor((expireDate - nowTime)/1000)
         const sleepTime = remainingSeconds > 10 ? 2000 : 1000
         await sleep(sleepTime)
         remainingSeconds = Math.floor((expireDate - nowTime)/1000)
         return change.after.ref.update({ remainingSeconds: remainingSeconds })
      }
   }

   async updateDrop(change: any, timer: any) {
      const dropDesc = "drops[id: " + timer.dropId + "]"
      const dropRef = this.db.collection("drops").doc(timer.dropId);
   
      log.info("Updating " + dropDesc)
      return dropRef.update({ status: DROP_STATUS_LIVE } ).then(() => {  
         const timerDesc = "timers[id: " + timer.id + "]"
         console.log("Deleting " + timerDesc) 
         return change.after.ref.delete()
      })
      .catch(error => { return logError("Error getting " + dropDesc, error) })
   }

   async updateItem(change: any, timer: any) {
      const itemDesc = "items[id: " + timer.itemId + "]"
      const itemRef = this.db.collection("items").doc(timer.itemId);
   
      log.info("Getting " + itemDesc)
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
    
         log.info("Updating " + itemDesc)
         const itemUpdate = { status: ITEM_STATUS_HOLD, buyerId: item.currBidderId }               
         return itemRef.update(itemUpdate).then(() => {        
            const timerDesc = "timers[id: " + timer.id + "]"
            console.log("Deleting " + timerDesc) 
            return change.after.ref.delete().then(() => {   
               return this.emailer.sendConfiguredEmail(item.currBidderId, EMAIL_WINNING_BID, item.id, item.name)
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