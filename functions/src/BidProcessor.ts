import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { Action, ItemMgr, UserMgr } from "./Managers"
import { Uid } from "./Utils"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class BidProcessor {
   db: admin.firestore.Firestore
   emailer: Emailer
   settingsWrapper: SettingsWrapper
   
   constructor(db: admin.firestore.Firestore, emailer: Emailer, settingsWrapper: SettingsWrapper) {
      log.info("BidProcessor.constructor")
      this.db = db
      this.emailer = emailer
      this.settingsWrapper = settingsWrapper
   }

   processBid(action: any, snapshot: any) {
      log.info("BidProcessor.processBid")   
      const itemId = action.itemId
      const userId = action.userId
      const bidAdditionalSeconds = this.settingsWrapper.bidAdditionalSeconds() 
      
      let itemDesc = "item[id: " + itemId + "]"
      log.info("Processing bid on " + itemDesc)
      let processingState = log.returnInfo("Getting " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId);
      return itemRef.get().then(doc => {
         if (!doc.exists) { return log.error("Doc does not exist for " + itemDesc) }
         const item = doc.data()
         if (!item) { return log.error("Doc.data does not exist for " + itemDesc) }
         itemDesc = "item[id: " + itemId + ", name:" + item.name + "]"

         const processedDate = Date.now()
         if (item.buyDate && item.buyDate !== 0) {
            processingState = log.returnInfo("Late bid on " + itemDesc)
            const lateBidUserUpdate = createAlertUpdate(item, UserMgr.ALERT_TYPE_LATE_BID)
            
            const lateBidPromises = []  
            lateBidPromises.push(this.db.collection("users").doc(userId).update(lateBidUserUpdate))
            lateBidPromises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_LATE_BID))
            return Promise.all(lateBidPromises)
         }

         processingState = log.returnInfo("Generating bidResults for " + itemDesc)
         const dropDoneDate = ItemMgr.isDrop(item) ? processedDate + bidAdditionalSeconds * 1000 : -1
         const numberOfBids = item.numberOfBids ? item.numberOfBids + 1 : 1
         const newBid = { actionId: action.id, amount: action.amount, userId: action.userId, userNickname: action.userNickname, date: action.createdDate } 

         const bidResult = new BidResult()
         if (item.buyPrice === 0) {
            log.info("First bid on " + itemDesc)
            if (action.amount >= item.startPrice) {
               const itemUpdate = ItemMgr.isDrop(item) ? { 
                  buyPrice: item.startPrice, 
                  bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
                  numberOfBids: numberOfBids, 
                  currBid: newBid, 
                  status: ItemMgr.STATUS_DROPPING,  
                  dropDoneDate: dropDoneDate,
                  lastBidReqDate: processedDate, 
               } : { 
                  buyPrice: item.startPrice, 
                  bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
                  numberOfBids: numberOfBids, 
                  currBid: newBid, 
                  status: ItemMgr.STATUS_LIVE,
                  lastBidReqDate: processedDate,
               }
               bidResult.firstBid(itemUpdate, dropDoneDate) 
            }
         }
         else if (action.amount <= item.buyPrice) {
            log.info("New bid on " + itemDesc + " is already outbid")
            const itemUpdate = { 
               bidderIds: admin.firestore.FieldValue.arrayUnion(action.userId), 
               numberOfBids: numberOfBids,
               prevBids: admin.firestore.FieldValue.arrayUnion(newBid),   
            }
            bidResult.outbid(itemUpdate, item, userId, dropDoneDate)    
         }
         else if (userId === item.currBid.userId) {
            if (action.amount > item.currBid.amount) {
               log.info("High bidder on " + itemDesc + " is raising the max bid")
               const prevActionId = item.currBid.actionId 
               const itemUpdate = { 
                  numberOfBids: numberOfBids, 
                  currBid: newBid, 
                  prevBids: admin.firestore.FieldValue.arrayUnion(item.currBid),
                  lastBidReqDate: processedDate, 
               }
               bidResult.highBidIncreased(itemUpdate, prevActionId ) 
            }
         }
         else if (action.amount > item.currBid.amount) {
            log.info("New high bidder on " + itemDesc)
            const prevActionId = item.currBid.actionId 
            const buyPrice = Math.min(action.amount, item.currBid.amount + 25)
            const itemUpdate = ItemMgr.isDrop(item) ? { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               numberOfBids: numberOfBids, 
               currBid: newBid, 
               prevBids: admin.firestore.FieldValue.arrayUnion(item.currBid),
               dropDoneDate: dropDoneDate,
               lastBidReqDate: processedDate, 
            } : { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               numberOfBids: numberOfBids, 
               currBid: newBid, 
               prevBids: admin.firestore.FieldValue.arrayUnion(item.currBid),
               lastBidReqDate: processedDate, 
            }
            bidResult.highBid(itemUpdate, item, dropDoneDate, prevActionId) 
         }
         else {
            log.info("High bidder on " + itemDesc + "being pushed higher")
            const buyPrice = Math.min(action.amount + 25, item.currBid.amount)
            const itemUpdate = ItemMgr.isDrop(item) ? { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               numberOfBids: numberOfBids, 
               prevBids: admin.firestore.FieldValue.arrayUnion(newBid),
               dropDoneDate: dropDoneDate,
               lastBidReqDate: processedDate, 
            } : { 
               buyPrice: buyPrice, 
               bidderIds: admin.firestore.FieldValue.arrayUnion(userId),
               numberOfBids: numberOfBids, 
               prevBids: admin.firestore.FieldValue.arrayUnion(newBid),
               lastBidReqDate: processedDate, 
            }

            bidResult.outbid(itemUpdate, item, userId, dropDoneDate) 
         }
         
         const promises = []            
         if (bidResult.itemUpdate) {
            processingState = log.returnInfo("Updating " + itemDesc)
            promises.push(itemRef.update(bidResult.itemUpdate))
         }
         else { log.info("WARN: Bid on " + itemDesc + " did not result in an itemUpdate") }

         if (bidResult.alertUserId) {   
            const userDesc = "user[id: " + bidResult.alertUserId + "]"
            processingState = log.returnInfo("Creating alert for " + userDesc)
            // not using subcollection because vuexfire does not support nicely
            // const alertRef = this.db.collection("users").doc(bidResult.alertUserId)
            //    .collection("alerts").doc(bidResult.userAlert.id)
            const userRef = this.db.collection("users").doc(bidResult.alertUserId)
            promises.push(userRef.update(bidResult.alertUserUpdate))
         }

         // set timer if a drop
         if (bidResult.timerExpireDate && bidResult.timerExpireDate != -1) {
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

   updateAction(action:any, snapshot:any, processedDate:any, actionResult:string) { 
      console.log("Updating " + desc(action))
      return snapshot.ref.update({ 
         status: Action.STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult })
   }  

}
  
class BidResult {
   actionResult: string
   itemUpdate: any
   timerExpireDate: number
   prevActionId: string
   prevActionResult: string
   alertUserId: string
   alertUserUpdate: any
   
   firstBid(itemUpdate: any, timerExpireDate: number) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
   }

   highBid(itemUpdate: any, item: any, timerExpireDate: number, prevActionId: string) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
      this.prevActionId = prevActionId
      this.prevActionResult = Action.RESULT_OUTBID
      this.alertUserId = item.currBid.userId
      this.alertUserUpdate = createAlertUpdate(item, UserMgr.ALERT_TYPE_OUTBID)
   }

   highBidIncreased(itemUpdate: any, prevActionId: string) {
      this.actionResult = Action.RESULT_HIGH_BID
      this.itemUpdate = itemUpdate
      this.prevActionId = prevActionId
      this.prevActionResult = Action.RESULT_INCREASED
   }

   outbid(itemUpdate: any, item: any, outbidUserId: string, timerExpireDate: number) {
      this.actionResult = Action.RESULT_OUTBID
      this.itemUpdate = itemUpdate
      this.timerExpireDate = timerExpireDate
      this.alertUserId = outbidUserId
      this.alertUserUpdate = createAlertUpdate(item, UserMgr.ALERT_TYPE_OUTBID)
   }
}

function desc(action:any) { return "action[id: " + action.id + ", actionType: " + action.actionType + "]" }     
 
function createAlertUpdate(item: any, alertType: string) {
   return  { alerts: admin.firestore.FieldValue.arrayUnion(       
      { id: Uid.dateUid(), itemId: item.id, itemName: item.name, alertType: alertType, createdDate: Date.now() }
   )}
}
