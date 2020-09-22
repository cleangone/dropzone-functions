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
         else if (timer.dropId) { return this.setDropLive(change, timer) }
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

   async setDropLive(change: any, timer: any) {
      const dropDesc = "drops[id: " + timer.dropId + "]"
      const dropRef = this.db.collection("drops").doc(timer.dropId);
   
      let processingState = logInfo("Getting " + dropDesc)
      return dropRef.get().then(doc => {
         const drop = getDocData(doc, dropDesc)
         const promises = []

         if (Drop.isCountdown(drop)) {
            // update items in Setup to Available
            processingState = logInfo("Getting items in Setup")
            const itemQueryRef = this.db.collection("items").where("status", "==", Item.STATUS_SETUP)
            itemQueryRef.get().then(querySnapshot => {
               const batch = this.db.batch()
               querySnapshot.forEach(itemDoc => {
                  const item = itemDoc.data()
                  const itemDesc = "item[id: " + item.id + "]"
                  processingState = logInfo("Adding " + itemDesc + " update to batch")
                  const itemRef = this.db.collection("items").doc(item.id)
                  batch.update(itemRef, { status: Item.STATUS_AVAILABLE })
               })
               processingState = logInfo("Committing batch")
               promises.push(batch.commit())
            })
            .catch(error => { return logError("Error in " + processingState, error) })
         
            processingState = logInfo("Updating " + dropDesc)
            promises.push(dropRef.update({ status: Drop.STATUS_LIVE }))
         }
         
         processingState = logInfo("Deleting timer[id: " + timer.id + "]")
         promises.push(change.after.ref.delete())

         return Promise.all(promises)
      })
      .catch(error => { return logError("Error in " + processingState, error) })
   }

   async updateItem(change: any, timer: any) {
      const itemDesc = "item[id: " + timer.itemId + "]"
      let processingState = logInfo("Getting " + itemDesc)
      
      const itemRef = this.db.collection("items").doc(timer.itemId);
      return itemRef.get().then(doc => {
         const item = getDocData(doc, itemDesc)
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
   
function getDocData(doc: any, desc: string) {
   if (!doc.exists) { throw new Error("Doc does not exist for " + desc) }
   if (!doc.data()) { throw new Error("Doc.data does not exist for " + desc) }
   
   return doc.data()
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