import * as admin from 'firebase-admin'
import { Emailer } from "./Emailer"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class ErrorProcessor {
   db: admin.firestore.Firestore
   emailer: Emailer
   
   constructor(db: admin.firestore.Firestore, emailer: Emailer) {
      log.info("InvoiceProcessor.constructor")
      this.db = db
      this.emailer = emailer
   }

   async processError(snapshot: any) {
      const errorDoc = snapshot.data()
      if (!errorDoc) { return log.error("Error does not exist") }
      
      const emailer = this.emailer
      let processingState = log.returnInfo("Getting admin users")
      const collection = this.db.collection("users")
      const userQueryRef = collection.where("isAdmin", "==", true)
      return userQueryRef.get().then(function(querySnapshot) {
         processingState = log.returnInfo("Iterating through admin users")
         let toUser:any = null
         querySnapshot.forEach(function(doc) {
            if (!doc.exists) { throw new Error("Doc does not exist for user") }
            const user = doc.data()
            if (!user) { throw new Error("Doc.data does not exist for user") }
            if (user.errorEmail) { toUser = user }       
         })

         if (!toUser) { return log.info("No admins cofigured to receive errorEmails") }

         const subject = "Error - " +  errorDoc.title
         const htmlMsg =  errorDoc.errorType + " Error<br><br>" + errorDoc.description
         processingState = log.returnInfo("Sending error email to " + toUser.id)
         return emailer.sendEmail(toUser.id, subject, htmlMsg)      
      })
      .catch(error => { return log.error("Error in " + processingState, error) }) 
   }
}
