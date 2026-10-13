from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape,A4
import pypdfium2 as pdf
file='docs/qa/import-existing.pdf'
c=canvas.Canvas(file,pagesize=landscape(A4));c.setFont('Helvetica-Bold',15);c.drawString(40,550,'Fictional existing merchant history - QA only')
xs=[40,200,320,440,540,660]
rows=[['Merchant name','Opening balance','Date','Payment','Reference','Balance'],['Fictional Shop','5000','2025-10-14','1000','OLD-001','4000'],['Fictional Shop','','2026-10-01','500','OLD-002','3500']]
for i,row in enumerate(rows):
 c.setFont('Helvetica-Bold' if i==0 else 'Helvetica',11)
 for x,value in zip(xs,row):c.drawString(x,500-i*28,value)
c.save();d=pdf.PdfDocument(file);d[0].render(scale=1.2).to_pil().save('docs/qa/import-existing-page-1.png')
print('Fictional PDF import file created and rendered.')
