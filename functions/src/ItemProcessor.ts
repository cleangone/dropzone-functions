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

   async processItemUpdate(change: any, itemId: string) {
      let itemDesc = "item[id: " + itemId + "]"
      let processingState = log.returnInfo("processItemUpdate: " + itemDesc)
      
      // only interested in updates that change status to Available
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
