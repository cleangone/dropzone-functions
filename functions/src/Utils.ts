
import { uuid } from 'uuidv4'
import * as moment from 'moment'

export class Uid {
   public static dateUid()  { return formatDate(Date.now(), 'MM-DD-YY-') + this.uid() }
   public static uid()  { return uuid() }
}

export function dollars(amount: number) {
   return amount ? "$" + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
}

export function format_M_DD_YY(inputDate: any)    { return formatDate(toMillis(inputDate), 'M/D/YY') }
export function format_MMM_D_YYYY(inputDate: any) { return formatDate(toMillis(inputDate), 'MMM D, YYYY') }

function formatDate(millis: number, format: string)   {return millis ? moment(millis).format(format) : "" }
function toMillis(inputDate:any) {
   if (!inputDate) { return inputDate }
   return inputDate.seconds ? inputDate.seconds*1000 : inputDate
}


