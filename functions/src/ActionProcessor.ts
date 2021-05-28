import * as admin from 'firebase-admin'
import { BidProcessor } from "./BidProcessor"
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
   bidProcessor: BidProcessor

   constructor(db: admin.firestore.Firestore, emailer: Emailer, settingsWrapper: SettingsWrapper) {
      log.info("ActionProcessor.constructor")
      this.db = db
      this.emailer = emailer
      this.settingsWrapper = settingsWrapper
      this.settingsGetter = new SettingsGetter(db, settingsWrapper) 
      this.bidProcessor = new BidProcessor(db, emailer)
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
         log.info("Bypassing winning bid " + desc(action)) 
         return null
      }
      else if (Action.isBid(action)) { 
         return this.bidProcessor.processBid(action, snapshot, this.settingsWrapper.bidAdditionalSeconds()) }
      else if (Action.isPurchaseRequest(action)) { return this.processPurchaseRequest(action, snapshot) }
      else if (Action.isAcceptRequest(action))   { return this.acceptPurchaseRequest(action, snapshot) }
      else {
         log.info("Bypassing " + desc(action))
         return null
      }
   }

   processPurchaseRequest(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.processPurchaseRequest")
      const itemId = action.itemId
      const userId = action.userId
      
      const itemDesc = "item[id: " + itemId + "]"
      processingState = log.returnInfo("Processing purchase request  " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId)
      return itemRef.get().then(doc => {
         const item = this.getDocData(doc, itemDesc)
         const processedDate = Date.now()
         const promises = []

         const numberOfPurchaseReqs = item.numberOfPurchaseReqs ? item.numberOfPurchaseReqs + 1 : 1
         const purchaseReq = { 
            actionId: action.id, 
            userId: userId, 
            userNickname: action.userNickname,
            amount: action.amount,
            date: processedDate,
         }

         if (this.settingsWrapper.isAutomaticPurchaseReqProcessing()) {
            log.info("Processing automatic bid on " + itemDesc)
            // todo: this is if automatic request processing
            if (!item.buyPrice || item.buyPrice === 0) {
               const itemUpdate = { 
                  buyDate: processedDate, 
                  buyPrice: item.startPrice, 
                  buyerId: userId, 
                  status: ItemMgr.STATUS_HOLD,
                  userUpdatedDate: processedDate, 
                  numberOfPurchaseReqs: numberOfPurchaseReqs, 
                  purchaseReqs: admin.firestore.FieldValue.arrayUnion(purchaseReq)
               }

               processingState = log.returnInfo("Updating " + itemDesc, itemUpdate)
               promises.push(itemRef.update(itemUpdate))         
               promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_PURCHASED))
               promises.push(this.emailer.sendConfiguredEmail(userId, EmailMgr.TYPE_PURCHASE_SUCCESS, itemId, item.name)) 
            }
            else { 

               const itemUpdate = { 
                  numberOfPurchaseReqs: numberOfPurchaseReqs,
                  purchaseReqs: admin.firestore.FieldValue.arrayUnion(purchaseReq),   
               }
               processingState = log.returnInfo("Updating " + itemDesc, itemUpdate)
               promises.push(itemRef.update(itemUpdate))
               promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_ALREADY_SOLD))
               promises.push(this.emailer.sendConfiguredEmail(userId, EmailMgr.TYPE_PURCHASE_FAIL, itemId, item.name)) 
            }
         }
         else if (item.status == ItemMgr.STATUS_HOLD || item.status == ItemMgr.STATUS_SOLD) {
            // purchase request came in after other requests processed manually
            promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_ALREADY_SOLD)) 
         }
         else {
            log.info("Queuing purchase request for " + itemDesc)
            const itemUpdate = { 
               status: ItemMgr.STATUS_REQUESTED,
               userUpdatedDate: processedDate,
               numberOfPurchaseReqs: numberOfPurchaseReqs,
               purchaseReqs: admin.firestore.FieldValue.arrayUnion(purchaseReq),   
            }
            processingState = log.returnInfo("Updating " + itemDesc, itemUpdate)
            promises.push(itemRef.update(itemUpdate))
            promises.push(this.queueAction(action, snapshot))
         }

         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }

   acceptPurchaseRequest(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.acceptPurchaseRequest")
      const itemId = action.itemId
      const userId = action.userId
      const acceptedActionId = action.refActionId
      
      const itemDesc = "item[id: " + itemId + "]"
      processingState = log.returnInfo("Processing accept purchase request for " + itemDesc)
      const itemRef = this.db.collection("items").doc(itemId)
      return itemRef.get().then(doc => {
         const item = this.getDocData(doc, itemDesc)
         const processedDate = Date.now()
         const promises = []
         
         const itemUpdate = { 
            status: ItemMgr.STATUS_HOLD,
            buyerId: userId, 
            buyerName: action.userNickname,
            buyPrice: item.startPrice,
            buyDate: processedDate, 
            acceptedPurchaseReqId: acceptedActionId,
            userUpdatedDate: processedDate, 
         }

         processingState = log.returnInfo("Updating " + itemDesc, itemUpdate)
         promises.push(itemRef.update(itemUpdate))         
         promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_PURCHASED))
         
         // email purchase confirmation 
         promises.push(this.emailer.sendConfiguredEmail(userId, EmailMgr.TYPE_PURCHASE_SUCCESS, itemId, item.name)) 
         
         let emailedUsers = new Set()
         emailedUsers.add(userId)
         for (let purchaseReq of item.purchaseReqs) {            
            // email sorrys - note that a user could have made multiple purchase reqs
            if (!emailedUsers.has(purchaseReq.userId)) {
               promises.push(this.emailer.sendConfiguredEmail(purchaseReq.userId, EmailMgr.TYPE_PURCHASE_FAIL, itemId, item.name))
               emailedUsers.add(purchaseReq.userId)
            }

            // update purchaseRequest actions
            const actionResult = purchaseReq.actionId == acceptedActionId ? Action.RESULT_PURCHASED : Action.RESULT_ALREADY_SOLD
            const actionUpdate = { status: Action.STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult } 
            processingState = log.returnInfo("Updating actions[id: " + purchaseReq.actionId + "]", actionUpdate)
            
            const actionRef = this.db.collection("actions").doc(purchaseReq.actionId)
            promises.push(actionRef.update(actionUpdate))         
         }
          
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }

   getDocData(doc: any, docDesc: string) {
      if (!doc.exists) { throw new Error("Doc does not exist for " + docDesc) }
      if (!doc.data()) { throw new Error("Doc.data does not exist for " + docDesc) }
      return doc.data()
   }

   updateAction(action:any, snapshot:any, processedDate:any, actionResult:string) { 
      console.log("Updating " + desc(action))
      return snapshot.ref.update({ 
         status: Action.STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult })
   }  

   queueAction(action:any, snapshot:any) { 
      console.log("Queuing " + desc(action))
      return snapshot.ref.update({ status: Action.STATUS_QUEUED })
   }  
}

function desc(action:any) { return "action[id: " + action.id + ", actionType: " + action.actionType + "]" }     
 
