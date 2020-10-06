
import { uuid } from 'uuidv4'

export class Uid {
   // todo - add mm_dd_yy_ prefix
   public static dateUid()  { return this.uid() }
   public static uid()  { return uuid() }
}


