import * as admin from 'firebase-admin'
import { SettingsWrapper } from "./SettingsWrapper"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class SettingsGetter {
   settingsWrapper: SettingsWrapper
   settingsPromise: any

   constructor(db: admin.firestore.Firestore, settingsWrapper: SettingsWrapper) {
      this.settingsWrapper = settingsWrapper
      log.info("SettingsGetter.constructor")
      
      const settingRef = db.collection("settings").doc("0")
      log.info("Getting settings", this.settingsWrapper)
      this.settingsPromise = settingRef.get().then(doc => {
         if (!doc.exists) { return log.error("Settings Doc does not exist") }
         const settings = doc.data()
         if (!settings) { return log.error("Settings Doc.data does not exist") }
         
         this.settingsWrapper.setSettings(settings) 
         return null
      })
      .catch(error => { 
         log.error("Error getting settings", error)
         return this })  
   }

   settingsPromiseExists() { return this.settingsPromise ? true : false }
   getSettingsPromise() { return this.settingsPromise }
   resetSettingsPromise() { this.settingsPromise = null }
}
