import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"

const INVOICE_CREATED = 'Created'
const INVOICE_UPDATED = 'Updated'
const INVOICE_SENT = 'Sent'
const INVOICE_PAID = 'Paid'

const ITEM_STATUS_SOLD = 'Sold'

"use strict"
const log = functions.logger

export class InvoiceProcessor {
   db: admin.firestore.Firestore
   emailer:Emailer

   constructor(db: admin.firestore.Firestore, emailer: Emailer) {
      this.db = db
      this.emailer = emailer
   }

   async processInvoice(change: any, invoiceId: string) {
      const invoiceDesc = "invoices[id: " + invoiceId + "]"
      if (!change.after.exists) { 
         log.info(invoiceDesc + " deleted")
         return null 
      }

      const invoice = change.after.data()
      if (!invoice) { return logError(invoiceDesc + " data does not exist") }

      if (invoice.status === INVOICE_SENT) { return null }      
      else if (invoice.status === INVOICE_CREATED || invoice.status === INVOICE_UPDATED) {
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

         const subject = invoice.status === INVOICE_CREATED ? "Invoice" : "Updated Invoice"
         const link = itemId ? this.emailer.itemLink(itemId, itemText) : this.emailer.siteLink(itemText)
         const htmlMsg = "Here is you invoice for " + link
         
         return this.emailer.sendEmail(invoice.userId, subject, htmlMsg).then(() => {
            console.log("Updating invoice " + invoiceDesc)
            // todo - do we want to record multiple dates if resent - do through actions
            return change.after.ref.update({ status: INVOICE_SENT, sentDate: Date.now() })
         })
         .catch(error => { return logError("Error sending Email", error) }) 
      } 
      else if (invoice.status === INVOICE_PAID) {
         const promises = []
         for (const item of invoice.items) {
            const itemDesc = "items[id: " + item.id + "]"
            
            log.info("Updating " + itemDesc)  
            const itemRef = this.db.collection("items").doc(item.id);
            const promise = itemRef.update({ status: ITEM_STATUS_SOLD } )
            .catch(error => { throw logReturnError("Error updating " + itemDesc, error) })
   
            promises.push(promise)
         }
      
         //return Promise.all(promises).then(arrayOfPromises => {})
         return Promise.all(promises)
      }
      else { 
         // new status is Shipped - no-op
         // todo - should we check if old status was Paid? Not no-op if old status was Sent
         return null
      }
   }
}
   
function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return null
}

function logReturnError(msg: string, error: any) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return error
}