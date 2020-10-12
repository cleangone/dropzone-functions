import * as admin from 'firebase-admin'
const Nexmo = require('nexmo')  // import caused signature/compile issues
import { SmsMgr } from "./Managers"
import { Config } from "./Config"  
import { Uid } from "./Utils"
import { Log } from "./Log"
 
const nexmo = new Nexmo({ apiKey: Config.NEXMO_KEY, apiSecret: Config.NEXMO_SECRET })
const log = new Log()

export class SmsProcessor {
   db: admin.firestore.Firestore
   
   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   async receiveSms(query:any) {
      const incoming = query as IncomingSms
      log.info("receiveSms", incoming)
      
      const userPhone = incoming.msisdn
      let processingState = log.returnInfo("Retrieving user(s) with phone " + userPhone)
      const userQueryRef = this.db.collection("users").where("phone", "==", userPhone)
      return userQueryRef.get().then(querySnapshot => {
         const userIds:string[] = []
         querySnapshot.forEach(userDoc => {
            const user = userDoc.data()
            userIds.push(user.id)
         })

         let userId = "0"
         if (userIds.length === 1) { userId = userIds[0] }
         else if (userIds.length === 0) { log.info("No users with phone " + userPhone) }
         else {
            log.info("Multiple users with phone " + userPhone, userIds)
            userId = userIds[0]
         }
   
         const sms = { 
            id: Uid.dateUid(),
            createdDate: Date.now(),
            userId: userId,
            text: incoming.text,
            fromPhone: incoming.msisdn,
         }
         
         processingState = log.returnInfo("Saving smsInbound[" + sms.id + "]")
         const smsRef = this.db.collection("smsInbound").doc(sms.id)
         return smsRef.set(sms)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })
   }

   async sendSms(snapshot:any) {
      const sms = snapshot.data()
      if (!sms) { return log.error("sendSms: sms does not exist") }
      const smsDesc = "smsOutbound[id: " + sms.id + "]"
      
      log.returnInfo("Sending " + smsDesc)
      return nexmo.message.sendSms(Config.NEXMO_FROM, sms.userPhone, sms.text, (err:any, res:any) => {
         let update = null
         if (err) { 
            log.error(smsDesc + " send failed: " + err.error_text, err) 
            update = { status: SmsMgr.STATUS_SEND_FAILED, statusInfo: err.error_text }
         } 
         else if (res.messages[0]['status'] === "0") { update = { status: SmsMgr.STATUS_SENT } } 
         else { 
            log.error(smsDesc + " send failed: " + res.messages[0]['error-text']) 
            update = { status: SmsMgr.STATUS_SEND_FAILED, statusInfo: res.messages[0]['error-text'] }
         }
         
         log.info("Updating " + smsDesc)
         return snapshot.ref.update(update)
      })
      
   }
}

/* 
   example {
      "msisdn": "12066838543", // phone that sent the text
      "to": "18645649468", // nexmo number the text was sent to 
      "text": "Ok"
      "api-key": "2ca30243", type": "text", "keyword": "OK", "messageId": "170000028C738E02", 
      "message-timestamp": "2020-10-11 16:46:34" }
*/
interface IncomingSms {
   msisdn: string
   to: string
   text: string
   "message-timestamp": string
}

