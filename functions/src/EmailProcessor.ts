import * as admin from 'firebase-admin'
import { EmailMgr, InvoiceMgr } from "./Managers"
import { Uid } from "./Utils"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class EmailProcessor {
   db: admin.firestore.Firestore
   
   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   async processEmail(change: any, emailId: string) {
      log.info("processEmail")
      const emailDesc = "emails[id: " + emailId + "]"
      if (!change.after.exists) { return log.info(emailDesc + " deleted") }
   
      const email = change.after.data()
      if (!email) { return log.error(emailDesc + " data does not exist") }   
      if (!email.delivery) { return log.info("Bypassing not yet delivered " + emailDesc) }

      log.info("Processing " + emailDesc)
      if (EmailMgr.isDeliverySuccess(email)) {
         log.info("Deleting successful " + emailDesc) 
         return change.after.ref.delete()
      }
      else if (EmailMgr.isDeliveryError(email)) {
         log.info("Creating emailError for failed " + emailDesc) 
         const emailErrorId = Uid.dateUid()
         const emailError = { 
            id: emailErrorId, 
            emailId: email.id, 
            userId: email.userId, 
            deliveryAttempts: email.delivery.attempts,
            deliveryError: email.delivery.error,
            emailSubject: email.message.subject,
            emailTo: email.to[0],
            isVisible: true,
            createdDate: Date.now()
         }

         const promises = []  
         const emailRef = this.db.collection("emailErrors").doc(emailErrorId)
         const emailErrorDesc = "emailErrors[id: " + emailErrorId + "]"
         log.info("Creating " + emailErrorDesc)
         promises.push(emailRef.set(emailError))
         
         if (email.referenceIds && email.referenceIds.invoiceId) {
            const invoiceRef = this.db.collection("invoices").doc(email.referenceIds.invoiceId)
            const invoiceDesc = "invoices[id: " + email.referenceIds.invoiceId + "]"
            const invoicePromise = invoiceRef.update({ sendStatus: InvoiceMgr.SEND_STATUS_ERROR })
               .catch(error => { throw log.returnError("Error updating " + invoiceDesc + " sendStatus", error) })
            promises.push(invoicePromise)
         }
         
         return Promise.all(promises)
      }
   }
}
