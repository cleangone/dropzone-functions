// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'
// import 'firebase/storage'
// import { Config } from "./Config"
import { Log } from "./Log"

"use strict"
// const log = functions.logger
// const THUMB_ERROR_PREFIX = "Error: "


//
// todo - future - delete image files when an item is deleted
//
export class ItemProcessor {
   // storage: admin.storage.Storage
   log = new Log()

   // constructor(storage: admin.storage.Storage) {
   constructor() {
      // this.log.info("ItemProcessor.constructor")
      // this.storage = storage
   }

   // async processItem(change: any, itemId: string) {
   //    // log.info("processItem")
   //    const itemDesc = "item[id: " + itemId + "]"
   //    if (!change.after.exists) { return logInfo(itemDesc + " deleted") }

   //    const item = change.after.data()
   //    if (!item) { return logReturnError(itemDesc + " data does not exist") }
      
   //    if (!item.thumbUrl || item.thumbUrl != "") { return logInfo(itemDesc + " image/thumbnail not updated") }

   //    // there is a new thumbnail
   //    if (!item.imageName) { return this.setThumbError(change, "imageName not set") }
   //    if (!item.imageUrl.includes(item.imageName)) { return this.setThumbError(change, "imageUrl does not contain imageName") }

   //    let fileNamePrefix = item.imageUrl
   //    fileNamePrefix = fileNamePrefix.substring(0, fileNamePrefix.indexOf(item.imageName))            
   //    fileNamePrefix = fileNamePrefix.substring(fileNamePrefix.lastIndexOf("/"))
   //    fileNamePrefix = decodeURIComponent(fileNamePrefix)
   //    const dir = "/" + Config.STORAGE_BUCKET + "/"
   //    if (!fileNamePrefix.startsWith(dir)) { return this.setThumbError(change, "imageUrl file path does not start with directory path " + dirPath) }
   //    fileNamePrefix = fileNamePrefix.substring(dir.length )
   //    log.info("fileNamePrefix", fileNamePrefix)

   //    const extension = item.imageName.substring(item.imageName.lastIndexOf("."))
   //    const name = item.imageName.substring(0, item.imageName.lastIndexOf(".")) 
   //    const thumbDimensions = "_" + Config.THUMBNAIL_DIMENSION + "x" + Config.THUMBNAIL_DIMENSION
   //    const thumbnailFileName = fileNamePrefix + name + thumbDimensions + extension
   //    log.info("thumbnailFileName", thumbnailFileName)
// 
      // const bucket = this.storage.bucket(Config.STORAGE_BUCKET)
      // const file = bucket.file(Config.STORAGE_BUCKET)
      // const bucket = admin.storage().bucket(fileBucket);
      // const tempFilePath = path.join(os.tmpdir(), fileName);
      // const metadata = {
      //   contentType: contentType,
      // };
      // await bucket.file(filePath).download({destination: tempFilePath});




      // return storageRef.child(thumbnailFilePath).getDownloadURL().then(function(url) {
      //    console.log("getThumbUrl: thumbUrl", url)
      //    return url
      // })
      // .catch(function(error) {
      //    console.log("getThumbUrl: cannot get downloadURL from thumbnail " + thumbnailFilePath, error)
      //    return null
      // })
   
   
   // }

   // async setThumbError(change: any, errorText: string) {
   //    log.error(errorText)
   //    return change.after.ref.update({ thumbUrl: THUMB_ERROR_PREFIX + errorText })
   // }

 


}

// function logInfo(msg: string) {
//    log.info(msg) 
//    return null
// }

// function logReturnError(msg: string, error: any = null) {
//    if (error) { log.error(msg, error)}
//    else { log.error(msg) }

//    return error
// }