export interface ReportDef {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  needsCompany: boolean;
  needsDate: boolean;
  needsVehicle?: boolean;
  chartTypes: string[];
  roleMin: "yetkili" | "yonetici";
}

export const REPORT_CATALOG: ReportDef[] = [
  // A — Araç & Sefer
  { id: 1,  slug: "arac-giris",          name: "Araç Giriş Raporu",         category: "Araç & Sefer",       description: "Firma araçlarının giriş kayıtları ve vardiya dağılımı",          needsCompany: true,  needsDate: true,  needsVehicle: true,  chartTypes: ["bar","donut"],        roleMin: "yetkili"  },
  { id: 2,  slug: "sefer-performans",    name: "Sefer Performans Raporu",   category: "Araç & Sefer",       description: "Planlanan / gerçekleşen sefer karşılaştırması ve gecikmeler",   needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yetkili"  },
  { id: 3,  slug: "gecikme-analizi",     name: "Gecikme Analizi",           category: "Araç & Sefer",       description: "Güzergah bazlı ortalama gecikme ve trend analizi",              needsCompany: false, needsDate: true,  chartTypes: ["bar","line"],         roleMin: "yetkili"  },
  { id: 4,  slug: "yolcu-doluluk",       name: "Yolcu Doluluk Raporu",      category: "Araç & Sefer",       description: "Araç kapasitesine göre yolcu doluluk oranları",                 needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yetkili"  },
  // B — Firma Bazlı
  { id: 5,  slug: "firma-operasyon",     name: "Firma Operasyon Özeti",     category: "Firma Bazlı",        description: "Firma başına giriş, araç ve denetim KPI özeti",                 needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yetkili"  },
  { id: 6,  slug: "firma-arac",          name: "Firma Araç Envanteri",      category: "Firma Bazlı",        description: "Firmanın aktif/pasif araç listesi ve son giriş tarihleri",      needsCompany: true,  needsDate: false, chartTypes: ["donut"],             roleMin: "yetkili"  },
  { id: 7,  slug: "giris-uyum",          name: "Giriş Uyum Raporu",         category: "Firma Bazlı",        description: "Günlük beklenen vs gerçekleşen araç girişi uyum yüzdesi",      needsCompany: true,  needsDate: true,  chartTypes: ["line"],              roleMin: "yetkili"  },
  // C — Denetim & Kalite
  { id: 8,  slug: "arac-denetim",        name: "Araç Denetim Raporu",       category: "Denetim & Kalite",   description: "Denetim sonuçları: geçti / kaldı / şartlı dağılımı",           needsCompany: true,  needsDate: true,  chartTypes: ["donut"],             roleMin: "yetkili"  },
  { id: 9,  slug: "sofor-degerlendirme", name: "Şoför Değerlendirme",        category: "Denetim & Kalite",   description: "6 boyutlu şoför performans puanları ve ortalamalar",           needsCompany: true,  needsDate: true,  chartTypes: ["bar","radar"],        roleMin: "yetkili"  },
  { id: 10, slug: "sofor-sicil",         name: "Şoför Sicil Raporu",        category: "Denetim & Kalite",   description: "Şoför olay kayıtları, kategori ve ciddiyet analizi",           needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  // D — Görev & İK
  { id: 11, slug: "personel-gorev",      name: "Personel Görev Raporu",     category: "Görev & İK",         description: "Departman bazlı görev durumu ve tamamlanma oranları",          needsCompany: false, needsDate: true,  chartTypes: ["donut","bar"],        roleMin: "yetkili"  },
  { id: 12, slug: "is-gunlukleri",       name: "İş Günlükleri Özeti",       category: "Görev & İK",         description: "Günlük çalışma kayıtları; onay durumu ve süre dağılımı",       needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  // E — Sorun & Kalite
  { id: 13, slug: "ticket-analiz",       name: "Sorun / Ticket Analizi",    category: "Sorun & Kalite",     description: "Ticket kategori, SLA uyumu ve ortalama çözüm süresi",          needsCompany: false, needsDate: true,  chartTypes: ["bar","line"],         roleMin: "yonetici" },
  { id: 14, slug: "uyari-ihlal",         name: "Uyarı & İhlal Raporu",      category: "Sorun & Kalite",     description: "Plaka bazlı uyarılar ve ciddiyet dağılımı",                    needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  // F — Güzergah & Maliyet
  { id: 15, slug: "guzergah-kullanim",   name: "Güzergah Kullanım Raporu",  category: "Güzergah & Maliyet", description: "Hat kullanım sıklığı, yolcu ortalaması ve gecikme",             needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yetkili"  },
  { id: 16, slug: "acik-guzergah",       name: "Açık Güzergah Maliyeti",    category: "Güzergah & Maliyet", description: "Açık güzergahların mesafe, süre ve fiyat bilgileri",           needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  // G — Yönetici Raporları
  { id: 17, slug: "aylik-ozet",          name: "Aylık Operasyon Özeti",     category: "Yönetici Raporları", description: "Aylık çok-KPI yönetim özeti: giriş, sefer, denetim, görev",   needsCompany: true,  needsDate: true,  chartTypes: ["bar","line","donut"], roleMin: "yonetici" },
  { id: 18, slug: "firma-kapsamli",      name: "Firma Kapsamlı Raporu",     category: "Yönetici Raporları", description: "Firma için araç, sefer, denetim ve sorun bölümleri birleşik", needsCompany: true,  needsDate: true,  chartTypes: ["bar","donut"],        roleMin: "yonetici" },
  { id: 19, slug: "filo-durum",          name: "Filo Durum Raporu",         category: "Yönetici Raporları", description: "Tüm araçların operasyonel durum ve denetim özeti",             needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  { id: 20, slug: "haftalik-bulten",     name: "Yönetici Haftalık Bülten",  category: "Yönetici Raporları", description: "Tüm firmalar için otomatik haftalık KPI özeti",                needsCompany: false, needsDate: true,  chartTypes: ["bar","line"],         roleMin: "yonetici" },
  // H — Muhasebe
  { id: 21, slug: "hakedis-tablosu",     name: "Hakediş Tablosu",           category: "Muhasebe",           description: "Dönem bazlı işleten hakediş kayıtları ve tutarları",           needsCompany: false, needsDate: true,  chartTypes: ["donut"],             roleMin: "yonetici" },
  { id: 22, slug: "isleten-cari",        name: "İşleten Cari Raporu",       category: "Muhasebe",           description: "İşleten bazlı cari hareketler; para girişi/çıkışı",             needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  { id: 23, slug: "kar-zarar-raporu",    name: "Kâr-Zarar Raporu",          category: "Muhasebe",           description: "Firma bazlı gelir/gider ve kâr karşılaştırması",                needsCompany: true,  needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  { id: 24, slug: "mutabakat-raporu",    name: "Mutabakat Raporu",          category: "Muhasebe",           description: "Dönemsel firma mutabakat tutarları ve onay durumu",             needsCompany: true,  needsDate: true,  chartTypes: ["donut"],             roleMin: "yonetici" },
  { id: 25, slug: "tahakkuk-raporu",     name: "Tahakkuk Raporu",           category: "Muhasebe",           description: "Tahakkuk aşamasındaki hakediş kayıtları",                       needsCompany: false, needsDate: true,  chartTypes: ["bar"],               roleMin: "yonetici" },
  // I — Yakıt
  { id: 26, slug: "yakit-kart-raporu",   name: "Yakıt Kart Raporu",         category: "Yakıt",              description: "Araç/işleten bazlı yakıt kartları ve toplam harcama",           needsCompany: false, needsDate: false, needsVehicle: true,  chartTypes: ["donut"],             roleMin: "yetkili"  },
  { id: 27, slug: "yakit-dolum-raporu",  name: "Yakıt Dolum Raporu",        category: "Yakıt",              description: "Dönem bazlı dolum kayıtları: litre, tutar, kilometre",         needsCompany: false, needsDate: true,  needsVehicle: true,  chartTypes: ["bar"],               roleMin: "yetkili"  },
  { id: 28, slug: "yakit-komisyon",      name: "Yakıt Komisyon Raporu",     category: "Yakıt",              description: "Akaryakıt firması bazlı dönemsel harcama özeti",                needsCompany: false, needsDate: true,  chartTypes: ["donut"],             roleMin: "yonetici" },
  // J — Filo (genişletme)
  { id: 29, slug: "filo-toplu-raporu",   name: "Filo Toplu Raporu",         category: "Filo",               description: "Kaza/ceza/arıza/lastik kayıtlarının birleşik dökümü",          needsCompany: false, needsDate: true,  needsVehicle: true,  chartTypes: ["donut"],             roleMin: "yonetici" },
  { id: 30, slug: "arac-doluluk-orani",  name: "Araç Doluluk Oranı",        category: "Filo",               description: "Filonun aktif/bakımda/pasif durum dağılımı",                    needsCompany: true,  needsDate: false, chartTypes: ["donut"],             roleMin: "yetkili"  },
  { id: 31, slug: "belge-hatirlatma",    name: "Belge Hatırlatma Raporu",   category: "Filo",               description: "30 gün içinde süresi dolacak araç ve sürücü belgeleri",         needsCompany: false, needsDate: false, chartTypes: ["bar"],               roleMin: "yetkili"  },
];

export const REPORT_CATEGORIES = [...new Set(REPORT_CATALOG.map(r => r.category))];

export function getReport(idOrSlug: string | number): ReportDef | undefined {
  const n = Number(idOrSlug);
  if (!isNaN(n) && n > 0) return REPORT_CATALOG.find(r => r.id === n);
  return REPORT_CATALOG.find(r => r.slug === String(idOrSlug));
}
