import * as admin from 'firebase-admin'
import { ItemMgr } from "./Managers"
import { Log } from "./Log"

"use strict"
const log = new Log()

export class ItemProcessor {
   db: admin.firestore.Firestore
   storage: admin.storage.Storage
   
   constructor(db: admin.firestore.Firestore, storage: admin.storage.Storage) {
      log.info("ItemProcessor.constructor")
      this.db = db
      this.storage = storage
   }

   async processItem(change: any, itemId: string) {
      if (!change.after.exists) { return this.processItemDelete(change, itemId) }
      else if (change.before.exists) { return this.processItemUpdate(change, itemId) }
      return null
   }

   async processItemDelete(change: any, itemId: string) {
      const itemDesc = "item[id: " + itemId + "]"
      let processingState = log.returnInfo("processItemDelete: " + itemDesc)
      
      const item = change.before.data()
      if (!item) { return log.error(itemDesc + " before.data does not exist") }
      
      try {
         const bucket = this.storage.bucket()
         const promises = []
         if (item.primaryImage) {
            processingState = log.returnInfo("Deleting file " + item.primaryImage.filePath)
            promises.push(bucket.file(item.primaryImage.filePath).delete())
   
            processingState = log.returnInfo("Deleting file " + item.primaryImage.thumbFilePath)
            promises.push(bucket.file(item.primaryImage.thumbFilePath).delete())
         }

         if (item.images) {
            for (const image of item.images) {
               processingState = log.returnInfo("Deleting file " + image.filePath)
               promises.push(bucket.file(image.filePath).delete())
      
               processingState = log.returnInfo("Deleting file " + image.thumbFilePath)
               promises.push(bucket.file(image.thumbFilePath).delete())
            }
         }
         return Promise.all(promises)
      }
      catch(error) { return log.error("Error in " + processingState, error) }
   }

   async processItemUpdate(change: any, itemId: string) {
      let itemDesc = "item[id: " + itemId + "]"
      let processingState = log.returnInfo("processItemUpdate: " + itemDesc)
      
      // delete all associated actions if change is to Available from a diff status
      const itemBefore = change.before.data()
      const item = change.after.data()
      if (!ItemMgr.isAvailable(item) || ItemMgr.isAvailable(itemBefore)) { return null }

      itemDesc = "item[id: " + itemId + ", name: " + item.name + "]"
      processingState = log.returnInfo("Processing update of item.status to Available - " + itemDesc)

      const actionCollection = this.db.collection("actions")
      const queryRef = actionCollection.where("itemId", "==", itemId)
      return queryRef.get().then(function(querySnapshot) {
         processingState = log.returnInfo("Iterating through actions with itemId = " + itemId)
         const promises:any = []
         querySnapshot.forEach(function(doc) {
            if (!doc.exists) { throw new Error("Doc does not exist for action") }
            const action = doc.data()
            if (!action) { throw new Error("Doc.data does not exist for action") }

            processingState = log.returnInfo("Deleting action[id: " + action.id + "]")
            promises.push(actionCollection.doc(action.id).delete())
         })

         return Promise.all(promises)  
      })
      .catch(error => { return log.error("Error in " + processingState, error) }) 
   }

}
