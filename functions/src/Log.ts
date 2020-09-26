import * as functions from 'firebase-functions'

"use strict"

export class Log {
   log = functions.logger

   info(msg: string, obj: any = null) {
      this.returnInfo(msg, obj)
      return null
   }

   returnInfo(msg: string, obj: any = null) {
      if (obj) { this.log.info(msg, obj)}
      else { this.log.info(msg) }
      return msg
   }

   error(msg: string, error: any = null) {
      this.returnError(msg, error)
      return null
   }

   returnError(msg: string, error: any = null) {
      if (error) { this.log.error(msg, error)}
      else { this.log.error(msg) }
      return msg
   }  
}

