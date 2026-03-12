# Aycan OPS — Mobil Responsive Düzeltme Promptu

Sen bir Next.js + Tailwind CSS v4 uzmanısın. Aşağıda **aycanops.agno.digital** projesinde tespit edilmiş tüm mobil responsive sorunları, etkilenen dosya/bileşen yapıları ve beklenen çıktılar detaylı biçimde verilmiştir. Her sorunu sırasıyla düzelt.

---

## Proje Bağlamı

- **Framework:** Next.js App Router (RSC + Server Components)
- **Stil:** Tailwind CSS v4 (compiled, utility-first)
- **Dil:** TypeScript + React
- **Hedef cihazlar:** iPhone SE (375px) → iPad Air (820px) → Desktop (1280px+)
- **Mevcut breakpoint'ler:** `sm:640px` `lg:1024px` `xl:1280px`
- **Eksik breakpoint:** `md:768px` (tablet için hiç kullanılmıyor)

---

## KRİTİK DÜZELTMELER (P0 — Hemen)

### [MOB-02] Sabit min-width değerleri yatay taşmaya neden oluyor

**Sorun:** Compiled CSS'te `min-w-[640px]` ve `min-w-[560px]` sınıfları tüm telefon genişliklerini (375–412px) aşıyor. Kullanıcı yatay scroll yapmak zorunda kalıyor.

**Etkilenen bileşenler:** Araçlar, Firmalar, Giriş Kontrol sayfalarındaki veri liste wrapper'ları.

**Düzeltme:** Her sabit `min-w-[Npx]` değerini bir `overflow-x-auto` sarmalayıcıya al ve değeri yalnızca tablet ve üzeri için uygula.

```tsx
// ÖNCE (yanlış):
<div className="min-w-[640px]">
  {/* tablo içeriği */}
</div>

// SONRA (doğru):
<div className="overflow-x-auto">
  <div className="min-w-[480px] md:min-w-0">
    {/* tablo içeriği */}
  </div>
</div>
```

**Kontrol:** `min-w-[640px]`, `min-w-[560px]`, `min-w-[400px]` içeren tüm JSX'i bul ve yukarıdaki pattern ile değiştir.

---

### [MOB-03] 8 sayfada overflow-x sarmalayıcı eksik

**Sorun:** Aşağıdaki sayfalarda dinamik veri listeleri JavaScript ile yüklendikten sonra dar ekranlarda taşıyor çünkü `overflow-x-auto` wrapper yok.

**Etkilenen sayfalar:**
- `/seferler`
- `/giris-kontrol`
- `/araclar`
- `/firmalar`
- `/guzergahlar`
- `/denetimler`
- `/sofor-degerlendirme`
- `/gunluk`

**Düzeltme:** Her sayfanın veri listesi bileşeninin en dış div'ini şu şekilde sar:

```tsx
// Her veri listesi için:
<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
  <div className="min-w-[480px] sm:min-w-0">
    {/* kart veya tablo listesi */}
  </div>
</div>
```

Eğer veri kartlar şeklindeyse (div-based list), sadece dış wrapper yeterlidir — iç `min-w` gerekmez.

---

## KRİTİK DÜZELTMELER (P1 — Sprint 1)

### [MOB-01] Header hamburger menüsü — hydration gecikmesinde çalışmıyor

**Sorun:** `Header` bileşeni server component olarak render ediliyor. `aria-expanded` state'i ve onClick handler'ı hydration tamamlanana kadar çalışmıyor. Yavaş cihazlarda hamburger tıklanamaz görünüyor.

**Düzeltme:**

```tsx
// components/Header.tsx — 'use client' direktifi ekle

'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Header({ user }: { user: User | null }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      {/* ... mevcut içerik ... */}

      {/* Hamburger butonu — aria-expanded doğru bağlanmalı */}
      <button
        className="lg:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
        aria-label="Menü"
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
      </button>

      {/* Mobil menü drawer */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="lg:hidden fixed inset-0 z-40 flex"
          onClick={() => setMenuOpen(false)}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />

          {/* Drawer panel */}
          <div
            className="relative ml-auto w-72 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer içeriği buraya */}
          </div>
        </div>
      )}
    </header>
  )
}
```

**Not:** Eğer Header şu an server component'se ve veri fetch ediyorsa, state'i ayrı bir `HeaderClient.tsx` client bileşenine çıkar, Header'dan import et.

---

### [MOB-04] Tablet breakpoint (md: 768px) eksik

