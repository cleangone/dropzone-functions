
import { uuid } from 'uuidv4'
import * as moment from 'moment'

export class Uid {
   public static dateUid()  { return moment(Date.now()).format('MM-DD-YY-') + this.uid() }
   public static uid()  { return uuid() }
}

export function dollars(amount: number) {
   return amount ? "$" + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
}


