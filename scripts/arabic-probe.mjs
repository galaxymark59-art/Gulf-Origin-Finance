import {jsPDF} from 'jspdf';
import fs from 'node:fs';
const d=new jsPDF(); d.addFileToVFS('a.ttf',fs.readFileSync('public/fonts/Amiri-Regular.ttf').toString('base64')); d.addFont('a.ttf','Amiri','normal'); d.setFont('Amiri');
let y=30;
for(const [title,rtl,shape] of [['raw, LTR',false,false],['raw, R2L',true,false],['shaped, LTR',false,true],['shaped, R2L',true,true]]){
 d.setR2L(false); d.text(title,20,y); d.setR2L(rtl); const text='إيصال دفع — متجر الخليج'; d.text(shape?d.processArabic(text):text,190,y,{align:'right'}); y+=35;
}
d.save('docs/qa/arabic-probe.pdf');
