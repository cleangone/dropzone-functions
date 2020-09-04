import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

"use strict"
const log = functions.logger

export class Emailer {
   db: admin.firestore.Firestore
   auth: admin.auth.Auth

   constructor(db: admin.firestore.Firestore, auth: admin.auth.Auth ) {
      this.db = db
      this.auth = auth
   }

   async sendEmail(userId: string, subject: string, htmlMsg: string) {
      const authUserDesc = "authUser[id: " + userId + "]"
      
      log.info("Getting " + authUserDesc)
      return this.auth.getUser(userId).then(userRecord => {
         log.info("Creating email")
         const email =  { 
            to: [userRecord.email],
            from: "Dropzone <dropzone@4th.host>",
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