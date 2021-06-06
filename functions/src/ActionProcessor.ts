import * as admin from 'firebase-admin'
import { BidProcessor } from "./BidProcessor"
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { Action, EmailMgr, ItemMgr, InvoiceMgr, UserMgr } from "./Managers"
import { Uid } from "./Utils"
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
      else if (action.actionType === Action.TYPE_INVOICE_PAY)   { return this.processInvoicePayment(action, snapshot) }
      else if (action.actionType === Action.TYPE_VERIFY_EMAIL)  { return this.verifyEmail(action, snapshot) }
      else if (action.actionType === Action.TYPE_CONFIRM_EMAIL) { return this.confirmEmailVerification(action, snapshot) }
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
         else if (item.status === ItemMgr.STATUS_HOLD || item.status === ItemMgr.STATUS_SOLD) {
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
         
         const emailedUsers = new Set()
         emailedUsers.add(userId)
         for (let purchaseReq of item.purchaseReqs) {            
            // email sorrys - note that a user could have made multiple purchase reqs
            if (!emailedUsers.has(purchaseReq.userId)) {
               promises.push(this.emailer.sendConfiguredEmail(purchaseReq.userId, EmailMgr.TYPE_PURCHASE_FAIL, itemId, item.name))
               emailedUsers.add(purchaseReq.userId)
            }

            // update purchaseRequest actions
            const actionResult = purchaseReq.actionId === acceptedActionId ? Action.RESULT_PURCHASED : Action.RESULT_ALREADY_SOLD
            const actionUpdate = { status: Action.STATUS_PROCESSED, processedDate: processedDate, actionResult: actionResult } 
            processingState = log.returnInfo("Updating actions[id: " + purchaseReq.actionId + "]", actionUpdate)
            
            const actionRef = this.db.collection("actions").doc(purchaseReq.actionId)
            promises.push(actionRef.update(actionUpdate))         
         }
          
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }

   processInvoicePayment(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.processInvoicePayment")
      const invoiceId = action.invoiceId
      
      const invoiceDesc = "invoice[id: " + invoiceId + "]"
      processingState = log.returnInfo("Processing payment for " + invoiceDesc)
      const invoiceRef = this.db.collection("invoices").doc(invoiceId)
      return invoiceRef.get().then(doc => {
         const invoice = this.getDocData(doc, invoiceDesc)
         const processedDate = Date.now()
         const promises = []
                  
         // todo - implement partial payments
         const prevAmountPaid = invoice.amountPaid ? invoice.amountPaid : 0
         invoice.status = InvoiceMgr.STATUS_PAID_FULL
         invoice.paidDate = processedDate
         invoice.amountPaid = prevAmountPaid + action.amount
         invoice.history.push({ date: processedDate, status: InvoiceMgr.STATUS_PAID_FULL })
         
         if (action.paypal && action.paypal.shipping) {
            invoice.shipping.paypal = action.paypal.shipping
         }

         processingState = log.returnInfo("Updating " + invoiceDesc, invoice)
         promises.push(invoiceRef.update(invoice))         
         
         promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_PAID_FULL))
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }  

   verifyEmail(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.verifyEmail")
      const userId = action.userId
      
      const userDesc = "user[id: " + userId + "]"
      processingState = log.returnInfo("Verifying email for " + userDesc)
      const userRef = this.db.collection("users").doc(userId)
      return userRef.get().then(doc => {
         const user = this.getDocData(doc, userDesc)
         const processedDate = Date.now()
         const promises = []

         const verifyToken = Uid.uid() 
         const emailVerificationToken = { email: UserMgr.getEmail(user), verifyToken: verifyToken, confirmToken: Uid.uid() }
         const userUpdate = { emailVerificationTokens: admin.firestore.FieldValue.arrayUnion(emailVerificationToken) }
         promises.push(userRef.update(userUpdate)) 
         
         const text = this.settingsWrapper.companyName() + " email verification"
         const link = this.settingsWrapper.anchor(text, "verify/" + userId + "/" + verifyToken)   
         const htmlMsg = "Click the below link to verify email<br><br>" + link
         promises.push(this.emailer.sendEmail(userId, "Verify Email", htmlMsg)) 

         promises.push(this.updateAction(action, snapshot, processedDate, Action.RESULT_VERIFY_SENT))
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })  
   }  

   confirmEmailVerification(action: any, snapshot: any) {
      let processingState = log.returnInfo("ActionProcessor.confirmEmailVerification")
      const userId = action.userId
      const confirmToken = action.token
      
      const userDesc = "user[id: " + userId + "]"
      processingState = log.returnInfo("Confirming email verification for " + userDesc)
      const userRef = this.db.collection("users").doc(userId)
      return userRef.get().then(doc => {
         const user = this.getDocData(doc, userDesc)
         const email = UserMgr.getEmail(user)
         const processedDate = Date.now()
         const promises = []

         let result = Action.RESULT_EMAIL_NOT_VERIFIED
         if (user.emailVerificationTokens) {
            for (const verificationToken of user.emailVerificationTokens) {
               if (verificationToken.confirmToken == confirmToken && verificationToken.email == email) { 
                  processingState = log.returnInfo("Verifying " + userDesc + " email " + email)
                  const userUpdate = { verifiedEmail: email }
                  result = Action.RESULT_EMAIL_VERIFIED
                  promises.push(userRef.update(userUpdate)) 
               }
            }
         }
         
         promises.push(this.updateAction(action, snapshot, processedDate, result))
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
 