**Sorun:** Navigasyon `hidden lg:flex` olarak tanımlı — bu 1024px altındaki tüm tabletlerde (768–1023px) hamburger menü gösteriyor. Tabletler için masaüstü navigasyonu görünmeli.

**Düzeltme 1 — Nav breakpoint'ini düşür:**

```tsx
// ÖNCE:
<nav className="hidden lg:flex items-center gap-1">

// SONRA:
<nav className="hidden md:flex items-center gap-1">
```

**Düzeltme 2 — Hamburger'ı buna göre güncelle:**

```tsx
// ÖNCE:
<button className="lg:hidden ...">

// SONRA:
<button className="md:hidden ...">
```

**Düzeltme 3 — Veri listelerinde tablet için 2 sütun:**

```tsx
// Araçlar, Firmalar gibi listelerde:
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Düzeltme 4 — Header sağ bölüm:**

```tsx
// Kullanıcı bilgisi:
<div className="hidden md:flex flex-col items-end">
```

---

### [MOB-06] Modal formlarında grid-cols-2 küçük ekranda sıkışıyor

**Sorun:** Yeni kayıt ekleme modallarında `grid-cols-2` kullanılıyor. 375px ekranda her form alanı ~170px wide — label ve input çakışıyor.

**Etkilenen modallar:** Sefer ekleme, Araç ekleme, Giriş Kontrol yeni kayıt.

**Düzeltme:** Tüm modal içi form grid'lerini responsive yap:

```tsx
// ÖNCE:
<div className="grid grid-cols-2 gap-3">

// SONRA:
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

---

## ORTA ÖNCELİKLİ DÜZELTMELER (P2 — Sprint 2)

### [MOB-05] Küçük dokunma hedefleri (28px → 44px)

**Sorun:** Header'daki butonlar `py-1 px-2` padding değerleriyle ~28px yükseklikte. Apple HIG ve WCAG 2.5.5 minimum 44×44pt gerektiriyor.

**Düzeltme:** Tüm interaktif butonlara minimum boyut ekle:

```tsx
// ÖNCE:
<button className="text-xs ... px-2 py-1 rounded border border-zinc-800">
  Çıkış
</button>

// SONRA:
<button className="text-xs ... px-3 py-2.5 min-h-[44px] rounded border border-zinc-800">
  Çıkış
</button>
```

Header'daki tüm `py-1 px-2` butonları `py-2.5 px-3 min-h-[44px]` olarak güncelle.

---

### [IOS-01] type="date" input — iOS native picker uyumsuzluğu

**Sorun:** iOS Safari `type="date"` inputları native picker ile açıyor. Seçilen değer koyu zemin üzerinde görünmüyor.

**Etkilenen sayfalar:** `/seferler`, `/giris-kontrol`, `/gunluk`

**Düzeltme — CSS override (hızlı çözüm):**

```css
/* globals.css veya ilgili component */
input[type="date"] {
  color-scheme: dark;
  -webkit-appearance: none;
  appearance: none;
  color: #fafafa;
}

input[type="date"]::-webkit-datetime-edit {
  color: #fafafa;
}

input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.6;
}
```

**Düzeltme — Kalıcı çözüm (önerilen):**

```bash
npm install react-datepicker @types/react-datepicker
```

```tsx
'use client'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

// Mevcut input[type=date] yerine:
<DatePicker
  selected={selectedDate}
  onChange={(date) => setSelectedDate(date)}
  className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg w-full focus:outline-none focus:border-zinc-600"
  dateFormat="dd.MM.yyyy"
  placeholderText="Tarih seç"
/>
```

---

### [IOS-02] `<select>` elementi — iOS custom styling sınırı

**Sorun:** iOS Safari `<select>` elementlerini tam olarak stilize etmeye izin vermiyor. Koyu tema ile görsel tutarsızlık var.

**Etkilenen sayfalar:** `/denetimler`, `/sofor-degerlendirme`

**Düzeltme:**

```bash
npm install @headlessui/react
```

```tsx
'use client'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'

// Mevcut <select> yerine:
<Listbox value={selected} onChange={setSelected}>
  <div className="relative">
    <ListboxButton className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg text-left focus:outline-none focus:border-zinc-600">
      {selected?.label ?? 'Seçiniz'}
    </ListboxButton>
    <ListboxOptions className="absolute z-10 mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
      {options.map((opt) => (
        <ListboxOption
          key={opt.value}
          value={opt}
          className="px-3 py-2 text-sm text-white hover:bg-zinc-800 cursor-pointer ui-active:bg-zinc-800"
        >
          {opt.label}
        </ListboxOption>
      ))}
    </ListboxOptions>
  </div>
</Listbox>
```

