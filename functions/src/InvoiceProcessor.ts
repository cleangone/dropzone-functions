import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { InvoiceMgr, ItemMgr } from "./Managers"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class InvoiceProcessor {
   db: admin.firestore.Firestore
   emailer: Emailer
   settingsWrapper: SettingsWrapper
   settingsGetter: SettingsGetter
   
   constructor(db: admin.firestore.Firestore, emailer: Emailer, settingsWrapper: SettingsWrapper) {
      log.info("InvoiceProcessor.constructor")
      this.db = db
      this.emailer = emailer
      this.settingsWrapper = settingsWrapper
      this.settingsGetter = new SettingsGetter(db, settingsWrapper) 
   }

   async processInvoice(change: any, invoiceId: string) {
      // log.info("processInvoice")
      if (this.settingsGetter.settingsPromiseExists()) {
         log.info("waiting for settingsPromise")
         await(this.settingsGetter.getSettingsPromise())
         log.info("settingsPromise complete", this.settingsWrapper)
         this.settingsGetter.resetSettingsPromise()
      }
      
      const invoiceDesc = "invoices[id: " + invoiceId + "]"
      if (!change.after.exists) { return log.info(invoiceDesc + " deleted") }

      const invoice = change.after.data()
      if (!invoice) { return log.error(invoiceDesc + " data does not exist") }

      if (InvoiceMgr.isSending(invoice)) {
         // send email and set status to Sent
         let subjectPrefix = ""
         if (InvoiceMgr.isPaidFull(invoice)) { subjectPrefix = "Paid - " }
         else if (InvoiceMgr.isShipped(invoice)) { subjectPrefix = "Shipped - " }
         
         const subject = subjectPrefix + invoice.name
         const htmlMsg = 
            "<table width=400px style='border:1px solid; padding:5px;'><tr><td>" + 
            invoice.html + 
            "</td></tr></table>"
         
         return this.emailer.sendInvoiceEmail(invoice.userId, subject, htmlMsg, invoice.id).then(() => {
            console.log("Updating invoice " + invoiceDesc)
            
            const processedDate = Date.now()
            let updatedStatus = invoice.status
            let historyStatus = InvoiceMgr.STATUS_SENT 

            if (InvoiceMgr.isCreated(invoice)) { updatedStatus = InvoiceMgr.STATUS_SENT }
            else if (InvoiceMgr.isRevised(invoice)) { 
               updatedStatus = InvoiceMgr.STATUS_RESENT 
               historyStatus = InvoiceMgr.STATUS_RESENT 
            }
            else { historyStatus = InvoiceMgr.STATUS_RESENT  }
            
            return change.after.ref.update({ 
               status: updatedStatus, 
               sendStatus: InvoiceMgr.SEND_STATUS_SENT, 
               sentDate: processedDate,
               history: admin.firestore.FieldValue.arrayUnion({ date: processedDate, status: historyStatus }),   
            })
         })
         .catch(error => { return log.error("Error sending Email", error) }) 
      } 
      else if (InvoiceMgr.isPaidFull(invoice)) {
         const promises = []
         for (const item of invoice.items) {
            const itemDesc = "items[id: " + item.id + "]"
            
            log.info("Updating " + itemDesc)  
            const itemRef = this.db.collection("items").doc(item.id);
            const itemPromise = itemRef.update({ status: ItemMgr.STATUS_SOLD } )
               .catch(error => { throw log.returnError("Error updating " + itemDesc, error) })
   
            promises.push(itemPromise)
         }
      
         return Promise.all(promises)
      }
      else { return null }
   }
}
