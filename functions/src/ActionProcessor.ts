import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { Action, EmailMgr, ItemMgr } from "./Managers"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class ActionProcessor {
   db: admin.firestore.Firestore
   emailer: Emailer
   settingsWrapper: SettingsWrapper
   settingsGetter: SettingsGetter

   constructor(db: admin.firestore.Firestore, emailer: Emailer, settingsWrapper: SettingsWrapper) {
      log.info("ActionProcessor.constructor")
      this.db = db
      this.emailer = emailer
      this.settingsWrapper = settingsWrapper
      this.settingsGetter = new SettingsGetter(db, settingsWrapper) 
   }

   async processAction(snapshot: any) {
      log.info("processAction")
      if (this.settingsGetter.settingsPromiseExists()) {
         log.info("waiting for settingsPromise")
         await(this.settingsGetter.getSettingsPromise())
         log.info("settingsPromise complete", this.settingsWrapper)
         this.settingsGetter.resetSettingsPromise()
      }

      const action = snapshot.data()
      if (!action) { return log.error("Action does not exist") }
      
      if (Action.isBid(action) || Action.isPurchaseRequest(action)) {
         if (!action.itemId) { return log.error("action.itemId does not exist") }
         if (!action.userId) { return log.error("action.userId does not exist") }
      }

      log.info("Processing " + desc(action))
      if (Action.isWinningBid(action)) { 
         log.info("Bypassing winning bid" + desc(action)) 
         return null
      }
      else if (Action.isBid(action)) {  
         return this.processBid(action, snapshot)
      }
      else if (Action.isPurchaseRequest(action)) {
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
      let processingState = log.returnInfo("Getting " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId);
      return itemRef.get().then(doc => {
         if (!doc.exists) { return log.error("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return log.error("Doc.data does not exist for " + itemDesc) }
   
         processingState = log.returnInfo("Generating bidResults for " + itemDesc)
         const processedDate = Date.now()
         const extensionSeconds = this.settingsWrapper.bidAdditionalSeconds()
         const dropDoneDate = processedDate + extensionSeconds * 1000
         const numberOfBids = item.numberOfBids ? item.numberOfBids + 1 : 1
         
         const bidResult = new BidResult()
         if (item.buyPrice === 0) {
            // first bidder
            if (action.amount >= item.startPrice) {
               const itemUpdate = { 
                  buyPrice: item.startPrice, 
                  bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
                  currBidderId: userId, 
                  currBidAmount: action.amount, 
                  currActionId: action.id,
                  numberOfBids: numberOfBids, 
                  lastUserActivityDate: processedDate, 
                  dropDoneDate: dropDoneDate,
                  status: ItemMgr.STATUS_DROPPING,
               }
               bidResult.firstBid(itemUpdate, dropDoneDate) 
            }
         }
         else if (action.amount <= item.buyPrice) {
            const itemUpdate = { bidderIds: admin.firestore.FieldValue.arrayUnion(action.userId), numberOfBids: numberOfBids }
            bidResult.outbid(itemUpdate, dropDoneDate)    
         }
         else if (userId === item.currBidderId) {
            if (action.amount > item.currBidAmount) {
               // high bidder is bumping higher - does not impact buyPrice or dropDoneDate
               const prevActionId = item.currActionId 
               const itemUpdate = { 
                  currBidAmount: action.amount, 
                  currActionId: action.id,
                  numberOfBids: numberOfBids, 
                  lastUserActivityDate: processedDate, 
               }
               bidResult.highBidIncreased(itemUpdate, prevActionId ) 
            }
         }
         else if (action.amount > item.currBidAmount) {
            // new high bidder
            const prevActionId = item.currActionId
            const buyPrice = Math.min(action.amount, item.currBidAmount + 25)
            const itemUpdate = { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               currBidderId: userId, 
               currBidAmount: action.amount, 
               currActionId: action.id,
               numberOfBids: numberOfBids, 
               lastUserActivityDate: processedDate, 
               dropDoneDate: dropDoneDate,
            }
            bidResult.highBid(itemUpdate, dropDoneDate, prevActionId) 
         }
         else {
            // curr bidder still high bidder, dropDoneDate reset, and new bid is outbid
            const buyPrice = Math.min(action.amount + 25, item.currBidAmount)
            const itemUpdate = { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               numberOfBids: numberOfBids, 
               lastUserActivityDate: processedDate, 
               dropDoneDate: dropDoneDate,
            }
            bidResult.outbid(itemUpdate, dropDoneDate) 
         }
         
         const promises = []            
         if (bidResult.itemUpdate) {
            processingState = log.returnInfo("Updating " + itemDesc)
            promises.push(itemRef.update(bidResult.itemUpdate))
         }
         else { log.info("WARN: Bid on " + itemDesc + " did not result in an itemUpdate") }

         // set timer 
         if (bidResult.timerExpireDate) {
            const timerId = "i-" + itemId
            processingState = log.returnInfo("Setting timer[id: " + timerId + "]")
            const timerRef = this.db.collection("timers").doc(timerId)
            const timer = { id: timerId, itemId: itemId, expireDate: bidResult.timerExpireDate }
            promises.push(timerRef.set(timer))
         }

         // update previous Action
         if (bidResult.prevActionId) {
            processingState = log.returnInfo("Updating previous action[id: " + bidResult.prevActionId + "]")
            const prevActionRef = this.db.collection("actions").doc(bidResult.prevActionId)
            promises.push(prevActionRef.update({ actionResult: bidResult.prevActionResult }))
         }
            
         // update this action
         if (bidResult.actionResult) {
            processingState = log.returnInfo("Updating snapshot action")
            promises.push(this.updateAction(action, snapshot, processedDate, bidResult.actionResult))
         }

         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }

   processPurchaseRequest(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.processPurchaseRequest")
      const itemId = action.itemId
      const userId = action.userId
      
      const itemDesc = "item[id: " + itemId + "]"
      processingState = log.returnInfo("Processing purchase request  " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId)
      return itemRef.get().then(doc => {
         if (!doc.exists) { return log.error("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return log.error("Doc.data does not exist for " + itemDesc) }
   
         const processedDate = Date.now()
         const promises = []
         if (!item.buyPrice || item.buyPrice === 0) {
            const itemUpdate = { 
               buyDate: processedDate, 
               buyPrice: item.startPrice, 
               buyerId: userId, 
               lastUserActivityDate: processedDate, 
               status: ItemMgr.STATUS_HOLD
            }

            processingState = log.returnInfo("Updating " + itemDesc, itemUpdate)
            promises.push(itemRef.update(itemUpdate))         
            promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_PURCHASED))
            promises.push(this.emailer.sendConfiguredEmail(userId, EmailMgr.TYPE_PURCHASE_SUCCESS, itemId, item.name)) 
         }
         else { 
            promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_ALREADY_SOLD))
            promises.push(this.emailer.sendConfiguredEmail(userId, EmailMgr.TYPE_PURCHASE_FAIL, itemId, item.name)) 
         }
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }

   updateAction(action:any, snapshot:any, processedDate:any, actionResult:string) { 
      console.log("Updating " + desc(action))
      return snapshot.ref.update({ 
         status: Action.STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult })
   }  
}

function desc(action:any) { return "actions[id: " + action.id + ", actionType: " + action.actionType + "]" }     
   
class BidResult {
   actionResult: string
   itemUpdate: any
   timerExpireDate: number
   prevActionId: string
   prevActionResult: string
   
   firstBid(itemUpdate: any, timerExpireDate: number) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
   }

   highBid(itemUpdate: any, timerExpireDate: number, prevActionId: string) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
      this.prevActionId = prevActionId
      this.prevActionResult = Action.RESULT_OUTBID
   }

   highBidIncreased(itemUpdate: any, prevActionId: string) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.prevActionId = prevActionId
      this.prevActionResult = Action.RESULT_INCREASED
   }

   outbid(itemUpdate: any, timerExpireDate: number) {
      this.actionResult = Action.RESULT_OUTBID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
   }
}
