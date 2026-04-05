"""Generate favicon and social preview assets from the ASCII owl."""

import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── ASCII owl (exact source from src/shell/ui/log.ts) ────────────
OWL_LINES = [
    r"  {\_/}  ",
    r"  (O,O)  ",
    r"  (:::)  ",
    r"  -^-^v--",
]

# ── Paths ─────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "docs-site" / "public"
PUBLIC.mkdir(parents=True, exist_ok=True)

# ── Colors ────────────────────────────────────────────────────────
BG = (10, 10, 10)        # near-black background
FG = (220, 220, 220)     # light gray owl text
ACCENT = (100, 200, 255) # soft blue for social preview title

# ── Font discovery ────────────────────────────────────────────────

def mono_font(size: int) -> ImageFont.FreeTypeFont:
    """Return a monospace font at the given size, trying common macOS/Linux paths."""
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/SFMono-Regular.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def sans_font(size: int) -> ImageFont.FreeTypeFont:
    """Return a sans-serif font for titles."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFPro.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ── SVG ───────────────────────────────────────────────────────────

def generate_svg(path: Path) -> None:
    """Write an SVG that renders the owl in monospace text."""
    line_h = 16
    char_w = 9.6
    max_len = max(len(l) for l in OWL_LINES)
    w = int(char_w * max_len) + 16
    h = line_h * len(OWL_LINES) + 16
    pad_x = 8
    pad_y = line_h + 4

    text_els = "\n".join(
        f'    <text x="{pad_x}" y="{pad_y + i * line_h}">{line_to_xml(l)}</text>'
        for i, l in enumerate(OWL_LINES)
    )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <rect width="{w}" height="{h}" rx="4" fill="#0a0a0a"/>
  <g fill="#dcdcdc" font-family="Menlo,DejaVu Sans Mono,Consolas,monospace" font-size="14">
{text_els}
  </g>
</svg>"""
    path.write_text(svg)
    print(f"  {path.name}")


def line_to_xml(line: str) -> str:
    return line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ── Rasterize owl via Pillow ──────────────────────────────────────

def render_owl(size: int) -> Image.Image:
    """Render the owl at the given square pixel size."""
    # Render large, then downscale for crisp results
    scale = max(4, 512 // size)
    canvas = size * scale
    font_size = canvas // (len(OWL_LINES) + 1)
    font = mono_font(font_size)

    img = Image.new("RGBA", (canvas, canvas), (*BG, 255))
    draw = ImageDraw.Draw(img)

    # Measure total block height
    block = "\n".join(OWL_LINES)
    bbox = draw.multiline_textbbox((0, 0), block, font=font)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]

    x = (canvas - bw) // 2 - bbox[0]
    y = (canvas - bh) // 2 - bbox[1]
    draw.multiline_text((x, y), block, fill=(*FG, 255), font=font)

    return img.resize((size, size), Image.LANCZOS)


# ── ICO (multi-resolution) ────────────────────────────────────────

def build_ico(path: Path, images: list[Image.Image]) -> None:
    """Write a proper ICO file with multiple resolutions."""
    entries = []
    data_blocks = []
    offset = 6 + 16 * len(images)  # header + directory

    for img in images:
        # Convert to RGBA PNG
        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_data = buf.getvalue()

        w = img.width if img.width < 256 else 0
        h = img.height if img.height < 256 else 0
        entry = struct.pack(
            "<BBBBHHII",
            w, h,
            0,   # color palette
            0,   # reserved
            1,   # color planes
            32,  # bits per pixel
            len(png_data),
            offset,
        )
        entries.append(entry)
        data_blocks.append(png_data)
        offset += len(png_data)

    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(images)))  # ICO header
        for entry in entries:
            f.write(entry)
        for data in data_blocks:
            f.write(data)
    print(f"  {path.name}")


# ── Social preview (1280×640) ─────────────────────────────────────

def generate_social(path: Path) -> None:
    """Generate a GitHub social preview image."""
    w, h = 1280, 640
    img = Image.new("RGBA", (w, h), (*BG, 255))
    draw = ImageDraw.Draw(img)

    # Draw owl (large, left-center area)
    owl_font = mono_font(48)
    block = "\n".join(OWL_LINES)
    bbox = draw.multiline_textbbox((0, 0), block, font=owl_font)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    owl_x = w // 2 - bw // 2 - bbox[0]
    owl_y = h // 2 - bh // 2 - 60 - bbox[1]
    draw.multiline_text((owl_x, owl_y), block, fill=(*FG, 255), font=owl_font)

    # Title below owl
    title_font = sans_font(64)
    title = "kural"
    tbbox = draw.textbbox((0, 0), title, font=title_font)
    tw = tbbox[2] - tbbox[0]
    tx = (w - tw) // 2
    ty = owl_y + bh + 40
    draw.text((tx, ty), title, fill=(*ACCENT, 255), font=title_font)

    # Subtitle
    sub_font = sans_font(22)
    subtitle = 'structural scoring for TypeScript codebases'
    sbbox = draw.textbbox((0, 0), subtitle, font=sub_font)
    sw = sbbox[2] - sbbox[0]
    sx = (w - sw) // 2
    sy = ty + 80
    draw.text((sx, sy), subtitle, fill=(150, 150, 150, 255), font=sub_font)

    img.save(path, "PNG")
    print(f"  {path.name}")


# ── Main ──────────────────────────────────────────────────────────

def main() -> None:
    print("Generating icons...")

    # SVG favicon
    generate_svg(PUBLIC / "owl.svg")

    # PNGs at standard sizes
    sizes = [16, 32, 180, 192, 512]
    pngs: dict[int, Image.Image] = {}
    for s in sizes:
        img = render_owl(s)
        img.save(PUBLIC / f"owl-{s}.png", "PNG")
        pngs[s] = img
        print(f"  owl-{s}.png")

    # ICO (16 + 32)
    build_ico(PUBLIC / "favicon.ico", [pngs[16], pngs[32]])

    # Social preview
    generate_social(PUBLIC / "social-preview.png")

    print("Done!")


if __name__ == "__main__":
    main()
