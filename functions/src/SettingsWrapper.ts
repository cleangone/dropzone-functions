"use strict"

export class SettingsWrapper {
   settings: any  
   
   constructor() {
      this.settings = { 
         siteUrl: "http://drop.4th.host/",
         fromEmail: "Dropzone <dropzone@4th.host>", 
         bidAdditionalTime: 45
      }
   }

   setSettings(settings: any) { this.settings = settings }

   fromEmail() { return this.settings.fromEmail }
   siteLink(text: string) { return this.anchor(text) }
   itemLink(itemId: string, itemName: string) { return this.anchor(itemName, "#/item/" + itemId) }
   bidAdditionalSeconds() { return this.settings.bidAdditionalTime }
   anchor(text: string, page: string="") { 
      return "<a href=" + this.settings.siteUrl + (this.settings.siteUrl.endsWith("/") ? "" : "/") + page + ">" + text + "</a>"
   }
}