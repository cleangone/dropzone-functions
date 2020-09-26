import * as admin from 'firebase-admin'
import { Log } from "./Log"

"use strict"
const log = new Log()

export class TagProcessor {
   db: admin.firestore.Firestore

   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   // handle changes in tag.name
   async processTag(change: any, tagId: string) {
      let tagDesc = "tag[id: " + tagId + "]"
      if (!change.after.exists) { return log.info("Bypassing deleted " + tagDesc) } 
      if (!change.before.exists) { return log.info("Bypassing created " + tagDesc) } 

      const tag = change.after.data()
      if (!tag) { return log.error(tagDesc + " data does not exist") }

      const previousTag = change.before.data()
      if (!previousTag) { return log.error(tagDesc + " previous version data does not exist") }

      if ((tag.name === previousTag.name) && (tag.category === previousTag.category)) { 
         return log.info("Bypassing " + tagDesc + " because name and category have not changed")
      } 
      
      // todo - itemIds map needs to be reversed - map keys are indexed
      tagDesc = "tag[id: " + tagId + ", name: " + tag.name + "]"
      let processingState = log.returnInfo("Getting items with " + tagDesc)
      const itemCollection = this.db.collection("items")
      const itemQueryRef = itemCollection.where("tagIds." + tag.category, "==", tagId)
      return itemQueryRef.get().then(function(querySnapshot) {
         processingState = log.returnInfo("Iterating through items")
         const promises:any = [] 
         
         querySnapshot.forEach(function(doc) {
            if (!doc.exists) { throw new Error("Doc does not exist for item") }
            const item = doc.data()
            if (!item) { throw new Error("Doc.data does not exist for item") }
   
            const itemDesc = "item[id: " + item.id + ", name: " + item.name + "]"
            processingState = log.returnInfo("Updating " + itemDesc)

            item.tagNames[tag.category] = tag.name
            const itemRef = itemCollection.doc(item.id);
            promises.push(itemRef.update({tagNames: item.tagNames }))         
         })

         if (promises.length === 0) { log.info("No items to update") }
         return Promise.all(promises)
      })
      .catch(error => { return log.error("Error in " + processingState, error) })      
   }
}
