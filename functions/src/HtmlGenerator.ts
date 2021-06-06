import { SettingsWrapper } from "./SettingsWrapper"
import { InvoiceMgr } from "./Managers"
import { dollars, format_MMM_D_YYYY,format_M_DD_YY } from "./Utils"

export function getInvoiceHtml(invoice: any, settingsWrapper: SettingsWrapper) {
   const date = invoice.revisedDate ? 
      format_MMM_D_YYYY(invoice.revisedDate) + " (Revised)":
      format_MMM_D_YYYY(invoice.createdDate)

   const htmlSections = {
      date: div(date),
      company: div(a(settingsWrapper.companyName(), settingsWrapper.siteUrl()), right()), 
      user: div(invoice.user.fullName) + div(invoice.user.email),
      address: "",
      paypalAddress: "",
      items: "",
      total: "",
      paid: "",
      note: "",
   }

   const address = invoice.user.address
   htmlSections.address = 
      (address.address ? div(address.address) : "" ) + 
      (address.city || address.state ? 
         div((address.city ? address.city : "") + 
               (address.city && address.state ? ", " : "") + 
               (address.state ? address.state : "")
         ) : 
         "" ) + 
      (address.zip ? div(address.zip) : "" ) + 
      (address.country ? div(address.country) : "" )







   const itemRows = []
   for (const item of invoice.items) {
      itemRows.push(tr(
         td(format_M_DD_YY(item.buyDate), "width=10%") + 
         td(item.name) + 
         tdRight(dollars(item.buyPrice))))
   }
   htmlSections.items = itemRows.join("")

   const line = tr(td(hr(), "colspan=3"))
   const subtotal = tr(td("") + td("SubTotal") + tdRight(dollars(invoice.subTotal)))
   const shipping = tr(td("") + td("Shipping") + tdRight(dollars(invoice.shipping.shippingCharge)))
   const adjustment = invoice.priceAdjustment == 0 ? "" : tr(td("") + td("Adjustment") +  tdRight("(" + dollars(invoice.priceAdjustment) + ")"))
   const total = tr(td("") + td(b("Total")) + tdRight(b(dollars(invoice.total))))
   htmlSections.total = line + subtotal + shipping + adjustment + line + total 
   
   const paidLine = invoice.paidDate ? line : ""
   const amountPaid = invoice.paidDate ? tr(td("") + td("Amount Paid") + tdRight(dollars(invoice.amountPaid))) : ""
   const amountRemaing = invoice.paidDate ? tr(td("") + td(b("Amount Remaining")) + tdRight(b('0'))) : ""
   htmlSections.paid = paidLine + amountPaid + amountRemaing
   
   let note = settingsWrapper.invoiceNote()
   if (InvoiceMgr.isPaidFull(invoice)) { note = "" }
   else if (InvoiceMgr.isShipped(invoice)) {
      note = "Items shipped. "
      if (invoice.shipping.trackingLink) { 
         note += a(invoice.shipping.carrier + " - " + invoice.shipping.tracking, invoice.shipping.trackingLink) 
      }
      else {
         if (invoice.shipping.carrier) { note += invoice.shipping.carrier }
         if (invoice.shipping.carrier && invoice.shipping.tracking) { note += ", " }
         if (invoice.shipping.tracking) { note += "Tracking: " + invoice.shipping.tracking }
      }
   }
   htmlSections.note = p(note)

   return htmlSections.date + 
      htmlSections.company +
      br() + br() + 
      htmlSections.user + 
      htmlSections.address + 
      htmlSections.paypalAddress + 
      br() + 
      table(htmlSections.items + htmlSections.total + htmlSections.paid, 
         "width=100% style='border:1px solid'") +
      br() + 
      htmlSections.note
}

function a(innerHtml: string, href: string)          { return ele(innerHtml, "a", "href=" + href) }
function b(innerHtml: string)                        { return ele(innerHtml, "b") }
function br()                                        { return closedEle("br") }
function div(innerHtml: string, attr: string = "")   { return ele(innerHtml, "div", attr) }
function hr()                                        { return closedEle("hr") }
function p(innerHtml: string)                        { return ele(innerHtml, "p") }
function tr(innerHtml: string)                       { return ele(innerHtml, "tr") }
function right()                                     { return "align=right" }
function tdRight(innerHtml: string)                  { return td(innerHtml, right()) }
function td(innerHtml: string, attr: string = "")    { return ele(innerHtml, "td", attr) }
function table(innerHtml: string, attr: string = "") { return ele(innerHtml, "table", attr) }


function ele(innerHtml: string, tag: string, attr: string = "") { return openTagPrefix(tag, attr) + ">" + innerHtml + "</" + tag +">" }
function closedEle(tag: string, attr: string = "")   { return openTagPrefix(tag, attr) + "/>" }
function openTagPrefix(tag: string, attr: string)    { return "<" + tag + " " + attr }
