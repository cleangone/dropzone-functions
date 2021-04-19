import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { Action, Drop, EmailMgr, ItemMgr  } from "./Managers"
import { Uid } from "./Utils"
import { Log } from "./Log"

"use strict"
const log = new Log()

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
      if (!change.after.exists) { return log.info(timerDesc + " deleted") } 

      const timer = change.after.data();
      if (!timer) { return log.error(timerDesc + " data does not exist") }

      const nowTime = (new Date()).getTime();
      const expireDate = timer.expireDate;
      if (expireDate < nowTime) { 
         log.info(timerDesc + " expired") 
         if (timer.itemId) { return this.updateItemWinningBid(change, timer) }
         else if (timer.dropId) { return this.setDropLive(change, timer) }
         else { return log.error(timerDesc + " does not have itemId or dropId") }
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
   
      let processingState = log.returnInfo("Getting " + dropDesc)
      return dropRef.get().then(doc => {
         const drop = getDocData(doc, dropDesc)
         const promises = []

         if (Drop.isCountdown(drop)) {
            // update items in Setup to Available
            processingState = log.returnInfo("Getting items in Setup")
            const itemQueryRef = this.db.collection("items").where("status", "==", ItemMgr.STATUS_SETUP)
            itemQueryRef.get().then(querySnapshot => {
               const batch = this.db.batch()
               querySnapshot.forEach(itemDoc => {
                  const item = itemDoc.data()
                  const itemDesc = "item[id: " + item.id + ", name: " + item.name + ", status: " + item.status + "]"
                  processingState = log.returnInfo("Adding " + itemDesc + " update to batch")
                  const itemRef = this.db.collection("items").doc(item.id)
                  batch.update(itemRef, { status: ItemMgr.STATUS_AVAILABLE, availableDate: Date.now() })
               })
               processingState = log.returnInfo("Committing batch status update")
               promises.push(batch.commit())
            })
            .catch(error => { return log.error("Error in " + processingState, error) })
         
            processingState = log.returnInfo("Updating " + dropDesc)
            promises.push(dropRef.update({ status: Drop.STATUS_LIVE }))
         }
         
         processingState = log.returnInfo("Deleting timer[id: " + timer.id + "]")
         promises.push(change.after.ref.delete())

         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })
   }

   async updateItemWinningBid(change: any, timer: any) {
      const itemDesc = "item[id: " + timer.itemId + "]"
      let processingState = log.returnInfo("Getting " + itemDesc)
      
      const itemRef = this.db.collection("items").doc(timer.itemId);
      return itemRef.get().then(doc => {
         const item = getDocData(doc, itemDesc)
         const promises = [] 
         
         processingState = log.returnInfo("Updating " + itemDesc)
         promises.push(itemRef.update({ 
            status: ItemMgr.STATUS_HOLD, 
            buyerId: item.currBid.userId,
            buyDate: new Date() }))
         
         processingState = log.returnInfo("Creating winning bid action")
         const actionId = Uid.dateUid()
         const action = { 
            id: actionId,
            actionType: Action.TYPE_BID,
            actionResult: Action.RESULT_WINNING_BID,
            createdDate: Date.now(),
            status: Action.STATUS_CREATED,
            userId: item.currBid.userId,
            userNickname: item.currBid.userNickname,
            itemId: item.id,
            itemName: item.name,
            amount: item.buyPrice,
            maxAmount: item.currBid.amount
         }
         const actionRef = this.db.collection("actions").doc(actionId)
         promises.push(actionRef.set(action))
         
         processingState = "Sending email"
         promises.push(this.emailer.sendConfiguredEmail(item.currBid.userId, EmailMgr.TYPE_WINNING_BID, item.id, item.name))
         
         processingState = log.returnInfo("Deleting timer[id: " + timer.id + "]")
         promises.push(change.after.ref.delete())

         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })
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
