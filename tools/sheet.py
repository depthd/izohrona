from PIL import Image, ImageDraw, ImageFont
import os, math
OUT='/mnt/user-data/outputs/minimaps'
names=['de_dust2','de_mirage','de_tuscan','de_inferno','de_ancient','cs2_anubis',
       'de_cache','de_overpass','de_nuke_rmc_main','de_nuke_rmc_lower']
K=6.0                      # уменьшение относительно 2u/px  ->  12u/px на листе
ims={}
for n in names:
    im=Image.open(f'{OUT}/{n}.png').convert('RGB')
    im=im.crop((0,46,im.size[0],im.size[1]))         # снять подпись
    ims[n]=im.resize((max(1,int(im.size[0]/K)), max(1,int(im.size[1]/K))), Image.LANCZOS)
tw=max(i.size[0] for i in ims.values())+24
th=max(i.size[1] for i in ims.values())+50
cols=5; rows=math.ceil(len(names)/cols)
sheet=Image.new('RGB',(cols*tw, rows*th),(4,6,9))
d=ImageDraw.Draw(sheet)
try: f=ImageFont.load_default(size=26)
except TypeError: f=ImageFont.load_default()
for k,n in enumerate(names):
    r,c=divmod(k,cols); im=ims[n]
    x=c*tw+(tw-im.size[0])//2; y=r*th+38
    sheet.paste(im,(x,y))
    d.text((c*tw+12, r*th+8), n, fill=(226,238,247), font=f)
d.text((12, rows*th-26), 'единый масштаб 12u/px  |  сетка 256u  |  светлое = ходибельный пол, тёмное = массив, жёлтое/оранжевое = тела на полу', fill=(125,146,164), font=f)
sheet.save(f'{OUT}/_LIST_vse_karty.png')
print(sheet.size)
