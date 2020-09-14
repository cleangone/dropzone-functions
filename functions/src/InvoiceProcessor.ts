import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { SettingsWrapper } from "./SettingsWrapper"
import { SettingsGetter } from "./SettingsGetter"
import { Invoice, Item } from "./Models"
import { Log } from "./Log"

"use strict"
const log = functions.logger

export class InvoiceProcessor {
   db: admin.firestore.Firestore
   emailer: Emailer
   settingsWrapper: SettingsWrapper
   settingsGetter: SettingsGetter
   log = new Log()

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
      if (!change.after.exists) { 
         log.info(invoiceDesc + " deleted")
         return null 
      }

      const invoice = change.after.data()
      if (!invoice) { return this.log.error(invoiceDesc + " data does not exist") }

      if (Invoice.isCreated(invoice) || Invoice.isUpdated(invoice)) {
         // send email and set status to Sent
         let itemText = ''
         let itemId = null
         for (const item of invoice.items) {
            if (itemText.length === 0) { itemId = item.id }
            else {
               itemText += ", " 
               itemId = null
            }
            itemText += item.name
         }

         const subject = Invoice.isCreated(invoice) ? "Invoice" : "Updated Invoice"
         const link = itemId ? this.settingsWrapper.itemLink(itemId, itemText) : this.settingsWrapper.siteLink(itemText)
         const htmlMsg = "Here is you invoice for " + link
         
         return this.emailer.sendEmail(invoice.userId, subject, htmlMsg).then(() => {
            console.log("Updating invoice " + invoiceDesc)
            // todo - do we want to record multiple dates if resent - do through actions
            return change.after.ref.update({ status: Invoice.STATUS_SENT, sentDate: Date.now() })
         })
         .catch(error => { return this.log.error("Error sending Email", error) }) 
      } 
      else if (Invoice.isPaid(invoice)) {
         const promises = []
         for (const item of invoice.items) {
            const itemDesc = "items[id: " + item.id + "]"
            
            log.info("Updating " + itemDesc)  
            const itemRef = this.db.collection("items").doc(item.id);
            const itemPromise = itemRef.update({ status: Item.STATUS_SOLD } )
            .catch(error => { throw logReturnError("Error updating " + itemDesc, error) })
   
            promises.push(itemPromise)
         }
      
         //return Promise.all(promises).then(arrayOfPromises => {})
         return Promise.all(promises)
      }
      else if (Invoice.isShipped(invoice)) {
         // send email - may want to look at before to see if this is a change
         return null
      }
      else { 
         // new status is Shipped - no-op
         // todo - should we check if old status was Paid? Not no-op if old status was Sent
         return null
      }
   }
}

function logReturnError(msg: string, error: any) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return error
}