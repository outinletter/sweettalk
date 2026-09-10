"""SweetTalk Play Store feature graphic (1024x500) 생성 스크립트"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

W, H = 1024, 500

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# 앱 배경 그라데이션: linear-gradient(145deg,#c9b8f0,#a8c4f0,#b8d4f8,#d4e8ff)
stops = [(0.0, (201, 184, 240)), (0.4, (168, 196, 240)),
         (0.7, (184, 212, 248)), (1.0, (212, 232, 255))]

base = Image.new("RGB", (W, H))
px = base.load()
for y in range(H):
    for x in range(W):
        t = max(0.0, min(1.0, (x * 0.6 + y * 0.8) / (W + H)))
        c = stops[-1][1]
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                tt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
                c = lerp(stops[i][1], stops[i + 1][1], tt)
                break
        px[x, y] = c

# 앱의 Blobs 위젯처럼 반투명 흰 원 + 블러
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
for cx, cy, r, a in [(60, -30, 130, 38), (980, 80, 90, 34),
                     (180, 470, 100, 30), (870, 430, 60, 28)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))
bg = Image.alpha_composite(base.convert("RGBA"), ov).filter(
    ImageFilter.GaussianBlur(18)).convert("RGB")

draw = ImageDraw.Draw(bg)

# 아이콘 (rounded corner + 그림자)
icon = Image.open("assets/icon.png").convert("RGB").resize((220, 220), Image.LANCZOS)
mask = Image.new("L", (220, 220), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 219, 219], radius=52, fill=255)

shadow_mask = mask.resize((234, 234)).filter(ImageFilter.GaussianBlur(10))
bg.paste(Image.new("RGB", (234, 234), (150, 170, 235)), (89, 139), shadow_mask)
bg.paste(icon, (96, 146), mask)

def load_font(size):
    for p in [r"C:\Windows\Fonts\malgunbd.ttf", r"C:\Windows\Fonts\malgun.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

f_title = load_font(72)
f_sub = load_font(30)
f_tag = load_font(24)

tx = 380
draw.text((tx, 165), "SweetTalk", font=f_title, fill=(26, 26, 46))
# 그라데이션 언더바 (앱 grad 색상 #6a8fff → #a56bff)
for i in range(260):
    c = lerp((106, 143, 255), (165, 107, 255), i / 260)
    draw.rectangle([tx + i, 258, tx + i + 1, 266], fill=c)
draw.text((tx, 292), "AI 연인 채팅 + 영어 번역", font=f_sub, fill=(74, 74, 138))
draw.text((tx, 340), "설레는 대화, 자연스러운 영어로", font=f_tag, fill=(119, 119, 187))

out = "assets/feature-graphic-1024x500.png"
bg.save(out)
print("saved", out, bg.size)
