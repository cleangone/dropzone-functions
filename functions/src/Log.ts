import * as functions from 'firebase-functions'

"use strict"

export class Log {
   log = functions.logger

   error(msg: string, error: any = null) {
      if (error) { this.log.error(msg, error)}
      else { this.log.error(msg) }
   
      return null
   }
}

