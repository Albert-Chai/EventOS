# Image prompts — KL Weekend Flavours 2026

Prompts for generating demo imagery in an external AI image tool, sized to what
the app actually crops to.

**Event brand colour: `#EC1F27`** — a hot pillar-box red. Every prompt below
describes it **in words**, never as the hex code, so the set reads as one
festival without the code ending up printed on something. See the warning below.

---

## 1. Read this first — it will save you a round of regeneration

**Don't ask the AI for text.** Every model still garbles type at small sizes, and
a banner with "CASHBAKC" on it is worse than no banner. Generate the **artwork**
with deliberate empty space, then set real type over it in Canva/Figma/Photoshop.
Each banner prompt below ends with a negative clause enforcing that.

**Never put a hex code or a placeholder word in a prompt.** Learned the hard way
on the first batch: `#EC1F27` came back *printed on eight festival banners*, and
`[CATEGORY]` came back as a stall sign reading "Lifestyle". Image models treat
any string in the prompt as a candidate to render. Describe colour in words and
substitute placeholders before you generate:

| Don't write | Write |
| --- | --- |
| `crimson #EC1F27` | `hot pillar-box red, the red of a fire engine` |
| `[CATEGORY] stall` | `a dessert stall` (substitute the real word) |
| `Zone G banners` | `plain red fabric banners, no writing` |

Adding `no writing, no signage, no text on banners` to the negative list is
cheap insurance on any shot with fabric, signage, or packaging in it.

**Sizes the app crops to.** Give the generator the aspect ratio; upscale after.

| Where | Ratio | Generate at | Notes |
| --- | --- | --- | --- |
| Sponsor banner | **3:1** | 1200×400 | `AdSlot` renders 1200×400 |
| Moments post | **4:5** | 1080×1350 | Grid view crops **square from centre** — keep the subject centred |
| Merchant cover | **3:1** | 1200×400 | Merchant detail page |
| Merchant logo | **1:1** | 512×512 | Renders at 56–72px, so it must read tiny |

**Upload limits:** PNG / JPEG / WebP / AVIF, **6 MB max**. Export JPEG q80 or
WebP — a 1200×400 PNG from most tools lands around 2–3 MB for no benefit.

**Keep the top-left corner quiet on banners.** The app overlays a white
"Sponsored" pill at `top-2 left-2`. Art with detail there will fight it.

**Aspect-ratio flags by tool**

- Midjourney: append `--ar 3:1` / `--ar 4:5` (and `--style raw` for food realism)
- ChatGPT / DALL·E: say "wide 3:1 banner" or "vertical 4:5 photo" in the sentence
- Firefly: pick the Widescreen / Portrait preset
- SDXL / Flux: set width/height directly (1216×408, 1024×1280)

**The style spine.** Paste this into any prompt that's drifting off-set:

```
Shot on a 35mm lens, warm early-evening festival light, shallow depth of field,
natural colour, slight haze from cooking smoke, authentic Malaysian street food
market atmosphere, no people looking at camera.
```

---

## 2. Sponsor banners (3:1, 1200×400)

**Use invented brand names, not real ones.** A fabricated ad for a real bank is a
misleading artifact, and real sponsors supply their own creative anyway — that's
what you're selling them. Names below are plausible-but-fictional.

### Bank / cashback — "Sinar Bank"

```
Wide 3:1 banner artwork for a Malaysian bank sponsoring a food festival.
Abstract geometric composition: overlapping soft-edged arcs and rounded
rectangles in deep pillar-box red, warm coral, and cream, on a dark charcoal
ground. Subtle paper grain. Generous empty negative space across the right two
thirds for text to be added later. Clean, modern, corporate but warm. Flat
vector style, no gradients that band. --ar 3:1
Negative: text, letters, words, numbers, logos, watermarks, faces, clutter.
```

### E-wallet / payments — "PayLaju"

```
Wide 3:1 banner artwork for a mobile payments brand at a night food market.
Bokeh of warm string lights and stall lanterns, heavily blurred, deep teal and
hot fire-engine red colour grade, dark at the left edge fading to lighter open space
on the right. Cinematic, premium, out of focus throughout so no object competes
with overlaid text. --ar 3:1
Negative: text, letters, words, logos, watermarks, sharp focal subject, people.
```

