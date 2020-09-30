import * as admin from 'firebase-admin'
import { SettingsWrapper } from "./SettingsWrapper"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class Emailer {
   db: admin.firestore.Firestore
   auth: admin.auth.Auth
   settingsWrapper: SettingsWrapper

   constructor(db: admin.firestore.Firestore, auth: admin.auth.Auth, settingsWrapper: SettingsWrapper) {
      this.db = db
      this.auth = auth
      this.settingsWrapper = settingsWrapper
   }

   async sendConfiguredEmail(userId: string, emailType: string, itemId: string, itemName: string) {
      const subject = this.settingsWrapper.emailSubject(emailType)          
      const body    = this.settingsWrapper.emailBody(emailType)            
      return this.sendItemEmail(userId, subject, body, itemId, itemName) 
   }

   async sendItemEmail(userId: string, subject: string, htmlMsg: string, itemId: string, itemName: string) {
      const linkRegex = /ITEM_LINK/gi; 
      const nameRegex = /ITEM_NAME/gi; 
      const itemLink = this.settingsWrapper.itemLink(itemId, itemName)          
      const parsedSubject = subject.replace(nameRegex, itemName)
      const parsedMsg = htmlMsg.replace(linkRegex, itemLink).replace(nameRegex, itemName)
      return this.sendEmail(userId, parsedSubject, parsedMsg)
   }

   async sendEmail(userId: string, subject: string, htmlMsg: string) {
      const userDesc = "user[id: " + userId + "]"
      let processingState = log.returnInfo("Getting " + userDesc)
      const userRef = this.db.collection("users").doc(userId)
      return userRef.get().then(doc => {
         if (!doc.exists) { return log.error("Doc does not exist for " + userDesc) }
         const user = doc.data()
         if (!user) { return log.error("Doc.data does not exist for " + userDesc) }
   
         if (!user.email) { return log.info("User " + user.authEmailCopy + " is not receiving emails") }

         processingState = log.returnInfo("Creating email")
         const email = { 
            to: [user.authEmailCopy],
            from: this.settingsWrapper.fromEmailAddress(),
            message: { subject: subject, html: htmlMsg }
         }
         return this.db.collection("emails").add(email)
         .catch(error => { throw log.returnError("Error in " + processingState, error) })   
      })
      .catch(error => { throw log.returnError("Error in " + processingState, error) })
   }
}
