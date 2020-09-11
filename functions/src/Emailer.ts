import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { SettingsWrapper } from "./SettingsWrapper"

"use strict"
const log = functions.logger

export class Emailer {
   db: admin.firestore.Firestore
   auth: admin.auth.Auth
   settingsWrapper: SettingsWrapper

   constructor(db: admin.firestore.Firestore, auth: admin.auth.Auth, settingsWrapper: SettingsWrapper) {
      this.db = db
      this.auth = auth
      this.settingsWrapper = settingsWrapper
   }

   async sendConfiguredEmail(userId: string, field: string, itemId: string, itemName: string) {
      const subject = this.settingsWrapper.emailSubject(field)          
      const body    = this.settingsWrapper.emailBody(field)            
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
      const authUserDesc = "authUser[id: " + userId + "]"
      
      log.info("Getting " + authUserDesc)
      return this.auth.getUser(userId).then(userRecord => {
         log.info("Creating email")
         const email =  { 
            to: [userRecord.email],
            from: this.settingsWrapper.fromEmailAddress(),
            message: { subject: subject, html: htmlMsg }
         }
         return this.db.collection("emails").add(email)
         .catch(error => { throw logReturnError("Error adding Email", error) })   
      })
      .catch(error => { throw logReturnError("Error getting " + authUserDesc, error) })
   }
}

function logReturnError(msg: string, error: any) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return error
}