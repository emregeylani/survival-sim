# survival-sim

Gerçek zamanlı evrim ve ekosistem simülasyonu. Bitki, böcek, ot oburu, et oburu, leş yiyici ve kuşlardan oluşan 6 katmanlı bir besin zinciri; mevsimler, doğal afetler ve coğrafi izolasyon ile evrimsel baskı altında çalışır.

---

## Hızlı Başlangıç

```bash
npx serve .
# veya
python -m http.server 8080
```

`index.html` doğrudan tarayıcıda açılabilir — tüm dosyalar lokal, CORS kısıtlaması yok.

---

## Dosya Yapısı

```
survival-sim/
├── index.html               # Giriş noktası, canvas kurulumu, kamera sistemi
├── style.css                # Tüm UI stilleri
│
├── engine/
│   ├── genetics.js          # Gen tanımları, mutasyon, crossover, SpatialGrid
│   ├── world.js             # Biome haritası (Perlin noise tabanlı)
│   └── loop.js              # Simülasyon döngüsü, mevsim, analitik
│
├── entities/
│   ├── Living.js            # Temel sınıf: konum, enerji, biomeMultiplier
│   ├── Plant.js             # Üretici — 3 büyüme evresi, yayılma
│   ├── Insect.js            # Birincil tüketici — kanat animasyonu, hızlı üreme
│   ├── Carcass.js           # Geçici — taze pencere (~140-200 tick), çürüme
│   ├── Animal.js            # Herbivore / Carnivore — state machine, carcass bırakır
│   ├── Scavenger.js         # Sadece taze leş, etobulardan kaçar
│   └── Bird.js              # Böcek avcısı; strength > 1.5 → herbivore dive attack
│
├── events/
│   └── disasters.js         # Meteor, volkan, buzul çağı, kuraklık
│
└── ui/
    ├── analytics.js         # Chart.js popülasyon + evrim grafikleri, Hall of Fame
    ├── panel.js             # Entity / terrain inspector
    └── controls.js          # Oynat/duraklat, hız, afet, parametre slider
```

---

## Besin Zinciri

```
Güneş
  └─► Plant
        ├─► Insect  ──────────────────► Bird
        │                                 └──► [Herbivore]  ← (strength > 1.5 evrimleşince)
        └─► Herbivore ──► Carnivore
                               │
                               ▼
                           Carcass  ◄── (her hayvan ölünce)
                               └─► Scavenger  (taze pencere içinde)
```

---

## Genetik Sistem

Her canlı **12 gen** taşır. Nesiller arası **crossover** (dominant/resesif, %10 blend) ve **mutasyon** ile evrimleşir.

| Gen | Etki |
|-----|------|
| `speed` | Hareket hızı |
| `visionRange` | Algı yarıçapı |
| `strength` | Dövüş/avlanma; Bird'de 1.5+ eşiği dive attack açar |
| `size` | Vücut büyüklüğü; enerji tüketimini artırır, dövüşte avantaj |
| `metabolism` | Enerji verimliliği (düşük = verimli) |
| `reproductionRate` | Üreme olasılığı çarpanı |
| `camouflage` | Predator algı şansını düşürür |
| `coldResistance` | Kar/dondurma biome'larında etkinlik |
| `heatResistance` | Çöl/kuraklık biome'larında etkinlik |
| `toxinResistance` | Volkanik/scorched alanlarda hayatta kalma |
| `nocturnalAdaptation` | Sonbahar/Kış enerji kaybını azaltır |
| `aquaticAdaptation` | Wetland biome'unda enerji bonusu |

### Türleşme
`maxMatingRange` çiftleşme mesafesini sınırlar. İzole kalan popülasyonlar farklı gen frekanslarına kayar. `lineageId` renk bandı ile görsel olarak ayrışır.

---

## Biyomlar

| Biyom | Kaynak | Evrimsel Baskı |
|-------|--------|----------------|
| Forest | Maksimum | — |
| Wetland | Yüksek | `aquaticAdaptation` ödüllenir |
| Grassland | Yüksek | — |
| Savanna | Orta | `speed` ödüllenir |
| Desert | Düşük | `heatResistance` gerekli |
| Snow | Düşük | `coldResistance` gerekli |
| Volcanic | Neredeyse yok | `toxinResistance` gerekli |
| Water | — | Geçilemez (Bird uçabilir) |

---

## Mevsimler

Her **500 tick**'te döner:

| Mevsim | Çarpan | Etki |
|--------|--------|------|
| 🌱 Bahar | ×1.1 | Bitki patlaması |
| ☀ Yaz | ×1.0 | Baz durum |
| 🍂 Sonbahar | ×0.75 | Artan tüketim |
| ❄ Kış | ×0.45 | Ağır baskı; `nocturnalAdaptation` avantajlı |

---

## Afetler

| Afet | Tetikleme | Etki |
|------|-----------|------|
| ☄ Meteor | Tıkla → haritaya yönlendir | Alan hasarı + biome değişimi |
| 🌋 Volkan | Tıkla → haritaya yönlendir | Kalıcı lav alanı |
| ❄ Buzul Çağı | Anında | Haritaya kar yayılır |
| ☀ Kuraklık | Anında | Yeşil alanlar kurur |

---

## Parametreler

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| Mutation Rate | 0.15 | Gen başına mutasyon olasılığı |
| Plant Spread | 0.30 | Bitki yayılma agresifliği |
| Max Herbivores | 300 | Popülasyon tavanı |
| Max Carnivores | 100 | Popülasyon tavanı |
| Max Plants | 500 | Popülasyon tavanı |
| Max Scavengers | 80 | Popülasyon tavanı |
| Max Birds | 100 | Popülasyon tavanı |
| Mating Range | 180px | Çiftleşme mesafe limiti — düşür → türleşme hızlanır |
| World Seed | Rastgele | Aynı seed = aynı harita |

---

## Kamera

| Eylem | Kontrol |
|-------|---------|
| Zoom in/out | Mouse tekerleği |
| Pan | Sol tıkla sürükle |
| Sıfırla | Çift tık |

---

## Evrimsel Gözlem İpuçları

**Türleşme:**
- `Mating Range` → 60–80 px yap → coğrafi izolasyon artar, renk bantları ayrışır
- `Mutation Rate` → 0.25+ yap → gen sürüklenmesi hızlanır

**Niche ayrışması:**
- Wetland bölgesini yakınlaştır → `aquaticAdaptation` yüksek bireyler yoğunlaşır
- Kış sonrası leş patlaması → Scavenger artışı + `nocturnalAdaptation` seçilimi
- Bird artınca Insect azalır → Herbivore üzerindeki baskı hafifler

**Bird dive attack evrimi:**
`strength > 1.5` eşiği geçince otomatik açılır. ENTITY panelinde `Dive Hunter` etiketi ve turuncu gaga highlight belirir.

---

## Teknik Notlar

- **SpatialGrid**: 80 px hücre boyutu, O(n²) → O(1) yakınlık sorgusu
- **Carcass fresh window**: ~140–200 tick; Scavenger bu süre sonra yiyemez, leş solar
- **Double-spawn koruması**: `_carcassSpawned` flag ile aynı ölümden iki Carcass oluşması engellenir
- **Render sırası**: Carcass → Plant → hareketli varlıklar
- Tüm varlıklar `ctx.save/translate/rotate/restore` ile kamera transform'undan bağımsız render edilir
