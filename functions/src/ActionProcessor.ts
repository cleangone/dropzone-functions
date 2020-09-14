import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"

const ACTION_TYPE_BID            = 'Bid'
const ACTION_TYPE_PURCHASE_REQ   = 'Purchase Request'

const ACTION_STATUS_PROCESSED    = 'Processed'
const ACTION_RESULT_HIGH_BID     = 'High Bid'
const ACTION_RESULT_INCREASED    = 'Increased'
const ACTION_RESULT_OUTBID       = 'Outbid'
const ACTION_RESULT_PURCHASED    = 'Purchased'
const ACTION_RESULT_ALREADY_SOLD = 'Already Sold'

const ITEM_STATUS_DROPPING = 'Dropping'
const ITEM_STATUS_HOLD     = 'On Hold'

const EMAIL_PURCHASE_SUCCESS = 'emailPurchaseSuccess'
const EMAIL_PURCHASE_FAIL    = 'emailPurchaseFail'

"use strict"
const log = functions.logger

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
      if (!action) { return logError("Action does not exist") }
      
      if (action.actionType === ACTION_TYPE_BID || action.actionType === ACTION_TYPE_PURCHASE_REQ) {
         if (!action.itemId) { return logError("action.itemId does not exist") }
         if (!action.userId) { return logError("action.userId does not exist") }
      }

      log.info("Processing " + desc(action))
      if (action.actionType === ACTION_TYPE_BID) {
         return this.processBid(action, snapshot)
      }
      else if (action.actionType === ACTION_TYPE_PURCHASE_REQ) {
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
      let processingState = "Getting " + itemDesc
      log.info(processingState)
      const itemRef = this.db.collection("items").doc(itemId);
      return itemRef.get().then(doc => {
         if (!doc.exists) { return logError("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return logError("Doc.data does not exist for " + itemDesc) }
   
         processingState = "Generating bidResults for " + itemDesc
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
                  status: ITEM_STATUS_DROPPING,
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
            processingState = "Updating " + itemDesc
            log.info(processingState)
            promises.push(itemRef.update(bidResult.itemUpdate))
         }

         // set timer 
         if (bidResult.timerExpireDate) {
            const timerId = "i-" + itemId
            processingState = "Setting timer[id: " + timerId + "]"
            log.info(processingState)
            const timerRef = this.db.collection("timers").doc(timerId)
            const timer = { id: timerId, itemId: itemId, expireDate: bidResult.timerExpireDate }
            promises.push(timerRef.set(timer))
         }

         // update previous Action
         if (bidResult.prevActionId) {
            processingState = " Updating previous action[id: " + bidResult.prevActionId + "]"
            log.info(processingState)
            const prevActionRef = this.db.collection("actions").doc(bidResult.prevActionId)
            promises.push(prevActionRef.update({ actionResult: bidResult.prevActionResult }))
         }
            
         // update this action
         if (bidResult.actionResult) {
            processingState = "Updating snapshot action"
            log.info(processingState)
            promises.push(this.updateAction(action, snapshot, processedDate, bidResult.actionResult))
         }

         return Promise.all(promises)
      })
      .catch(error => { return logError("Error in " + processingState, error) })  
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
         const promises = []
         if (item.buyPrice === 0) {
            const itemUpdate = { 
               buyPrice: item.startPrice, 
               buyerId: userId, 
               lastUserActivityDate: processedDate, 
               status: ITEM_STATUS_HOLD
            }

            log.info("Updating " + itemDesc)
            promises.push(itemRef.update(itemUpdate).catch(error => { return logError("Error updating " + itemDesc, error) }))         
            promises.push(this.updateAction(action, snapshot, processedDate, ACTION_RESULT_PURCHASED))
            promises.push(this.emailer.sendConfiguredEmail(userId, EMAIL_PURCHASE_SUCCESS, itemId, item.name)) 
         }
         else { 
            promises.push(this.updateAction(action, snapshot, processedDate, ACTION_RESULT_ALREADY_SOLD))
            promises.push(this.emailer.sendConfiguredEmail(userId, EMAIL_PURCHASE_FAIL, itemId, item.name)) 
         }
         return Promise.all(promises)
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

class BidResult {
   actionResult: string
   itemUpdate: any
   timerExpireDate: number
   prevActionId: string
   prevActionResult: string
   
   firstBid(itemUpdate: any, timerExpireDate: number) {
      this.actionResult = ACTION_RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
   }

   highBid(itemUpdate: any, timerExpireDate: number, prevActionId: string) {
      this.actionResult = ACTION_RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
      this.prevActionId = prevActionId
      this.prevActionResult = ACTION_RESULT_OUTBID
   }

   highBidIncreased(itemUpdate: any, prevActionId: string) {
      this.actionResult = ACTION_RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.prevActionId = prevActionId
      this.prevActionResult = ACTION_RESULT_INCREASED
   }

   outbid(itemUpdate: any, timerExpireDate: number) {
      this.actionResult = ACTION_RESULT_OUTBID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
   }
}
