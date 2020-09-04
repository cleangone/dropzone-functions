import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const ACTION_TYPE_BID            = 'Bid'
const ACTION_TYPE_PURCHASE_REQ   = 'PurchaseRequest'
const ACTION_STATUS_PROCESSED    = 'Processed'
const ACTION_RESULT_HIGH_BID     = 'High Bid'
const ACTION_RESULT_OUTBID       = 'Outbid'
const ACTION_RESULT_PURCHASED    = 'Purchased'
const ACTION_RESULT_ALREADY_SOLD ='Already Sold'

const ITEM_STATUS_DROPPING = 'Dropping'
const ITEM_STATUS_HOLD = 'On Hold'

"use strict"
const log = functions.logger

export class ActionProcessor {
   db: admin.firestore.Firestore

   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   processAction(snapshot: any) {
      log.info("ActionProcessor.processAction")
      const action = snapshot.data()
      if (!action) { return logError("Action does not exist") }
      
      if (action.actionType == ACTION_TYPE_BID || action.actionType == ACTION_TYPE_PURCHASE_REQ) {
         if (!action.itemId) { return logError("action.itemId does not exist") }
         if (!action.userId) { return logError("action.userId does not exist") }
      }

      log.info("Processing " + desc(action))
      if (action.actionType == ACTION_TYPE_BID) {
         return this.processBid(action, snapshot)
      }
      else if (action.actionType == ACTION_TYPE_PURCHASE_REQ) {
         return this.processPurchaseRequest(action, snapshot)
      }
      else {
         log.info("Bypassing " + desc(action))
         return null
      }
   }

   processBid(action: any, snapshot: any) {
      log.info("ActionProcessor.processBid")
   
      const itemId = action.itemId
      const userId = action.userId
      
      const itemDesc = "items[id: " + itemId + "]"
      log.info("Processing bid on " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId);
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
   
         const processedDate = Date.now()
         // todo - read drop each time?  tramp data on bid?
         const extensionSeconds = 30
         const dropDoneDate = processedDate + extensionSeconds * 1000

         let itemUpdate = { }
         let actionResult = ACTION_RESULT_HIGH_BID
         if (item.buyPrice < action.amount) {
            itemUpdate = { 
               buyPrice: action.amount, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               currBidderId: userId, 
               lastUserActivityDate: processedDate, 
               dropDoneDate: dropDoneDate,
               status: ITEM_STATUS_DROPPING,
            }
         }
         else {
            itemUpdate = { bidderIds: admin.firestore.FieldValue.arrayUnion(action.userId) }
            actionResult = ACTION_RESULT_OUTBID
         }
         
         log.info("Updating " + itemDesc)
         return itemRef.update(itemUpdate).then(() => { 
            // set timer
            const timerDesc = "timers[id: " + itemId + "]"
            const timerRef = this.db.collection("timers").doc(itemId)
            log.info("Setting " + timerDesc)
            return timerRef.set({ dropDoneDate: dropDoneDate }).then(() => { 
               return this.updateAction(action, snapshot, processedDate, actionResult)
            })
            .catch(error => { return logError("Error setting " + timerDesc, error) })
         })
         .catch(error => { return logError("Error updating " + itemDesc, error) })
      })
      .catch(error => { return logError("Error getting " + itemDesc, error) })  
   }

   processPurchaseRequest(action: any, snapshot: any) {
      log.info("ActionProcessor.processPurchaseRequest")
      
      const itemId = action.itemId
      const userId = action.userId
      
      const itemDesc = "items[id: " + itemId + "]"
      log.info("Processing purchase request  " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId)
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
   
         const processedDate = Date.now()
         if (item.buyPrice == 0) {
            let itemUpdate = { 
               buyPrice: item.startPrice, 
               buyerId: userId, 
               lastUserActivityDate: processedDate, 
               status: ITEM_STATUS_HOLD
            }

            log.info("Updating " + itemDesc)
            return itemRef.update(itemUpdate).then(() => { 
               return this.updateAction(action, snapshot, processedDate, ACTION_RESULT_PURCHASED)
            })
            .catch(error => { return logError("Error updating " + itemDesc, error) })
         }
         else { 
            return this.updateAction(action, snapshot, processedDate, ACTION_RESULT_ALREADY_SOLD)
         }
      })
      .catch(error => { return logError("Error getting " + itemDesc, error) })  
   }

   updateAction(action:any, snapshot:any, processedDate:any, actionResult:string) { 
      console.log("Updating " + desc(action))
      return snapshot.ref.update({ 
         status: ACTION_STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult })
   }  
}

function desc(action:any) { return "actions[id: " + action.id + ", actionType: " + action.actionType + "]" }     
   

function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return null
}