---

## DÜŞÜK ÖNCELİKLİ DÜZELTMELER (P3 — Backlog)

### [IOS-03] Login — autocomplete attribute eksik

```tsx
// app/login/page.tsx veya login formu

// ÖNCE:
<input type="text" name="username" ... />
<input type="password" name="password" ... />

// SONRA:
<input
  type="text"
  name="username"
  autoComplete="username"
  inputMode="text"
  ...
/>
<input
  type="password"
  name="password"
  autoComplete="current-password"
  ...
/>
```

---

### [IOS-04] backdrop-blur — eski cihazlarda performans

```tsx
// ÖNCE:
<header className="... backdrop-blur">

// SONRA — sadece desteklenen cihazlarda uygula:
<header className="... supports-[backdrop-filter]:backdrop-blur bg-zinc-950/95">
```

Veya globals.css'te:

```css
@supports not (backdrop-filter: blur(1px)) {
  .backdrop-blur {
    background-color: rgb(9 9 11 / 0.98); /* zinc-950 opak */
  }
}
```

---

### [MOB-07] Çıkış butonu — iOS back gesture sorunu

```tsx
// ÖNCE — form ile POST:
<form action="/api/auth/logout" method="POST">
  <button type="submit">Çıkış</button>
</form>

// SONRA — fetch ile:
<button
  onClick={async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }}
  className="..."
>
  Çıkış
</button>
```

---

### [MOB-08] Mobil drawer — safe-area-inset-bottom eksik

```tsx
// Mobil menü drawer paneli:

// ÖNCE:
<div className="relative ml-auto w-72 h-full bg-zinc-900 ... overflow-y-auto">

// SONRA — inline style veya Tailwind plugin:
<div
  className="relative ml-auto w-72 h-full bg-zinc-900 ... overflow-y-auto"
  style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
>
```

Veya `tailwindcss-safe-area` plugin'i kur:

```bash
npm install tailwindcss-safe-area
```

```tsx
<div className="... pb-safe">
```

---

## DOĞRULAMA KRİTERLERİ

Tüm düzeltmeleri uyguladıktan sonra şu senaryoları test et:

### iPhone Safari (375px — 393px)
- [ ] Sayfalar yatay scroll gerektirmiyor
- [ ] Hamburger butonuna tıklayınca drawer açılıyor
- [ ] Drawer'daki tüm menü öğeleri görünüyor (home indicator arkasında değil)
- [ ] Modal formları tek sütun gösteriyor, alanlar okunabilir
- [ ] Date picker seçili değeri gösteriyor
- [ ] Login'de şifre yöneticisi öneri balonu çıkıyor
- [ ] Çıkış butonuna tıklanabiliyor (44px hedef)

### Android Chrome (412px)
- [ ] Sayfalar yatay scroll gerektirmiyor
- [ ] Hamburger menüsü çalışıyor
- [ ] Scroll sırasında header titremesi yok (backdrop-blur)

### iPad / Tablet (768px — 820px)
- [ ] Masaüstü navigasyonu görünüyor (hamburger değil)
- [ ] Veri listeleri 2 sütun gösteriyor
- [ ] Modallar 2 sütun form gösteriyor

### Genel
- [ ] `overflow-x: hidden` body/html'de devam ediyor
- [ ] Tüm butonlar min 44×44px
- [ ] `<select>` elementleri koyu tema ile tutarlı

---

## ÖNEMLİ NOTLAR

1. `Header` bileşenini `'use client'` yaparken eğer içinde server-side veri (session/user) alıyorsa, bunu prop olarak ilet — component'i ikiye böl: `Header.tsx` (server, veri fetch) + `HeaderNav.tsx` (client, menu state).

2. Tailwind v4'te `md:` prefix'i `@media (min-width: 48rem)` (768px) anlamına gelir. `min-w-[640px]` → `md:min-w-[640px]` yaptığında bu 768px+ cihazlarda uygulanır.

3. `env(safe-area-inset-bottom)` için `<meta name="viewport">` tag'ında `viewport-fit=cover` olmalı — mevcut meta'da var, dokunma.

4. Mevcut `overflow-x:hidden` kuralı `html` elementinde var — bu global overflow'u kesiyor. Bu yüzden iç elementlerde `overflow-x-auto` sarmalayıcı mutlaka gerekli.