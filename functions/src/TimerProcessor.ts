import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { uuid } from 'uuidv4'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { Action, Drop, Email, Item  } from "./Models"

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
      return dropRef.update({ status: Drop.STATUS_LIVE } ).then(() => {  
         const timerDesc = "timers[id: " + timer.id + "]"
         console.log("Deleting " + timerDesc) 
         return change.after.ref.delete()
      })
      .catch(error => { return logError("Error getting " + dropDesc, error) })
   }

   async updateItem(change: any, timer: any) {
      const itemDesc = "item[id: " + timer.itemId + "]"
      let processingState = logInfo("Getting " + itemDesc)
      
      const itemRef = this.db.collection("items").doc(timer.itemId);
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
    
         const promises = [] 
         
         processingState = logInfo("Updating " + itemDesc)
         promises.push(itemRef.update({ status: Item.STATUS_HOLD, buyerId: item.currBidderId }))
         
         processingState = logInfo("Creating winning bid action")
         const actionId = uuid()
         const action = { 
            id: actionId,
            actionType: Action.TYPE_BID,
            actionResult: Action.RESULT_WINNING_BID,
            createdDate: Date.now(),
            status: Action.STATUS_CREATED,
            userId: item.currBidderId,
            itemId: item.id,
            itemName: item.name,
            amount: item.buyPrice 
         }
         const actionRef = this.db.collection("actions").doc(actionId)
         promises.push(actionRef.set(action))
         
         processingState = "Sending email"
         promises.push(this.emailer.sendConfiguredEmail(item.currBidderId, Email.WINNING_BID, item.id, item.name))
         
         processingState = logInfo("Deleting timer[id: " + timer.id + "]")
         promises.push(change.after.ref.delete())

         return Promise.all(promises)
      })
      .catch(error => { return logError("Error in " + processingState, error) })
   }
}
   
async function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

function logInfo(msg: string) {
   log.info(msg)
   return msg
}

function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return null
}