### Telco — "Nusantara Mobile"

```
Wide 3:1 banner artwork for a telco sponsoring a festival. Flowing ribbon of
light tracing a network path across a dark plum background, hot pillar-box red and
warm orange accents, particles trailing off, generous dark negative space on the
left half. Sleek, technological, energetic. --ar 3:1
Negative: text, letters, numbers, logos, watermarks, phones, devices, hands.
```

### Beverage — "Air Ria Sparkling"

```
Wide 3:1 banner artwork for a sparkling drink brand. Extreme close-up of
condensation and rising bubbles in amber-red liquid, backlit, hot pillar-box red
highlights, dark background, macro, high-end commercial beverage photography.
Composition weighted to the left third, clean open space to the right. --ar 3:1
Negative: text, letters, logos, labels, branding, watermarks, cans, bottles.
```

### Grocer / supermarket — "Segar Mart"

```
Wide 3:1 banner artwork for a fresh-produce grocer sponsoring a food festival.
Overhead flat lay on a cream linen surface: chillies, limes, lemongrass, pandan
leaves, star anise, arranged loosely along the bottom edge, hot pillar-box red and
deep green palette, soft daylight, generous empty cream space across the top two
thirds. Editorial food styling. --ar 3:1
Negative: text, letters, logos, watermarks, packaging, hands, plates.
```

---

## 3. Moments feed photos (4:5, 1080×1350)

These are visitor snapshots, so **slightly imperfect beats polished** — a photo
that looks like a stock shoot breaks the illusion of a public feed. Add
"handheld, casual phone photo" if a result looks too commercial.

Each is matched to a stall that actually exists in the event.

**Satay Bara KL**
```
Vertical 4:5 casual phone photo of Malaysian chicken satay skewers over glowing
charcoal, smoke rising, char marks, held on a paper plate with peanut sauce,
cucumber and ketupat. Night market, warm string lights bokeh behind, handheld,
slightly off-centre, natural phone camera look. --ar 4:5
Negative: watermark, text, logo, studio lighting, plastic-looking food.
```

**Cendol Kampung**
```
Vertical 4:5 casual phone photo of a tall glass of cendol — shaved ice, green
pandan jelly noodles, palm sugar syrup pooling, coconut milk — condensation on
the glass, held up against a bright hot afternoon sky at a food festival.
Handheld, vivid, natural. --ar 4:5
Negative: watermark, text, logo, studio lighting.
```

**Penang Wok Char Koay Teow**
```
Vertical 4:5 casual phone photo of char koay teow in a blazing wok, flat rice
noodles, prawns, cockles, bean sprouts, chives, visible wok flame and smoke,
street stall at night, motion blur on the flame. Handheld, warm, atmospheric.
--ar 4:5
Negative: watermark, text, logo, clean studio background.
```

**Nasi Lemak Nusantara**
```
Vertical 4:5 casual phone photo of nasi lemak opened on a banana leaf — coconut
rice, dark red sambal, fried anchovies, peanuts, boiled egg half, cucumber
slices. Overhead, on a rough wooden festival table, warm daylight. Handheld,
top-down, natural. --ar 4:5
Negative: watermark, text, logo, sterile plating.
```

**Ais Kacang Club**
```
Vertical 4:5 casual phone photo of ais kacang — a mound of shaved ice drenched in
rose syrup and palm sugar, sweetcorn, red beans, grass jelly, evaporated milk
running down, in a plastic bowl. Bright sun, vivid magenta and crimson, melting
at the edges. Handheld. --ar 4:5
Negative: watermark, text, logo.
```

**Teh Tarik Studio**
```
Vertical 4:5 casual phone photo of teh tarik being pulled — a long arc of milky
tea stretched between two metal mugs, frothy, mid-pour, motion blur on the
stream, warm stall lighting at night, hands in frame but face out of shot.
Handheld, energetic. --ar 4:5
Negative: watermark, text, logo, face, portrait.
```

**Banana Leaf Brothers**
```
Vertical 4:5 casual phone photo of a banana leaf rice meal — white rice with
several curries, papadum, pickles, dhal, spooned onto a fresh green banana leaf.
Overhead, warm indoor light, hands reaching in at the edge of frame. Handheld,
top-down. --ar 4:5
Negative: watermark, text, logo, face.
```

