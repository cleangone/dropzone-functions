"use strict"

const EMAIL_SUBJECT_SUFFIX = 'Subject'
const EMAIL_BODY_SUFFIX =    'Body'

const PurchaseReqProcessingType = {
   AUTOMATIC: 'Automatic',
   MANUAL:    'Manual',
}

export class SettingsWrapper {
   settings: any  
   
   constructor() {
      // default - overridden by db read
      this.settings = { 
         siteUrl: "http://drop.4th.host/",
         fromEmail: "Dropzone <dropzone@4th.host>", 
         bidAdditionalTime: 45
      }
   }

   setSettings(settings: any) { this.settings = settings }

   fromEmailAddress() { return this.settings.fromEmail }
   emailSubject(emailType: string) { return this.settings[emailType + EMAIL_SUBJECT_SUFFIX] }
   emailBody(emailType: string)    { return this.settings[emailType + EMAIL_BODY_SUFFIX] }

   isAutomaticPurchaseReqProcessing() { return this.settings["purchaseReqProcessingType"] ==  PurchaseReqProcessingType.AUTOMATIC }

   siteLink(text: string) { return this.anchor(text) }
   itemLink(itemId: string, itemName: string) { return this.anchor(itemName, "#/item/" + itemId) }
   bidAdditionalSeconds() { return this.settings.bidAdditionalTime }
   anchor(text: string, page: string="") { 
      return "<a href=" + this.settings.siteUrl + (this.settings.siteUrl.endsWith("/") ? "" : "/") + page + ">" + text + "</a>"
   }
}