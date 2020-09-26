import * as admin from 'firebase-admin'
import { Log } from "./Log"

"use strict"
const log = new Log()

export class ItemProcessor {
   storage: admin.storage.Storage
   
   constructor(storage: admin.storage.Storage) {
      log.info("ItemProcessor.constructor")
      this.storage = storage
   }

   async processItem(change: any, itemId: string) {
      if (!change.after.exists) { return this.processItemDelete(change, itemId) }
      return null
   }

   async processItemDelete(change: any, itemId: string) {
      const itemDesc = "item[id: " + itemId + "]"
      let processingState = log.returnInfo("processItemDelete: " + itemDesc)
      
      const item = change.before.data()
      if (!item) { return log.error(itemDesc + " before.data does not exist") }
      
      try {
         const promises = []
         const bucket = this.storage.bucket()
         
         processingState = log.returnInfo("Deleting " + item.imageFilePath)
         promises.push(bucket.file(item.imageFilePath).delete())

         processingState = log.returnInfo("Deleting " + item.thumbFilePath)
         promises.push(bucket.file(item.thumbFilePath).delete())

         return Promise.all(promises)
      }
      catch(error) { return log.error("Error in " + processingState, error) }
   }
}