**Rendang Rumah Minang**
```
Vertical 4:5 casual phone photo of beef rendang in a dark clay pot, thick
caramel-brown coconut gravy clinging to the meat, toasted coconut, curry leaves,
steam rising. Rustic wooden table, moody warm side light. Handheld, close.
--ar 4:5
Negative: watermark, text, logo, bright flat lighting.
```

**Kuih Kita**
```
Vertical 4:5 casual phone photo of a tray of assorted Malaysian kuih — kuih
lapis, seri muka, onde-onde, kuih talam — pastel greens, pinks and browns,
arranged in rows on a banana leaf. Overhead, soft daylight, vivid. Handheld,
top-down. --ar 4:5
Negative: watermark, text, logo.
```

**Mamak Express**
```
Vertical 4:5 casual phone photo of roti canai being flipped — thin dough spun in
the air, flour dust caught in the light, hot griddle below, dhal and curry in
small bowls to the side. Night stall, warm tungsten light, motion blur.
Handheld. --ar 4:5
Negative: watermark, text, logo, face.
```

**Crowd / atmosphere shot** (good as the feed's "just the event" post)

> ⚠️ The first attempt at this one came back with `#EC1F27` printed across eight
> banners, because the hex code was in the prompt. This version says the colour
> in words and bans writing explicitly. Regenerate with it.

```
Vertical 4:5 casual phone photo of a busy Kuala Lumpur night food festival —
rows of lit stalls, hanging bulbs, crowds seen from behind, steam and smoke in
the air, plain unmarked pillar-box red fabric banners overhead, blue hour sky
above. Handheld, slightly noisy, authentic. --ar 4:5
Negative: watermark, text, letters, numbers, writing on banners, signage, shop
signs, readable text, recognisable faces.
```

---

## 4. Merchant covers (3:1, 1200×400)

One per category is enough — reuse across stalls in the same category.

```
Wide 3:1 header image of a CATEGORY food stall at a Malaysian night market.
Warm early-evening light, hanging bulbs, food visible on the counter, shallow
depth of field, hot pillar-box red accents in the stall canopy, blurred crowd
behind. Cinematic, editorial. --ar 3:1
Negative: text, letters, words, signage, shop signs, logos, watermarks, faces.
```

**Substitute the word before generating** — leaving a placeholder in gets you a
stall sign with the placeholder printed on it. Categories in the event: `Malay`,
`Chinese`, `Indian`, `Indian Muslim`, `Indonesian`, `Thai`, `Vietnamese`,
`Korean`, `Japanese`, `Taiwanese`, `Mexican`, `Burgers`, `Pizza`, `BBQ`,
`Bakery`, `Desserts`, `Drinks`, `Coffee`, `Snacks`, `Vegetarian`, `Lifestyle`.

## 5. Merchant logos (1:1, 512×512)

These render at **56–72px**. Anything detailed turns to mush — insist on it:

```
Simple flat vector logo mark for a Malaysian street food stall, single bold
symbol only, MOTIF, hot pillar-box red on cream, thick strokes, high contrast,
centred, generous padding, designed to stay legible at 48 pixels. Minimal,
geometric, no gradients. --ar 1:1
Negative: text, letters, words, wordmark, fine detail, thin lines, drop shadow,
photorealism, mockup, business card.
```

Motifs that survive shrinking: `a chilli`, `a coffee cup`, `a bowl of noodles`,
`a satay skewer`, `a coconut`, `a wok`, `a leaf`, `a flame`.

---

## 6. When you have the files

Send them over and I'll wire them into the demo event:

- **Banners** → creates the sponsors, books them into the five slots
  (`event_landing`, `directory_inline`, `merchant_detail`, `floor_plan`,
  `vouchers`) with flight dates, and activates them.
- **Food photos** → replaces the gradient placeholders on the existing Moments
  posts, matched to the stall each post already tags.
- **Covers / logos** → attaches to the 40 merchants by category.

Uploads go through the normal `uploadImage` seam, so they land on
server-constructed Storage paths and count against the workspace's storage
limit like any other image.
