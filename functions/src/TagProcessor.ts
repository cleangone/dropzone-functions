import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

"use strict"
const log = functions.logger

export class TagProcessor {
   db: admin.firestore.Firestore

   constructor(db: admin.firestore.Firestore) {
      this.db = db
   }

   // handle changes in tag.name
   async processTag(change: any, tagId: string) {
      let tagDesc = "tag[id: " + tagId + "]"
      if (!change.after.exists) { 
         return logInfo("Bypassing deleted " + tagDesc)
      } 

      if (!change.before.exists) { 
         return logInfo("Bypassing created " + tagDesc)
      } 

      const tag = change.after.data();
      if (!tag) { return logError(tagDesc + " data does not exist") }

      const previousTag = change.before.data();
      if (!previousTag) { return logError(tagDesc + " previous version data does not exist") }

      if ((tag.name === previousTag.name) && (tag.category === previousTag.category)) { 
         return logInfo("Bypassing " + tagDesc + " because name and category have not changed")
      } 
      
      // todo - itemIds map needs to be reversed - map keys are indexed
      tagDesc = "tag[id: " + tagId + ", name: " + tag.name + "]"
      let processingState = logInfo("Getting items with " + tagDesc)
      const itemCollection = this.db.collection("items")
      const itemQueryRef = itemCollection.where("tagIds." + tag.category, "==", tagId)
      return itemQueryRef.get().then(function(querySnapshot) {
         processingState = logInfo("Iterating through items")
         const promises:any = [] 
         
         querySnapshot.forEach(function(doc) {
            if (!doc.exists) { throw new Error("Doc does not exist for item") }
            const item = doc.data()
            if (!item) { throw new Error("Doc.data does not exist for item") }
   
            const itemDesc = "item[id: " + item.id + ", name: " + item.name + "]"
            processingState = logInfo("Updating " + itemDesc)

            item.tagNames[tag.category] = tag.name
            const itemRef = itemCollection.doc(item.id);
            promises.push(itemRef.update({tagNames: item.tagNames }))         
         })

         if (promises.length === 0) { logInfo("No items to update") }
         return Promise.all(promises)
      })
      .catch(error => { return logError("Error in " + processingState, error) })      
   }
}

function logInfo(msg: string) {
   log.info(msg)
   return msg
}

function logError(msg: string, error: any = null) {
   if (error) { log.error(msg, error)}
   else { log.error(msg) }

   return msg
}